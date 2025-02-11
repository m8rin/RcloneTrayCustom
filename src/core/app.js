'use strict'

// Основной модуль приложения
const { app } = require('electron')
const path = require('path')
const isDev = require('electron-is-dev')
const { CONSTANTS } = require('../config/constants')
const dialogs = require('../services/dialogs')
const rclone = require('../services/rclone')
const tray = require('../services/tray')

class App {
  constructor() {
    this.init()
  }

  setupApp() {
    app.setName(CONSTANTS.APP_NAME)
    app.setAppUserModelId(CONSTANTS.APP_NAME)

    if (process.platform === 'win32') {
      app.disableHardwareAcceleration()
    }
  }

  setupErrorHandling() {
    process.on('uncaughtException', (error) => {
      if (dialogs.uncaughtException(error)) {
        app.exit()
      }
    })
  }

  checkRequirements() {
    if (process.arch !== 'x64') {
      throw Error('Это приложение только для 64bit платформы.')
    }

    if (!['win32', 'linux', 'darwin'].includes(process.platform)) {
      throw Error('Эта платформа не поддерживается')
    }
  }

  setupSingleInstance() {
    if (!app.requestSingleInstanceLock()) {
      if (isDev) {
        console.log('There is already started CSync instance.')
      }
      app.focus()
      dialogs.errorMultiInstance()
      app.exit()
    }
    app.on('second-instance', app.focus)
  }

  init() {
    this.setupApp()
    this.setupErrorHandling()
    this.checkRequirements()
    this.setupSingleInstance()
    
    app.on('ready', () => {
      tray.init()
      rclone.init()
      rclone.onUpdate(tray.refresh)
      
      if (process.platform === 'darwin') {
        app.dock.hide()
      }
    })

    app.on('before-quit', rclone.prepareQuit)
    app.on('window-all-closed', (event) => event.preventDefault())
  }

  // ... остальные методы
}

module.exports = new App() 