const dialogs = require('../services/dialogs')

function setupErrorHandlers(app) {
  process.on('uncaughtException', (error) => {
    if (dialogs.uncaughtException(error)) {
      app.exit()
    }
  })
}

module.exports = {
  setupErrorHandlers
} 