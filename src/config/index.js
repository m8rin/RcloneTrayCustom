const isDev = require('electron-is-dev')
const path = require('path')

module.exports = {
  isDev,
  paths: {
    root: path.join(__dirname, '..'),
    // Добавьте другие пути здесь
  }
} 