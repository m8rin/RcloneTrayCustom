'use strict'

const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { CONSTANTS } = require('../config/constants')

class SettingsService {
  constructor() {
    this.settingsFile = path.join(app.getPath('userData'), 'settings.json')
    this.cache = {...CONSTANTS.DEFAULT_SETTINGS}
    this.readFile()
  }

  get(key, defaultValue) {
    return this.has(key) ? this.cache[key] : defaultValue
  }

  set(key, value) {
    this.cache[key] = value
    this.updateFile()
  }

  has(key) {
    return key in this.cache
  }

  merge(settings) {
    Object.assign(this.cache, settings)
    this.updateFile()
  }

  getAll() {
    return {...this.cache}
  }

  updateFile() {
    try {
      if (!fs.existsSync(path.dirname(this.settingsFile))) {
        fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true })
      }
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.cache, null, 2))
    } catch (err) {
      console.error('Settings write error:', err)
    }
  }

  readFile() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'))
        Object.assign(this.cache, settings)
      }
    } catch (err) {
      console.error('Settings read error:', err)
    }
  }
}

module.exports = new SettingsService() 