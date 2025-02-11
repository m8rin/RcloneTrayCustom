'use strict'

const path = require('path')
const { BrowserWindow } = require('electron')
const isDev = require('electron-is-dev')
const rclone = require('../services/rclone')

class DialogManager {
  constructor() {
    this.dialogInstances = {}
  }

  createDialog(name, options = {}, props = {}) {
    const dialogOptions = {
      maximizable: false,
      minimizable: true,
      resizable: false,
      fullscreenable: false,
      useContentSize: true,
      show: false,
      backgroundColor: this.getBackgroundColor(),
      zoomToPageWidth: true,
      autoHideMenuBar: true,
      skipTaskbar: false,
      webPreferences: {
        backgroundThrottling: false,
        preload: path.join(__dirname, '../dialogs-preload.js'),
        devTools: isDev,
        defaultEncoding: 'UTF-8',
        contextIsolation: false,
        nodeIntegration: false,
        webviewTag: false,
        sandbox: true
      },
      ...options
    }

    const dialog = new BrowserWindow(dialogOptions)
    dialog.$props = props

    dialog.loadFile(path.join(__dirname, 'dialogs', `${name}.html`))
    
    return dialog
  }

  getBackgroundColor() {
    return process.platform === 'darwin' 
      ? '#ececec'
      : process.platform === 'win32'
        ? '#ffffff' 
        : '#dddddd'
  }

  showDialog(name) {
    // Показ диалога
  }
}

module.exports = new DialogManager() 