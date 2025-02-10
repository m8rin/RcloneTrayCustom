const { SUPPORTED_PLATFORMS, SUPPORTED_ARCHITECTURES } = require('../config/constants')

function checkPlatformCompatibility() {
  if (!SUPPORTED_ARCHITECTURES.includes(process.arch)) {
    throw new Error('Это приложение поддерживает только 64-битные платформы (x64 или arm64).')
  }

  if (!SUPPORTED_PLATFORMS.includes(process.platform)) {
    throw new Error('Эта платформа не поддерживается')
  }
}

function setupPlatformSpecific(app) {
  if (process.platform === 'win32') {
    app.disableHardwareAcceleration()
  }

  if (process.platform === 'darwin') {
    app.dock.hide()
  }
}

module.exports = {
  checkPlatformCompatibility,
  setupPlatformSpecific
} 