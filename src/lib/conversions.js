const
  config = require('config'),
  send = require('@polka/send-type'),
  os = require('os'),
  TinyEmitter = require('tiny-emitter'),
  Queue = require('bull'),
  { DateTime } = require('luxon'),
  { ObjectUtil } = require('mbjs-utils')

class Metadata extends TinyEmitter {
  constructor (app) {
    super()

    const _this = this

    this._queue = new Queue('conversions', config.conversions.redisURL)
    this._queue.process(parseInt(config.conversions.concurrency), require('./workers/convert'))

    app.post('/conversions', async (req, res) => {
      const jobId = ObjectUtil.uuid4()
      req.body.uuid = ObjectUtil.uuid4()
      _this._queue.add(req.body, { jobId })
      _this._response(req, res, { jobId })
    })

    app.get('/conversions/:id', async (req, res) => {
      const job = await _this._queue.getJob(req.params.id)
      if (!job) return _this._errorResponse(res, 404)
      const jobInfo = {
        uuid: job.id,
        source: job.data.source,
        result: job.returnvalue,
        failed: typeof job.failedReason !== 'undefined',
        attempts: job.attemptsMade,
        progress: job.progress,
        delay: job.delay,
        created: DateTime.fromMillis(job.timestamp).toISO(),
        processed: job.processedOn ? DateTime.fromMillis(job.processedOn).toISO() : undefined,
        finished: job.finishedOn ? DateTime.fromMillis(job.finishedOn).toISO() : undefined
      }
      _this._response(req, res, jobInfo)
    })
  }

  _response (req, res, data = {}) {
    this.emit('message', { method: req.method, id: data.uuid })
    if (typeof res === 'function') res({ data })
    else if (typeof res === 'undefined') return Promise.resolve({ data })
    else send(res, 200, data)
  }

  _errorResponse (res, code, message = undefined) {
    if (typeof res === 'function') res({ error: true, code })
    else if (typeof res === 'undefined') return Promise.resolve({ error: true, code })
    else send(res, code, message)
  }
}

module.exports = Metadata
