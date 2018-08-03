const
  fs = require('fs-extra'),
  os = require('os'),
  path = require('path'),
  { DateTime, Interval } = require('luxon'),
  ffmpegScale = require('mbjs-media/src/util/ffmpeg-scale'),
  ffmpegThumb = require('mbjs-media/src/util/ffmpeg-thumb'),
  ffmpeg = require('mbjs-media/src/util/ffmpeg'),
  { Assert, ObjectUtil } = require('mbjs-utils')

const convertJob = async function (job) {
  Assert.isType(job.data.source, 'string', 'invalid source')

  const start = DateTime.local()
  const uuid = ObjectUtil.uuid4()
  const tmpDir = path.join(os.tmpdir(), uuid)
  const destination = path.join(tmpDir, `${uuid}.${job.data.format || 'mp4'}`)
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
  await fs.move(
    path.join(tmpDir, 'tn.png'),
    path.join(path.dirname(destination), `${baseName}.png`),
    { overwrite: true }
  )
  // await fs.remove(tmpDir)
  const end = DateTime.local()
  const interval = Interval.fromDateTimes(start, end).toDuration().as('seconds')
  console.log(`conversion took ${interval} seconds`)
  job.data.duration = interval
  return job.data
}

module.exports = function (job) {
  return convertJob(job).then(result => {
    return result
  })
}
