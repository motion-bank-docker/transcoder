const
  fs = require('fs-extra'),
  os = require('os'),
  path = require('path'),
  config = require('config'),
  ffmpegJoin = require('mbjs-media/src/util/ffmpeg-join'),
  ffmpegThumb = require('mbjs-media/src/util/ffmpeg-thumb'),
  Minio = require('minio'),
  { Assert, ObjectUtil } = require('mbjs-utils')

const concatJob = async function (job) {
  Assert.ok(Array.isArray(job.data.sources), 'invalid sources')

  const uuid = ObjectUtil.uuid4()
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
    console.error(e.message)
  }
  await ffmpegThumb(destination, tmpDir, 1, progress => {
    job.progress(40 + progress.percent * 0.4)
  })
  const thumbFile = `${baseName}.png`
  const thumbPath = path.join(path.dirname(destination), thumbFile)
  await fs.move(
    path.join(tmpDir, 'tn.png'),
    thumbPath,
    { overwrite: true }
  )

  const minioClient = new Minio.Client(config.assets.client)
  await minioClient.fPutObject(config.assets.bucket, destFile, destination, { 'Content-Type': 'video/mp4' })
  await minioClient.fPutObject(config.assets.bucket, thumbFile, thumbPath, { 'Content-Type': 'image/png' })

  await fs.remove(tmpDir)

  job.progress(100)

  let assetHost = `${config.assets.client.secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
  if (config.assets.client.port !== 80 && config.assets.client.port !== 443) assetHost += `:${config.assets.client.port}`
  assetHost += `/${config.assets.bucket}`

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
