const
  config = require('config'),
  Minio = require('minio'),
  TinyEmitter = require('tiny-emitter')

class Downloads extends TinyEmitter {
  constructor (api) {
    super()

    const _this = this
    const opts = Object.assign({}, config.assets.client)
    opts.secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
    opts.port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
    _this.minioClient = new Minio.Client(opts)

    api.app.get('/downloads/:file', async (req, res) => {
      const stream = await _this.minioClient.getObject(config.assets.bucket, req.params.file)
      res.setHeader('Content-Type', 'application/force-download')
      stream.pipe(res)
    })
  }
}

module.exports = Downloads
