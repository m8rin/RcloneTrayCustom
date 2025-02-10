'use strict'

const path = require('path')
const fs = require('fs')
const ini = require('ini')
const { app } = require('electron')

class Settings {
  constructor() {
    this.data = {}
    this.configPath = path.join(app.getPath('userData'), 'settings.ini')
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        this.data = ini.parse(fs.readFileSync(this.configPath, 'utf-8'))
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  save() {
    try {
      fs.writeFileSync(this.configPath, ini.stringify(this.data))
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }

  get(key, defaultValue = null) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue
  }

  set(key, value) {
    this.data[key] = value
    this.save()
  }
}

module.exports = new Settings() 