const
  fs = require('fs-extra'),
  os = require('os'),
  path = require('path'),
  config = require('config'),
  ffmpegJoin = require('mbjs-media/src/util/ffmpeg-join'),
  ffmpegThumb = require('mbjs-media/src/util/ffmpeg-thumb'),
  Minio = require('minio'),
  { Assert, ObjectUtil } = require('mbjs-utils'),
  { captureException } = require('mbjs-generic-api/src/raven')

const concatJob = async function (job) {
  Assert.ok(Array.isArray(job.data.sources), 'invalid sources')

  let errored = false

  const uuid = job.data || ObjectUtil.uuid4()
  const tmpDir = path.join(os.tmpdir(), uuid)
  const destFile = `${uuid}.mp4`
  const destination = path.join(tmpDir, destFile)
  const baseName = path.basename(destination, path.extname(destination))
  const metadata = Object.assign({
    title: job.data.map.title
  }, job.data.metadata)

  await fs.ensureDir(tmpDir)
  try {
    await ffmpegJoin(job.data.sources.map(source => { return source.body.source.id }), destination, os.tmpdir(), metadata, progress => {
      job.progress(progress.percent * 0.4)
    })
  } catch (e) {
    captureException(e)
    errored = true
  }

  try {
    await ffmpegThumb(destination, tmpDir, 1, progress => {
      job.progress(60 + progress.percent * 0.3)
    })

    const thumbFile = `${baseName}.jpg`
    const thumbPath = path.join(path.dirname(destination), thumbFile)
    await image.convert(path.join(tmpDir, 'tn.png'), thumbPath)

    const thumbFileSmall = `${baseName}-s.jpg`
    const thumbPathSmall = path.join(path.dirname(destination), thumbFileSmall)
    await image.convert(path.join(tmpDir, 'tn.png'), thumbPathSmall, {resize: {width: 240, height: 240}})

    const thumbFileMedium = `${baseName}-m.jpg`
    const thumbPathMedium = path.join(path.dirname(destination), thumbFileMedium)
    await image.convert(path.join(tmpDir, 'tn.png'), thumbPathMedium, {resize: {width: 640, height: 640}})
  }
  catch (e) {
    captureException(e)
    errored = true
  }

  if (!errored) {
    const minioClient = new Minio.Client(config.assets.client)
    await minioClient.fPutObject(config.assets.bucket, destFile, destination, {'Content-Type': 'video/mp4'})
    await minioClient.fPutObject(config.assets.bucket, thumbFile, thumbPath, {'Content-Type': 'image/jpeg'})
    await minioClient.fPutObject(config.assets.bucket, thumbFileSmall, thumbPathSmall, {'Content-Type': 'image/jpeg'})
    await minioClient.fPutObject(config.assets.bucket, thumbFileMedium, thumbPathMedium, {'Content-Type': 'image/jpeg'})
  }

  await fs.remove(tmpDir)

  job.progress(100)

  let assetHost = `${config.assets.client.secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
  if (config.assets.client.port !== 80 && config.assets.client.port !== 443) assetHost += `:${config.assets.client.port}`
  assetHost += `/${config.assets.bucket}`

  if (errored) return
  return {
    video: `${assetHost}/${destFile}`,
    preview: `${assetHost}/${thumbFile}`
  }
}

module.exports = function (job) {
  return concatJob(job).then(result => {
    return result
  })
}
