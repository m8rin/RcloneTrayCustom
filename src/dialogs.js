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

/**
 * Simple factory for the dialogs
 * @param {string} dialogName
 * @param {{}} options
 * @param {{}} props
 * @returns {BrowserWindow}
 * @private
 */
const createNewDialog = function (dialogName, options, props) {
  // Use $singleId options property with special meaning of not allowing,
  // dialog to have multiple instances.
  let singleId = options && options.hasOwnProperty('$singleId')
  if (singleId) {
    delete options['$singleId']
    singleId = dialogName + '/' + singleId.toString()
    if (dialogsSingletoneInstances.hasOwnProperty(singleId) && dialogsSingletoneInstances[singleId]) {
      dialogsSingletoneInstances[singleId].focus()
      return dialogsSingletoneInstances[singleId]
    }
  }

  // Dialog options.
  options = Object.assign({
    maximizable: false,
    minimizable: true,
    resizable: false,
    fullscreenable: false,
    useContentSize: true,
    show: false,
    backgroundColor: backgroundColor,
    zoomToPageWidth: true,
    autoHideMenuBar: true,
    skipTaskbar: false,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, 'dialogs-preload.js'),
      devTools: isDev,
      defaultEncoding: 'UTF-8',
      contextIsolation: false,
      nodeIntegration: false,
      webviewTag: false,
      sandbox: true
    }
  }, options)

  // Instantinate the window.
  let theDialog = new BrowserWindow(options)
  if (process.platform === 'darwin') {
    app.dock.show()

    // Resizing from renderer is blocking process, so next is workaround to get smooth resize without IPC
    theDialog.setSizeAsync = function (width, height) {
      setImmediate(function () {
        theDialog.setSize(width, height, true)
      })
    }
  }

  // Assign $props that we will use in window.getProps() as window properties (params) on load time.
  theDialog.$props = props || {}

  theDialog.on('ready-to-show', theDialog.show)
  theDialog.on('show', app.focus)

  // and load the index.html of the app.
  theDialog.loadFile(path.join(__dirname, 'ui', 'dialogs', dialogName + '.html'))

  // Emitted when the window is closed.
  theDialog.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    theDialog = null

    if (singleId) {
      delete dialogsSingletoneInstances[singleId]
    }

    // On macos hide the dock icon when no active windows by this app.
    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length < 1) {
      app.dock.hide()
    }
  })

  // Open links in system default browser.
  theDialog.webContents.on('new-window', function (event, url) {
    event.preventDefault()
    shell.openExternal(url)
  })

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
  createNewDialog('Preferences', {
    $singleId: 1,
    width: 600,
    height: 300
  })
}

/**
 * Show new Bookmark dialog
 */
const addBookmark = function () {
  createNewDialog('AddBookmark', {
    $singleId: 1,
    width: 600,
    height: 100
  })
}

/**
 * Show edit Bookmark dialog
 */
const editBookmark = function () {
  let props = this
  createNewDialog('EditBookmark', {
    $singleId: this.$name,
    width: 600,
    height: 460
  }, props)
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
  // @TODO consider switch to notification (baloon),
  //       the problem is that Notifications are available after app is ready
  // (new Notification({ body: 'RcloneTray is already started and cannot be started twice.' })).show()
  dialog.showErrorBox('', 'CSync уже запущен и не может быть запущен дважды.')
}

/**
 * Show the Uncaught Exception dialog
 * @param {Error} detail
 * @returns {boolean} Should exit
 */
const uncaughtException = function (detail) {
  if (app.isReady()) {
    // When error happen when app is ready then seems to be happen on late stage,
    // and user should decide to ignore or to exit (because could have active transfers)
    let choice = dialog.showMessageBox(null, {
      type: 'warning',
      buttons: ['Выход', 'Отмена'],
      title: 'Error',
      message: 'Непредвиденная ошибка.',
      detail: (detail || '').toString()
    })
    app.focus()
    return choice === 0
  } else {
    // This message will be shown on very early stage before most of the app is loaded.
    dialog.showErrorBox('Непредвиденная ошибка во время выполнения. Не удается запустить CSync.', (detail || '').toString())
    app.focus()
    return true
  }
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
