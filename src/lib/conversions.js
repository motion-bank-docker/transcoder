const
  config = require('config'),
  send = require('@polka/send-type'),
  path = require('path'),
  os = require('os'),
  TinyEmitter = require('tiny-emitter'),
  Queue = require('bull'),
  { ObjectUtil } = require('mbjs-utils')

class Metadata extends TinyEmitter {
  constructor (app) {
    super()

    const _this = this

    this._queue = new Queue('conversions', config.conversions.redisURL)
    this._queue.process(parseInt(config.conversions.concurrency), require('./workers/convert'))

    console.log(os.tmpdir())

    app.post('/conversions', async (req, res) => {
      const jobId = ObjectUtil.uuid4()
      req.body.uuid = ObjectUtil.uuid4()
      req.body.jobId = jobId
      _this._queue.add(req.body, { jobId })
      _this._response(req, res, req.body)
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
