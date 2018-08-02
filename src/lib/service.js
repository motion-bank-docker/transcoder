const
  config = require('config'),
  send = require('@polka/send-type'),
  TinyEmitter = require('tiny-emitter'),
  { ObjectUtil } = require('mbjs-utils'),
  { MongoDB } = require('mbjs-persistence')

class Service extends TinyEmitter {
  constructor (name, app, model, logger, acl) {
    super()

    const _this = this

    this._name = name
    this._acl = acl
    this._logger = logger
    this._Model = model
    // TODO: make db adapter configurable (nedb, etc.)
    this._client = new MongoDB(ObjectUtil.merge({ name, logger }, config.get('resources.mongodb')), 'uuid')

    app.get(`/${this._name}`, (req, res) => _this.findHandler(req, res))
    app.get(`/${this._name}/:id`, (req, res) => _this.getHandler(req, res))
    app.post(`/${this._name}`, (req, res) => _this.postHandler(req, res))
    app.put(`/${this._name}/:id`, (req, res) => _this.putHandler(req, res))
    app.patch(`/${this._name}/:id`, (req, res) => _this.patchHandler(req, res))
    app.delete(`/${this._name}/:id`, (req, res) => _this.deleteHandler(req, res))
  }

  async findHandler (req, res) {
    let results = await this._client.find(JSON.parse(req.query.query || '{}'), req.params)
    const user = req.user ? req.user.uuid : 'anon'
    const items = []
    for (let entry of results) {
      let allowed = false
      if (entry.author && entry.author.id === user) allowed = true
      else {
        try {
          allowed = await this._acl.isAllowed(user, entry.uuid, 'get')
        }
        catch (err) {
          this._logger.error(`ACL error: ${err.message}`)
        }
      }
      if (allowed) items.push(entry)
    }
    return this._response(req, res, { items })
  }

  async getHandler (req, res) {
    const result = await this.client.get(req.params.id, req.params)
    const user = req.user ? req.user.uuid : 'anon'
    if (result) {
      let allowed = false
      if (result.author && result.author.id === user) allowed = true
      else {
        try {
          allowed = await this._acl.isAllowed(user, result.uuid, 'get')
        }
        catch (err) {
          this._logger.error(`ACL error: ${err.message}`)
        }
      }
      if (allowed) {
        const instance = new this.ModelConstructor(result, `${req.params.id}`)
        return this._response(req, res, instance)
      }
      return this._errorResponse(res, 403)
    }
    else return this._errorResponse(res, 404)
  }

  async postHandler (req, res) {
    const
      ctx = this,
      data = req.body
    if (Array.isArray(data)) {
      const results = await Promise.all(data.map(entry => {
        return ctx.create(entry, req.params)
      }))
      return this._response(req, res, results)
    }
    // TODO: allow for full array inserts instead just single requests
    const instance = new this.ModelConstructor(data),
      result = await this.client.create(instance, req.params)
    instance.populate(result)
    return this._response(req, res, instance)
  }

  async putHandler (req, res) {
    const data = req.body
    let result = await this.client.get(req.params.id)
    if (result) {
      // TODO: transactions anyone?!
      data.uuid = req.params.id
      let instance = new this.ModelConstructor(data, req.params.id)
      await this.client.update(req.params.id, instance, req.params)
      return this._response(req, res, instance)
    }
    else return this._errorResponse(res, 404)
  }

  async patchHandler (req, res) {
    const data = req.body
    let existing = await this.client.get(req.params.id)
    if (existing) {
      let instance = new this.ModelConstructor(existing, req.params.id)
      instance.populate(ObjectUtil.merge(instance.toObject(), data))
      await this.client.update(req.params.id, instance, req.params)
      return this._response(req, res, instance)
    }
    else return this._errorResponse(res, 404)
  }

  async deleteHandler (req, res) {
    let existing = await this.client.get(req.params.id)
    if (existing) {
      const result = await this.client.remove(req.params.id, req.params)
      if (result) {
        return this._response(req, res, existing)
      }
    }
    else return this._errorResponse(res, 404)
  }

  _response (req, res, data = {}) {
    this.emit('message', { method: req.method, id: data.id })
    if (typeof res === 'function') res({ data })
    else if (typeof res === 'undefined') return Promise.resolve({ data })
    else send(res, 200, data)
  }

  _errorResponse (res, code, message = undefined) {
    if (typeof res === 'function') res({ error: true, code })
    else if (typeof res === 'undefined') return Promise.resolve({ error: true, code })
    else send(res, code, message)
  }

  get client () {
    return this._client
  }

  get acl () {
    return this._acl
  }

  get ModelConstructor () {
    return this._Model
  }
}

module.exports = Service
