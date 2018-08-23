const
  fs = require('fs-extra'),
  os = require('os'),
  path = require('path'),
  { spawn } = require('child_process'),
  ffmpeg = require('mbjs-media/src/util/ffmpeg'),
  { Assert, ObjectUtil } = require('mbjs-utils'),
  { captureException } = require('mbjs-generic-api/src/raven')

const extractLTC = function (file) {
  return new Promise((resolve, reject) => {
    const ls = spawn('ltcdump', ['-a', file])
    let
      stdout = '',
      stderr = ''

    ls.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ls.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ls.on('error', err => {
      captureException(err)
      reject(err)
    })

    ls.on('close', code => {
      if (code !== 0) reject(new Error(stderr))
      else resolve(stdout)
    })
  })
}

const extractLtcJob = async function (job) {
  Assert.isType(job.data.source, 'string', 'invalid source')

  const uuid = ObjectUtil.uuid4()
  const tmpDir = path.join(os.tmpdir(), uuid)
  const destFile = `${uuid}.wav`
  const destination = path.join(tmpDir, destFile)

  let data

  if (job.data.source.indexOf('http') !== 0) {
    const stats = await fs.stat(job.data.source)
    Assert.ok(stats.isFile() === true, 'invalid source')
  }
  try {
    await fs.ensureDir(tmpDir)
    await ffmpeg(job.data.source, destination, {}, progress => {
      job.progress(progress.percent * 0.4)
    })
    const output = await extractLTC(destination)
    await fs.remove(tmpDir)

    data = output.split('\n').map(line => {
      const values = line.split('\t')
      if (values.length !== 3) return values
      return values.map((val, i) => {
        if (i < 2) return parseFloat(val)
        if (val.indexOf('No LTC frame found') === 0) return null
        return val
      })
    }).filter(entry => {
      return entry.length === 3 && entry[2]
    })
  }
  catch (e) {
    captureException(e)
  }

  job.progress(100)

  return { data }
}

module.exports = function (job) {
  return extractLtcJob(job).then(result => {
    return result
  })
}
