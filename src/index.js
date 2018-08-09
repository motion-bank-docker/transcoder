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

  const annotations = new Service('annotations', api._app, models.Annotation, api._logger, api._acl)
  // annotations.on('message', message => api._sockets.write(message))

  const maps = new Service('maps', api._app, models.Map, api._logger, api._acl)
  // annotations.on('message', message => api._sockets.write(message))

  /**
   * Configure metadata
   */
  const
    Metadata = require('./lib/metadata'),
    metadata = new Metadata(api._app, annotations)

  /**
   * Configure upload
   */
  const
    Uploads = require('./lib/uploads'),
    uploads = new Uploads(api._app)

  /**
   * Configure conversion
   */
  const
    Conversions = require('./lib/conversions'),
    conversions = new Conversions(api._app)

  /**
   * Configure sequences
   */
  const
    Sequences = require('./lib/sequences'),
    sequences = new Sequences(api._app, annotations, maps)

  /**
   * Configure timecode
   */
  const
    Timecodes = require('./lib/timecodes'),
    timecodes = new Timecodes(api._app)

  await api.start()
}

setup().catch(err => {
  process.stderr.write(err.message + '\n')
  process.stderr.write(err.stack + '\n')
  process.exit(err.code)
})
