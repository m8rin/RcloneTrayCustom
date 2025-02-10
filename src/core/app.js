const { app } = require('electron')
const { APP_NAME, APP_ID } = require('../config/constants')
const { setupErrorHandlers } = require('./errorHandler')
const { checkPlatformCompatibility, setupPlatformSpecific } = require('./platform')
const tray = require('../services/tray')
const rclone = require('../services/rclone')
const dialogs = require('../services/dialogs')
const config = require('../config')

class Application {
  constructor() {
    this.init()
  }

  init() {
    app.setName(APP_NAME)
    app.setAppUserModelId(APP_ID)
    
    setupErrorHandlers(app)
    checkPlatformCompatibility()
    
    this.setupInstanceLock()
    this.setupEventListeners()
  }

  setupInstanceLock() {
    if (!app.requestSingleInstanceLock()) {
      if (config.isDev) {
        console.log('There is already started CSync instance.')
      }
      app.focus()
      dialogs.errorMultiInstance()
      app.exit()
    }
  }

  setupEventListeners() {
    app.on('ready', this.onReady.bind(this))
    app.on('before-quit', rclone.prepareQuit)
    app.on('window-all-closed', (event) => event.preventDefault())
    app.on('second-instance', app.focus)
  }

  onReady() {
    setupPlatformSpecific(app)
    tray.init()
    rclone.init()
    rclone.onUpdate(tray.refresh)
  }
}

module.exports = Application 