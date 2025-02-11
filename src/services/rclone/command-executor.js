'use strict'

const { exec, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const settings = require('../settings')
const cacheManager = require('./cache-manager')
const errorHandler = require('../../utils/error-handler')
const dialogs = require('../dialogs')
const { CONSTANTS } = require('../../config/constants')
const isDev = require('electron-is-dev')
const { app } = require('electron')

class CommandExecutor {
  constructor(configFile) {
    this.configFile = configFile
    this.rclonePath = this.findRclonePath()
  }

  findRclonePath() {
    // Сначала проверяем bundled версию
    const bundledPath = this.getBundledRclonePath()
    if (bundledPath && fs.existsSync(bundledPath)) {
      return bundledPath
    }

    // Если bundled нет или не найден, используем системный
    return CONSTANTS.RCLONE_BINARY_NAME
  }

  getBundledRclonePath() {
    return CONSTANTS.getRcloneBundledPath()
  }

  updateVersionCache() {
    try {
      const output = this.executeSync(['version'])
      const version = output.trim().split(/\r?\n/).shift().split(/\s+/).pop() || 'Unknown'
      
      if (cacheManager.getVersion() && cacheManager.getVersion() !== version) {
        // rclone binary is upgraded
      }
      cacheManager.setVersion(version)
    } catch (err) {
      errorHandler.logToFile(err)
      dialogs.missingRclone()
      this.updateVersionCache() // retry
    }
  }

  prepareCommand(command) {
    if (this.configFile) {
      command.unshift('--config', this.configFile)
    }

    // Используем путь к rclone в зависимости от настроек
    if (settings.get('rclone_use_bundled')) {
      command.unshift(this.rclonePath)
    } else {
      command.unshift(CONSTANTS.RCLONE_BINARY_NAME)
    }

    command.push('--auto-confirm')
    return command
  }

  enquoteCommand(command) {
    return command.map(arg => 
      arg.substr(0, 2) !== '--' ? JSON.stringify(arg) : arg
    )
  }

  async execute(command) {
    command = this.prepareCommand(command)
    command = this.enquoteCommand(command)

    return new Promise((resolve, reject) => {
      exec(command.join(' '), {maxBuffer: 1024 * 2048}, (err, stdout, stderr) => {
        if (err) {
          console.error('Rclone command failed:', {
            command: command.join(' '),
            error: err.message,
            stderr: stderr
          })
          reject(err)
        } else {
          if (stdout.length > 100) {
            console.log('Rclone command success:', {
              command: command.join(' '),
              stdout: stdout.substring(0, 100) + '...'
            })
          } else {
            console.log('Rclone command success:', {
              command: command.join(' '),
              stdout: stdout
            })
          }
          resolve(stdout)
        }
      })
    })
  }

  executeSync(command) {
    try {
      command = this.prepareCommand(command)
      command = this.enquoteCommand(command)
      const result = execSync(command.join(' ')).toString()
      console.log('Rclone sync command success:', {
        command: command.join(' '),
        result: result
      })
      return result
    } catch (err) {
      console.error('Rclone sync command error:', {
        error: err,
        command: command.join(' ')
      })
      throw err
    }
  }

  updateConfigFile(file) {
    this.configFile = file
    cacheManager.setConfigFile(file)
  }
}

module.exports = CommandExecutor 