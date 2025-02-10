'use strict'

const path = require('path')
const { app, ipcMain, dialog, BrowserWindow } = require('electron')
const isDev = require('electron-is-dev')
const dialogs = require('./services/dialogs')
const rclone = require('./services/rclone')
const tray = require('./services/tray')
const Application = require('./core/app')
const config = require('./config')
const settings = require('./services/settings')

app.setName('CSync');
app.setAppUserModelId('CSync');

// Дождемся готовности приложения перед созданием трея
app.whenReady().then(() => {
  console.log('App is ready')
  try {
    console.log('Initializing tray...')
    tray.init()
    console.log('Tray initialized')
    
    console.log('Initializing rclone...')
    rclone.init()
    console.log('Rclone initialized')
    
    rclone.onUpdate(tray.refresh)

    // Скрыть иконку из дока на macOS
    if (process.platform === 'darwin') {
      app.dock.hide()
    }
  } catch (error) {
    console.error('Initialization error:', error)
  }
})

// Обработка ошибок
process.on('uncaughtException', function (error) {
  if (dialogs.uncaughtException(error)) {
    app.exit()
  }
})

// Check arch.
if (process.arch !== 'x64' && process.arch !== 'arm64') {
  throw new Error('Это приложение поддерживает только 64-битные платформы (x64 или arm64).');
}

// Check the OS.
if (['win32', 'linux', 'darwin'].indexOf(process.platform) === -1) {
  throw Error('Эта платформа не поддерживается')
}

// win32 workaround for poor rendering.
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

// Do not allow multiple instances.
if (!app.requestSingleInstanceLock()) {
  if (isDev) {
    console.log('There is already started CSync instance.')
  }
  app.focus()
  dialogs.errorMultiInstance()
  app.exit()
}

// For debugging purposes.
if (config.isDev) {
  // Export interact from console
  require('inspector').open()
  // load electron-reload
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
    })
  } catch (err) { }

  // @TODO Remove before release
  global.$main = {
    app,
    __dirname,
    require
  }
}

// Focus the app if second instance is going to starts.
app.on('second-instance', app.focus)

// Не закрывать приложение при закрытии всех окон
app.on('window-all-closed', (event) => {
  event.preventDefault()
})

// Подготовка к выходу
app.on('before-quit', rclone.prepareQuit)

// Добавьте обработчики IPC
ipcMain.handle('settings-get', (event, key) => {
  return settings.get(key)
})

ipcMain.handle('settings-set', (event, key, value) => {
  settings.set(key, value)
  return true
})

ipcMain.handle('settings-merge', (event, data) => {
  Object.entries(data).forEach(([key, value]) => {
    settings.set(key, value)
  })
  return true
})

ipcMain.on('refresh-tray', () => {
  tray.refresh()
})

ipcMain.on('is-autostart', (event) => {
  event.returnValue = app.getLoginItemSettings().openAtLogin
})

ipcMain.on('set-autostart', (event, value) => {
  app.setLoginItemSettings({
    openAtLogin: value,
    openAsHidden: true
  })
  event.returnValue = true
})

ipcMain.on('show-error', (event, message) => {
  dialog.showErrorBox('Ошибка', message)
})

ipcMain.on('show-info', (event, message) => {
  dialog.showMessageBox({
    type: 'info',
    buttons: ['OK'],
    message
  })
})

ipcMain.on('resize-window', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setSize(width, height)
  }
})

// Добавляем обработчики для rclone
ipcMain.handle('rclone-get-providers', () => {
  return rclone.getProviders()
})

ipcMain.handle('rclone-get-config-file', () => {
  return rclone.getConfigFile()
})

ipcMain.handle('rclone-add-bookmark', async (event, type, name, options) => {
  return await rclone.addBookmark(type, name, options)
})

ipcMain.handle('rclone-update-bookmark', async (event, name, options) => {
  return await rclone.updateBookmark(name, options)
})

ipcMain.handle('rclone-delete-bookmark', async (event, name) => {
  return await rclone.deleteBookmark(name)
})

new Application()
