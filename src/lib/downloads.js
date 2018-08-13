const
  config = require('config'),
  Minio = require('minio'),
  TinyEmitter = require('tiny-emitter')

class Downloads extends TinyEmitter {
  constructor (app) {
    super()

    const _this = this
    this.minioClient = new Minio.Client(config.assets.client)

    app.get('/downloads/:file', async (req, res) => {
      const stream = await _this.minioClient.getObject(config.assets.bucket, req.params.file)
      res.setHeader('Content-Type', 'application/force-download')
      stream.pipe(res)
    })
  }
}

module.exports = Downloads
