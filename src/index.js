const GenericAPI = require('mbjs-generic-api')

const setup = async function () {
  const api = new GenericAPI()
  await api.setup()

  /**
   * Configure resources
   */
  const
    models = require('mbjs-data-models'),
    Service = require('./lib/service')

  const annotations = new Service('annotations', api, models.Annotation)
  // annotations.on('message', message => api._sockets.write(message))

  const maps = new Service('maps', api, models.Map)
  // annotations.on('message', message => api._sockets.write(message))

  /**
   * Configure metadata
   */
  const
    Metadata = require('./lib/metadata'),
    metadata = new Metadata(api, annotations)

  /**
   * Configure upload
   */
  const
    Uploads = require('./lib/uploads'),
    uploads = new Uploads(api)

  /**
   * Configure download
   */
  const
    Downloads = require('./lib/downloads'),
    downloads = new Downloads(api)

  /**
   * Configure conversion
   */
  const
    Conversions = require('./lib/conversions'),
    conversions = new Conversions(api)

  /**
   * Configure sequences
   */
  const
    Sequences = require('./lib/sequences'),
    sequences = new Sequences(api, annotations, maps)

  /**
   * Configure timecode
   */
  const
    Timecodes = require('./lib/timecodes'),
    timecodes = new Timecodes(api)

  await api.start()
}

setup().catch(err => {
  process.stderr.write(err.message + '\n')
  process.stderr.write(err.stack + '\n')
  process.exit(err.code)
})
