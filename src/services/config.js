'use strict'

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

class Config {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json')
    this.config = this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
    return {}
  }

  save() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error('Error saving config:', error)
    }
  }

  get(key, defaultValue = null) {
    return key in this.config ? this.config[key] : defaultValue
  }

  set(key, value) {
    this.config[key] = value
    this.save()
  }
}

module.exports = new Config() 