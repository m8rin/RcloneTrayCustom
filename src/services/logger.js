'use strict'

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

class Logger {
  constructor() {
    this.logPath = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true })
    }
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`
    
    fs.appendFileSync(
      path.join(this.logPath, 'app.log'),
      logMessage,
      'utf8'
    )
  }

  error(message) {
    this.log(message, 'error')
  }

  info(message) {
    this.log(message, 'info')
  }

  warn(message) {
    this.log(message, 'warn')
  }
}

module.exports = new Logger() 