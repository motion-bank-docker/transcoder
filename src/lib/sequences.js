const
  config = require('config'),
  send = require('@polka/send-type'),
  path = require('path'),
  TinyEmitter = require('tiny-emitter'),
  Queue = require('bull'),
  { DateTime } = require('luxon'),
  { ObjectUtil } = require('mbjs-utils')

class Sequences extends TinyEmitter {
  constructor (app, annotationsService, mapsService) {
    super()

    const _this = this

    this._annotations = annotationsService
    this._maps = mapsService

    this._queue = new Queue('sequences', config.sequences.redisURL)
    this._queue.process(parseInt(config.sequences.concurrency), require('./workers/concat'))

    app.post('/sequences', async (req, res) => {
      let result = await _this._maps.getHandler({
        params: {
          id: req.body.id
        },
        user: req.user
      })
      const map = result.data
      if (!map) return _this._errorResponse(res, 404)
      result = await _this._annotations.findHandler({
        query: { query: JSON.stringify({ 'target.id': `${config.api.uriBase}/piecemaker/timelines/${map.uuid}` }) },
        user: req.user
      })
      if (!result.data.items.length) return _this._errorResponse(res, 404)
      const jobId = ObjectUtil.uuid4()
      req.body.uuid = ObjectUtil.uuid4()
      req.body.map = map
      req.body.sources = result.data.items.filter(item => {
        return item.body.source.type === 'video/mp4'
      })
      if (!req.body.sources) return _this._errorResponse(res, 404)
      _this._queue.add(req.body, { jobId })
      _this._response(req, res, { jobId })
    })

    app.get('/sequences/:id', async (req, res) => {
      const job = await _this._queue.getJob(req.params.id)
      if (!job) return _this._errorResponse(res, 404)
      const jobInfo = {
        job,
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

module.exports = Sequences
