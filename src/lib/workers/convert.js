const
  fs = require('fs-extra'),
  os = require('os'),
  path = require('path'),
  URL = require('url'),
  config = require('config'),
  ffmpegScale = require('mbjs-media/src/util/ffmpeg-scale'),
  ffmpegThumb = require('mbjs-media/src/util/ffmpeg-thumb'),
  ffmpeg = require('mbjs-media/src/util/ffmpeg'),
  image = require('mbjs-media/src/util/image'),
  Minio = require('minio'),
  { Assert, ObjectUtil } = require('mbjs-utils'),
  { captureException } = require('mbjs-generic-api/src/raven')

const convertJob = async function (job) {
  Assert.isType(job.data.source, 'string', 'invalid source')

  let errored = false

  const uuid = ObjectUtil.uuid4()
  const tmpDir = path.join(os.tmpdir(), uuid)
  const destFile = `${uuid}.mp4`
  const destination = path.join(tmpDir, destFile)
  const baseName = path.basename(destination, path.extname(destination))
  const sourceName = URL.parse(job.data.source).pathname
  const metadata = Object.assign({
    title: path.basename(sourceName, path.extname(sourceName))
  }, job.data.metadata)

  if (job.data.source.indexOf('http') !== 0) {
    const stats = await fs.stat(job.data.source)
    Assert.ok(stats.isFile() === true, 'invalid source')
  }
  await fs.ensureDir(tmpDir)
  let source = job.data.source
  if (job.data.rotate) {
    try {
      const tmpdst = destination.replace(/\.mp4$/, '-rotated.mp4')
      await ffmpeg(source, tmpdst, metadata, progress => {
        job.progress(progress.percent * 0.3)
      })
      source = tmpdst
    }
    catch (e) {
      captureException(e)
      errored = true
    }
  }
  try {
    if (job.data.scale) {
      await ffmpegScale(source, destination, job.data.scale, metadata, progress => {
        job.progress(progress.percent * 0.3)
      })
    }
    else {
      await ffmpeg(source, destination, metadata, progress => {
        job.progress(progress.percent * 0.3)
      })
    }
  }
  catch (e) {
    captureException(e)
    errored = true
  }

  const thumbFile = `${baseName}.jpg`
  const thumbPath = path.join(path.dirname(destination), thumbFile)

  const thumbFileSmall = `${baseName}-s.jpg`
  const thumbPathSmall = path.join(path.dirname(destination), thumbFileSmall)

  const thumbFileMedium = `${baseName}-m.jpg`
  const thumbPathMedium = path.join(path.dirname(destination), thumbFileMedium)

  try {
    await ffmpegThumb(destination, tmpDir, 1, progress => {
      job.progress(60 + progress.percent * 0.3)
    })
    await image.convert(path.join(tmpDir, 'tn.png'), thumbPath)
    await image.convert(path.join(tmpDir, 'tn.png'), thumbPathSmall, {resize: {width: 240, height: 240}})
    await image.convert(path.join(tmpDir, 'tn.png'), thumbPathMedium, {resize: {width: 640, height: 640}})
  }
  catch (e) {
    captureException(e)
    errored = true
  }

  if (!errored) {
    try {
      const opts = Object.assign({}, config.assets.client)
      opts.secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
      opts.port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
      const minioClient = new Minio.Client(opts)
      await minioClient.fPutObject(config.assets.bucket, destFile, destination, {'Content-Type': 'video/mp4'})
      await minioClient.fPutObject(config.assets.bucket, thumbFile, thumbPath, {'Content-Type': 'image/jpeg'})
      await minioClient.fPutObject(config.assets.bucket, thumbFileSmall, thumbPathSmall, {'Content-Type': 'image/jpeg'})
      await minioClient.fPutObject(config.assets.bucket, thumbFileMedium, thumbPathMedium, {'Content-Type': 'image/jpeg'})
    }
    catch (e) {
      captureException(e)
      errored = true
    }
  }

  await fs.remove(tmpDir)

  job.progress(100)

  let port = config.assets.client.port ? parseInt(config.assets.client.port) : undefined
  let secure = config.assets.client.secure && (config.assets.client.secure === true || config.assets.client.secure === 'true')
  let assetHost = `${secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
  if (port !== 80 && port !== 443) assetHost += `:${port}`
  assetHost += `/${config.assets.bucket}`

  if (errored) return
  return {
    video: `${assetHost}/${destFile}`,
    preview: `${assetHost}/${thumbFile}`
  }
}

module.exports = function (job) {
  return convertJob(job).then(result => {
    return result
  })
}
