const
  config = require('config'),
  send = require('@polka/send-type'),
  TinyEmitter = require('tiny-emitter'),
  Memcached = require('memcached'),
  { ObjectUtil } = require('mbjs-utils'),
  getMetaData = require('mbjs-media/src/util/get-metadata')

const fetchMetaData = async (annotation, user, annotationsService) => {
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
  catch (e) { console.error('fetchMetaData', e.message) }
  return meta
}

class Metadata extends TinyEmitter {
  constructor (app, annotationsService) {
    super()

    this._annotations = annotationsService
    if (config.metadata.memcachedURL) this._memcached = new Memcached(config.metadata.memcachedURL)

    const _this = this

    app.get('/metadata/:id', async (req, res) => {
      let source, annotation
      if (req.params.id === 'url') {
        source = req.query.url
      }
      else {
        const result = await _this._annotations.getHandler(req)
        annotation = result.data
        source = annotation.body.source.id
      }
      if (!annotation && !source) return _this._errorResponse(res, 404)
      const key = `metadata_${ObjectUtil.slug(source)}`
      let metadata
      if (_this._memcached) {
        metadata = await new Promise((resolve, reject) => {
          _this._memcached.get(key, function (err, data) {
            if (err) console.error('failed to get metadata from cache', err.message)
            resolve(data)
          })
        })
      }
      if (!metadata) {
        metadata = await fetchMetaData(annotation || source, req.user, _this._annotations)
        if (_this._memcached && metadata) {
          await new Promise((resolve, reject) => {
            _this._memcached.set(key, metadata, parseInt(config.metadata.lifetime.toString()), err => {
              if (err) console.error('failed to store metadata in cache', err.message)
              resolve()
            })
          })
        }
      }
      if (!metadata) return _this._errorResponse(res, 404)
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
