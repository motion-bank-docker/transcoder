const
  fs = require('fs-extra'),
  os = require('os'),
  path = require('path'),
  config = require('config'),
  ffmpegScale = require('mbjs-media/src/util/ffmpeg-scale'),
  ffmpegThumb = require('mbjs-media/src/util/ffmpeg-thumb'),
  ffmpeg = require('mbjs-media/src/util/ffmpeg'),
  Minio = require('minio'),
  { Assert, ObjectUtil } = require('mbjs-utils')

const convertJob = async function (job) {
  Assert.isType(job.data.source, 'string', 'invalid source')

  const uuid = ObjectUtil.uuid4()
  const tmpDir = path.join(os.tmpdir(), uuid)
  const destFile = `${uuid}.${job.data.format || 'mp4'}`
  const destination = path.join(tmpDir, destFile)
  const baseName = path.basename(destination, path.extname(destination))

  if (job.data.source.indexOf('http') !== 0) {
    const stats = await fs.stat(job.data.source)
    Assert.ok(stats.isFile() === true, 'invalid source')
  }
  await fs.ensureDir(tmpDir)
  try {
    if (job.data.scale) {
      await ffmpegScale(job.data.source, destination, job.data.scale.width, job.data.scale.height)
    }
    else {
      await ffmpeg(job.data.source, destination)
    }
  } catch (e) {
    console.error(e.message)
  }
  await ffmpegThumb(destination, tmpDir, 1)
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

  let assetHost = `${config.assets.client.secure ? 'https://' : 'http://'}${config.assets.client.endPoint}`
  if (config.assets.client.port !== 80 && config.assets.client.port !== 443) assetHost += `:${config.assets.client.port}`
  assetHost += `/${config.assets.bucket}`

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