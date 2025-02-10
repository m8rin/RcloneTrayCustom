'use strict'

const path = require('path')
const { shell, app, BrowserWindow, Menu, Notification, dialog } = require('electron')
const electronContextMenu = require('electron-context-menu')
const isDev = require('electron-is-dev')
const settings = require('./settings')

/**
 * Set the background color
 * @private
 */
const backgroundColor = process.platform === 'darwin'
  ? '#ececec'
  : process.platform === 'win32'
    ? '#ffffff'
    : '#dddddd'

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
  console.log('Creating dialog:', dialogName, 'with options:', options)
  
  let singleId = options && options.hasOwnProperty('$singleId')
  if (singleId) {
    console.log('Dialog has singleId')
    delete options['$singleId']
    singleId = dialogName + '/' + singleId.toString()
    console.log('SingleId:', singleId)
    if (dialogsSingletoneInstances.hasOwnProperty(singleId) && dialogsSingletoneInstances[singleId]) {
      console.log('Found existing dialog instance, focusing')
      dialogsSingletoneInstances[singleId].focus()
      return dialogsSingletoneInstances[singleId]
    }
  }

  console.log('Creating new BrowserWindow')
  try {
    let theDialog = new BrowserWindow({
      show: false,
      width: 600,
      height: 400,
      parent: null,
      modal: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'dialogs-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    console.log('BrowserWindow created successfully')

    console.log('Configuring window properties')
    theDialog.center()
    theDialog.setResizable(false)
    theDialog.setMaximizable(false)
    theDialog.setAutoHideMenuBar(true)
    theDialog.setMinimizable(false)
    theDialog.setFullScreenable(false)

    console.log('Setting up event listeners')
    theDialog.on('ready-to-show', () => {
      console.log('Dialog ready to show')
      theDialog.show()
    })
    
    theDialog.on('show', () => {
      console.log('Dialog shown')
      app.focus()
    })

    theDialog.on('closed', () => {
      console.log('Dialog closed')
      if (singleId) {
        delete dialogsSingletoneInstances[singleId]
      }
      if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length < 1) {
        app.dock.hide()
      }
      theDialog = null
    })

    console.log('Loading HTML file')
    const htmlPath = path.join(__dirname, '..', 'ui', 'dialogs', dialogName + '.html')
    console.log('HTML path:', htmlPath)
    theDialog.loadFile(htmlPath)

    if (process.platform === 'darwin') {
      console.log('Configuring macOS specific settings')
      app.dock.show()
      theDialog.setVibrancy('window')
    }

    if (singleId) {
      console.log('Storing dialog instance with singleId:', singleId)
      dialogsSingletoneInstances[singleId] = theDialog
    }

    theDialog.$props = props || {}

    theDialog.webContents.on('new-window', (event, url) => {
      event.preventDefault()
      shell.openExternal(url)
    })

    return theDialog
  } catch (error) {
    console.error('Error creating dialog:', error)
    throw error
  }
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
  console.log('Opening preferences dialog')
  let dialog = createNewDialog('Preferences', {
    $singleId: 1
  })
  console.log('Setting preferences dialog size')
  dialog.setSize(600, 300)
}

/**
 * Show new Bookmark dialog
 */
const addBookmark = function () {
  console.log('Opening add bookmark dialog')
  let dialog = createNewDialog('AddBookmark', {
    $singleId: 1
  })
  console.log('Setting add bookmark dialog size')
  dialog.setSize(600, 100)
}

/**
 * Show edit Bookmark dialog
 */
const editBookmark = function () {
  console.log('Opening edit bookmark dialog')
  let props = this
  console.log('Edit bookmark props:', props)
  let dialog = createNewDialog('EditBookmark', {
    $singleId: this.$name
  }, props)
  console.log('Setting edit bookmark dialog size')
  dialog.setSize(600, 460)
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
