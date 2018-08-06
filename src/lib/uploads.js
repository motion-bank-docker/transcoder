const
  config = require('config'),
  send = require('@polka/send-type'),
  os = require('os'),
  path = require('path'),
  multer = require('multer'),
  { ObjectUtil } = require('mbjs-utils'),
  Minio = require('minio'),
  TinyEmitter = require('tiny-emitter')

class Metadata extends TinyEmitter {
  constructor (app) {
    super()

    const _this = this
    const upload = multer({ dest: os.tmpdir() })

    app.post('/uploads', async (req, res) => {
      upload.single('file')(req, res, async () => {
        const extname = path.extname(req.file.originalname)
        const filename = `${ObjectUtil.uuid4()}${extname.toLowerCase()}`
        const minioClient = new Minio.Client(config.assets.client)

        await minioClient.fPutObject(config.assets.bucket, filename, req.file.path, { 'Content-Type': req.file.mimetype })

        let assetHost = `${config.assets.client.secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
        if (config.assets.client.port !== 80 && config.assets.client.port !== 443) assetHost += `:${config.assets.client.port}`
        assetHost += `/${config.assets.bucket}`

        _this._response(req, res, {
          file: `${assetHost}/${filename}`
        })
      })
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