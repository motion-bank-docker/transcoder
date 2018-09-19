const
  config = require('config'),
  send = require('@polka/send-type'),
  TinyEmitter = require('tiny-emitter'),
  Memcached = require('memcached'),
  { ObjectUtil } = require('mbjs-utils'),
  getMetaData = require('mbjs-media/src/util/get-metadata')

const fetchMetaData = async (annotation, user, annotationsService, api) => {
  let meta
  try {
    meta = await getMetaData(annotation, async query => {
      const results = await annotationsService.findHandler({
        query: {
          query: JSON.stringify(query)
        },
        user
      })
      return results.data
    }, config.apiKeys)
  }
  catch (e) { api.captureException(e) }
  return meta
}

class Metadata extends TinyEmitter {
  constructor (api, annotationsService) {
    super()

    this._annotations = annotationsService
    if (config.metadata.memcachedURL) this._memcached = new Memcached(config.metadata.memcachedURL)

    const _this = this

    api.app.get('/metadata/:id', async (req, res) => {
      let source, annotation
      if (req.params.id === 'url') {
        source = req.query.url
      }
      else {
        try {
          const result = await _this._annotations.getHandler(req)
          annotation = result.data
          source = annotation && annotation.body ? annotation.body.source.id : undefined
        }
        catch (e) { api.captureException(e) }
      }
      if (!source) return _this._errorResponse(res, 404)
      const key = `metadata_${ObjectUtil.slug(source)}`
      let metadata
      if (_this._memcached) {
        metadata = await new Promise((resolve, reject) => {
          _this._memcached.get(key, function (err, data) {
            if (err) api.captureException(err)
            resolve(data)
          })
        })
      }
      if (!metadata || !Object.keys(metadata).length) {
        metadata = await fetchMetaData(annotation || source, req.user, _this._annotations, api)
        if (_this._memcached && metadata && Object.keys(metadata).length) {
          await new Promise((resolve, reject) => {
            _this._memcached.set(key, metadata, parseInt(config.metadata.lifetime.toString()), err => {
              if (err) api.captureException(err)
              resolve()
            })
          })
        }
      }
      if (!metadata || !Object.keys(metadata).length) return _this._errorResponse(res, 404)
      _this._response(req, res, metadata)
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
