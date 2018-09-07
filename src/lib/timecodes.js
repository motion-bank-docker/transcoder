const
  config = require('config'),
  send = require('@polka/send-type'),
  TinyEmitter = require('tiny-emitter'),
  Queue = require('bull'),
  Minio = require('minio'),
  { DateTime } = require('luxon'),
  { ObjectUtil } = require('mbjs-utils')

class Timecodes extends TinyEmitter {
  constructor (api) {
    super()

    this._queue = new Queue('timecode', config.timecode.redisURL)
    this._queue.process(parseInt(config.timecode.concurrency), require('./workers/extract-ltc'))

    const opts = Object.assign({}, config.assets.client)
    opts.secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
    opts.port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
    this._minio = new Minio.Client(opts)

    const _this = this

    api.app.post('/timecodes', async (req, res) => {
      const jobId = ObjectUtil.uuid4()
      _this._queue.add(req.body, { jobId })
      _this._response(req, res, { jobId })
    })

    api.app.get('/timecodes/signals/ltc', async (req, res) => {
      const files = []
      const stream = await this._minio.listObjects('ltc', 'LTC')
      stream.on('data', obj => files.push(obj.name))
      stream.on('error', err => _this._errorResponse(res, 500, err.message))
      stream.on('end', () => {
        let port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
        let secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
        let assetHost = `${secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
        if (port !== 80 && port !== 443) assetHost += `:${port}`
        assetHost = config.assets.host || assetHost
        assetHost += '/ltc'
        _this._response(req, res, files.map(file => {
          return `${assetHost}/${file}`
        }))
      })
    })

    api.app.get('/timecodes/:id', async (req, res) => {
      const job = await _this._queue.getJob(req.params.id)
      if (!job) return _this._errorResponse(res, 404)
      const jobInfo = {
        uuid: job.id,
        source: job.data.source,
        result: job.returnvalue,
        failed: typeof job.failedReason !== 'undefined',
        failedReason: job.failedReason,
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

module.exports = Timecodes
