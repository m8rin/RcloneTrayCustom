'use strict'

const path = require('path')
const { shell, app, BrowserWindow, Menu, Notification, dialog } = require('electron')
const electronContextMenu = require('electron-context-menu')
const isDev = require('electron-is-dev')
const settings = require('./settings')

/**
 * Dialog names that should be opened with single instances
 * @type {{}}
 * @private
 */
const dialogsSingletoneInstances = {}

// Если есть другие пути к ресурсам, исправляем их
const resourcePath = path.join(__dirname, '..')
const dialogsPath = path.join(resourcePath, 'ui', 'dialogs')
const iconsPath = path.join(resourcePath, 'ui', 'icons')

/**
 * Simple factory for the dialogs
 * @param {string} dialogName
 * @param {{}} options
 * @param {{}} props
 * @returns {BrowserWindow}
 * @private
 */
const createNewDialog = function (dialogName, options, props) {
  let singleId = options && options.hasOwnProperty('$singleId')
  if (singleId) {
    delete options['$singleId']
    singleId = dialogName + '/' + singleId.toString()
    if (dialogsSingletoneInstances.hasOwnProperty(singleId) && dialogsSingletoneInstances[singleId]) {
      dialogsSingletoneInstances[singleId].focus()
      return dialogsSingletoneInstances[singleId]
    }
  }

  // Базовые настройки для всех диалогов
  const defaultOptions = {
    width: 600,
    height: 400,
    show: false,
    modal: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    autoHideMenuBar: true,
    useContentSize: true,
    backgroundColor: process.platform === 'darwin' ? '#ececec' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'dialogs-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      worldSafeExecuteJavaScript: true
    }
  }

  // Объединяем с пользовательскими настройками
  const finalOptions = { ...defaultOptions, ...options }

  let theDialog = new BrowserWindow(finalOptions)
  
  // Настройки для macOS
  if (process.platform === 'darwin') {
    app.dock.show()
    theDialog.setVibrancy('window')
  }

  // Устанавливаем свойства и обработчики
  theDialog.$props = props || {}
  
  theDialog.once('ready-to-show', () => {
    theDialog.show()
    if (!isDev) {
      theDialog.focus()
    }
  })

  theDialog.on('closed', () => {
    if (singleId) {
      delete dialogsSingletoneInstances[singleId]
    }
    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length < 1) {
      app.dock.hide()
    }
    theDialog = null
  })

  // Открываем ссылки в системном браузере
  theDialog.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Загружаем HTML файл
  const htmlPath = path.join(__dirname, '..', 'ui', 'dialogs', dialogName + '.html')
  theDialog.loadFile(htmlPath)

  // Сохраняем экземпляр для единичных окон
  if (singleId) {
    dialogsSingletoneInstances[singleId] = theDialog
  }

  return theDialog
}

/**
 * Show About dialog
 */
// const about = function () {
//   let aboutDialog = createNewDialog('About', {
//     $singleId: 1,
//     title: 'About',
//     width: 400,
//     height: 360,
//     minimizable: false,
//     alwaysOnTop: true,
//     acceptFirstMouse: true,
//
//     // Make the window sexy.
//     vibrancy: 'appearance-based',
//     titleBarStyle: 'hidden',
//     backgroundColor: null
//   })
//
//   // Close when loose focus, but only when non-dev because even the dev tool trigger the close.
//   if (!isDev) {
//     aboutDialog.on('blur', aboutDialog.close)
//   }
// }

/**
 * Show Preferences dialog
 */
const preferences = function () {
  return createNewDialog('Preferences', {
    $singleId: 1,
    width: 600,
    height: 400,
    title: 'Настройки'
  })
}

/**
 * Show new Bookmark dialog
 */
const addBookmark = function () {
  return createNewDialog('AddBookmark', {
    $singleId: 1,
    width: 600,
    height: 200,
    title: 'Добавить закладку'
  })
}

/**
 * Show edit Bookmark dialog
 */
const editBookmark = function () {
  return createNewDialog('EditBookmark', {
    $singleId: this.$name,
    width: 600,
    height: 460,
    title: 'Редактировать закладку'
  }, this)
}

/**
 * Show OS notification
 * @param {string} message
 */
const notification = function (message) {
  (new Notification({
    body: message,
    title: 'Уведомление'
  })).show()
}

/**
 * Multi Instance error
 */
const errorMultiInstance = function () {
  dialog.showErrorBox('Ошибка', 'Приложение уже запущено')
}

/**
 * Show the Uncaught Exception dialog
 * @param {Error} detail
 * @returns {boolean} Should exit
 */
const uncaughtException = function (error) {
  dialog.showErrorBox('Ошибка', error.message)
  return true
}

/**
 * Show confirm exit dialog.
 * @returns {boolean}
 */
const confirmExit = function () {
  let choice = dialog.showMessageBox(null, {
    type: 'warning',
    buttons: ['Да', 'Нет'],
    title: 'Выйти из CSync',
    message: 'Вы уверены, что хотите выйти?',
    detail: 'Есть активные процессы, которые будут завершены.'
  })
  return choice === 0
}

/**
 * Show missing Rclone action dialog
 * @returns {Number}
 */
const missingRclone = function () {
  let choice = dialog.showMessageBox(null, {
    type: 'warning',
    buttons: ['Перейти на веб-сайт Rclone', 'Переключитесь на комплектную версию', 'Выйти'],
    title: 'Ошибка',
    message: 'Похоже, что Rclone не установлен (или не может быть найден) в вашей системе.\n\nВам необходимо установить Rclone в свою систему или переключиться на использование встроенной версии Rclone.\n'
  })

  if (choice === 0) {
    shell.openExternal('http://rclone.org/downloads/')
    app.exit()
  } else if (choice === 1) {
    settings.set('rclone_use_bundled', true)
  } else {
    app.exit()
  }

  return choice
}

/**
 * Initialize module
*/
const init = function () {
  // Build the global menu
  // @see https://electronjs.org/docs/api/menu#examples
  let template = [
    {
      label: 'Редактировать',
      submenu: [
        { role: 'redo' },
        { role: 'undo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteandmatchstyle' },
        { role: 'delete' },
        { role: 'selectall' }
      ]
    }]

  template.push({
    role: 'window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' }
    ]
  })

  if (process.platform === 'darwin') {
    // First "Application" menu on macOS
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'quit' }
      ]
    })

    // Edit menu
    template[1].submenu.push(
      { type: 'separator' },
      {
        label: 'Speech',
        submenu: [
          { role: 'startspeaking' },
          { role: 'stopspeaking' }
        ]
      }
    )

    // Window menu
    template[2].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ]
  }

  if (isDev) {
    template.push({
      label: 'Debug',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' }
      ]
    })
  }

  // Set the global menu, as it is part of the dialogs.
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  // Enable context menus.
  electronContextMenu({
    showCopyImageAddress: false,
    showSaveImageAs: false,
    showInspectElement: isDev
  })
}

// Do the initialization.
init()

// Module object.
module.exports = {
  // about,
  editBookmark,
  addBookmark,
  preferences,
  errorMultiInstance,
  uncaughtException,
  confirmExit,
  missingRclone,
  notification
}
