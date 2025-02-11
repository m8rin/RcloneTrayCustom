'use strict'

const fs = require('fs').promises
const path = require('path')
const { app } = require('electron')
const dialogs = require('../services/dialogs')
const rclone = require('../services/rclone')

class ErrorHandler {
  constructor() {
    this.logFilePath = path.join(app.getPath('userData'), 'logs', 'logs.txt')
    this.notificationFlags = {}
  }

  async logToFile(message) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${
      typeof message === 'object' ? JSON.stringify(message) : message
    }\n`

    try {
      await fs.appendFile(this.logFilePath, logMessage, 'utf8')
    } catch (error) {
      console.error('Error writing to log file:', error)
    }
  }

  async handleProcessOutput(bookmarkName, lineInfo) {
    if (bookmarkName && !this.notificationFlags[bookmarkName]) {
      this.notificationFlags[bookmarkName] = false
    }

    // Обработка ошибок и уведомлений
    if (lineInfo.level === 'ERROR') {
      await this.handleError(bookmarkName, lineInfo)
    }

    if (['NOTICE', 'INFO'].includes(lineInfo.level)) {
      await this.logToFile(lineInfo)
    }
  }

  async handleError(bookmarkName, error) {
    await this.logToFile(error)
    
    if (!this.notificationFlags[bookmarkName]) {
      dialogs.notification(error.message)
      this.notificationFlags[bookmarkName] = true
    }
  }

  resetNotificationFlag(bookmarkName) {
    if (bookmarkName) {
      this.notificationFlags[bookmarkName] = false
    }
  }
}

module.exports = new ErrorHandler() 