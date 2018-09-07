const
  config = require('config'),
  send = require('@polka/send-type'),
  os = require('os'),
  path = require('path'),
  multer = require('multer'),
  { ObjectUtil } = require('mbjs-utils'),
  Minio = require('minio'),
  TinyEmitter = require('tiny-emitter')

class Uploads extends TinyEmitter {
  constructor (api) {
    super()

    const _this = this
    const upload = multer({ dest: os.tmpdir() })

    api.app.post('/uploads', async (req, res) => {
      upload.single('file')(req, res, async () => {
        const extname = path.extname(req.file.originalname)
        const filename = `${ObjectUtil.uuid4()}${extname.toLowerCase()}`
        const opts = Object.assign({}, config.assets.client)
        opts.secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
        opts.port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
        const minioClient = new Minio.Client(opts)

        await minioClient.fPutObject(config.assets.bucket, filename, req.file.path, { 'Content-Type': req.file.mimetype })

        let port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
        let secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
        let assetHost = `${secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
        if (port !== 80 && port !== 443) assetHost += `:${port}`
        assetHost = config.assets.host || assetHost
        assetHost += `/${config.assets.bucket}`

        _this._response(req, res, {
          file: `${assetHost}/${filename}`,
          originalName: req.file.originalname
        })
      })
    })

    api.app.delete('/uploads/:file', async (req, res) => {
      const opts = Object.assign({}, config.assets.client)
      opts.secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
      opts.port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
      const minioClient = new Minio.Client(opts)
      await minioClient.removeObject(config.assets.bucket, req.params.file)
      _this._response(req, res)
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

module.exports = Uploads
