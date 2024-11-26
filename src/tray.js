'use strict'

const path = require('path')
const { Tray, Menu, shell, BrowserWindow } = require('electron')
const isDev = require('electron-is-dev')
const settings = require('./settings')
const rclone = require('./rclone')
const dialogs = require('./dialogs')

/**
 * Host the initialized Tray object.
 * @type {Tray}
 * @private
 */
let trayIndicator = null

/**
 * Host the atomic timer
 * @private
 */
let refreshTrayMenuAtomicTimer = null

/**
 * Tray icons
 * @private
 */
const icons = {}

/**
 * Label for platform's file browser
 * @private
 */
const fileExplorerLabel = process.platform === 'darwin'
  ? 'Finder'
  : process.platform === 'win32'
    ? 'Проводнике'
    : 'Файловом менеджере'

/**
 * Do action with bookmark
 * @param {string} action
 * @param ...args
 */
const bookmarkActionRouter = function (action, ...args) {
  if (action === 'mount') {
    rclone.mount(this)
  } else if (action === 'unmount') {
    rclone.unmount(this)
  } else if (action === 'open-mounted') {
    rclone.openMountPoint(this)
  } else if (action === 'download') {
    rclone.download(this)
  } else if (action === 'stop-downloading') {
    rclone.stopDownload(this)
  } else if (action === 'upload') {
    rclone.upload(this)
  } else if (action === 'stop-uploading') {
    rclone.stopUpload(this)
  } else if (action === 'toggle-automatic-upload') {
    rclone.toggleAutomaticUpload(this)
  } else if (action === 'open-local') {
    rclone.openLocal(this)
  } else if (action === 'serve-start') {
    rclone.serveStart(args[0], this)
  } else if (action === 'serve-stop') {
    rclone.serveStop(args[0], this)
  } else if (action === 'open-ncdu') {
    rclone.openNCDU(this)
  } else if (action === 'open-web-browser') {
    shell.openExternal(args[0])
  } else if (action === 'open-config') {
    shell.openItem(rclone.getConfigFile())
  } else if (action === 'delete-bookmark') {
    rclone.deleteBookmark(this.$name)
  } else {
    console.error('No such action', action, args, this)
  }
}

/**
 * Bookmark submenu
 *
 * @param {{bookmark}}
 * @returns {{}}
 */
const generateBookmarkActionsSubmenu = function (bookmark) {
  // If by some reason bookmark is broken, then show actions menu.
  if (!bookmark.$name || !bookmark.type) {
    return {
      label: bookmark.$name || '<Unknown>',
      enabled: false,
      type: 'submenu',
      submenu: [
        {
          label: 'Исправить конфигурационный файл',
          click: bookmarkActionRouter.bind(null, 'open-config')
        },
        {
          label: 'Удалить',
          enabled: !!bookmark.$name,
          click: bookmarkActionRouter.bind(bookmark, 'delete-bookmark')
        }
      ]
    }
  }

  // Main template
  let template = {
    type: 'submenu',
    submenu: []
  }

  // Mount
  let isMounted = rclone.getMountStatus(bookmark)
  template.submenu.push({
    label: 'Примонтировать',
    click: bookmarkActionRouter.bind(bookmark, 'mount'),
    checked: !!isMounted,
    enabled: isMounted === false
  })
  if (isMounted !== false) {
    template.submenu.push(
      {
        label: 'Отмонтировать',
        click: bookmarkActionRouter.bind(bookmark, 'unmount')
      },
      {
        label: `Открыть в ${fileExplorerLabel}`,
        enabled: !!isMounted,
        click: bookmarkActionRouter.bind(bookmark, 'open-mounted')
      }
    )
  }

  // Download/Upload
  let isDownload = false
  let isUpload = false
  let isAutomaticUpload = false
  if (settings.get('rclone_sync_enable') && '_rclonetray_local_path_map' in bookmark && bookmark._rclonetray_local_path_map.trim()) {
    isDownload = rclone.isDownload(bookmark)
    isUpload = rclone.isUpload(bookmark)
    isAutomaticUpload = rclone.isAutomaticUpload(bookmark)
    template.submenu.push(
      {
        type: 'separator'
      },
      {
        type: 'checkbox',
        label: 'Синхронизировать',
        enabled: !isAutomaticUpload && !isUpload && !isDownload,
        checked: isUpload,
        click: bookmarkActionRouter.bind(bookmark, 'upload')
      },
      {
        type: 'checkbox',
        label: 'Автоматическая синхронизация',
        checked: isAutomaticUpload,
        click: bookmarkActionRouter.bind(bookmark, 'toggle-automatic-upload')
      })

    if (isDownload) {
      template.submenu.push({
        label: 'Остановить синхронизацию',
        click: bookmarkActionRouter.bind(bookmark, 'stop-downloading')
      })
    }

    if (isUpload) {
      template.submenu.push({
        label: 'Прекратить синхронизацию',
        click: bookmarkActionRouter.bind(bookmark, 'stop-uploading')
      })
    }

    template.submenu.push({
      label: 'Показать в Проводнике',
      click: bookmarkActionRouter.bind(bookmark, 'open-local')
    })
  }

  // Serving.
  let isServing = false
  let availableServingProtocols = rclone.getAvailableServeProtocols()
  let availableServingProtocolsLen = Object.keys(availableServingProtocols).length
  if (availableServingProtocolsLen) {
    template.submenu.push(
      {
        type: 'separator'
      })

    let i = 0
    Object.keys(availableServingProtocols).forEach(function (protocol) {
      i++
      let servingURI = rclone.serveStatus(protocol, bookmark)

      // Add separator before the menu item, only if current serve method is in process.
      if (servingURI !== false) {
        isServing = true
        if (i > 1) {
          template.submenu.push({
            type: 'separator'
          })
        }
      }

      template.submenu.push({
        type: 'checkbox',
        label: `Обслуживать ${availableServingProtocols[protocol]}`,
        click: bookmarkActionRouter.bind(bookmark, 'serve-start', protocol),
        enabled: servingURI === false,
        checked: !!servingURI
      })

      if (servingURI !== false) {
        template.submenu.push(
          {
            label: 'Остановить',
            click: bookmarkActionRouter.bind(bookmark, 'serve-stop', protocol)
          },
          {
            label: `Открыть "${servingURI}"`,
            click: bookmarkActionRouter.bind(bookmark, 'open-web-browser', servingURI),
            enabled: !!servingURI
          }
        )

        // Add separator after the menu item, only if current serve method is in process.
        if (i < availableServingProtocolsLen) {
          template.submenu.push({
            type: 'separator'
          })
        }
      }
    })
  }

  // NCDU
  if (settings.get('rclone_ncdu_enable')) {
    template.submenu.push(
      {
        type: 'separator'
      },
      {
        label: 'Консоль Браузера',
        click: bookmarkActionRouter.bind(bookmark, 'open-ncdu')
      }
    )
  }

  // Set the menu item state if there is any kind of connection or current running process.
  let isConnected = isMounted || isDownload || isUpload || isServing || isAutomaticUpload

  // Bookmark controls.
  template.submenu.push(
    {
      type: 'separator'
    },
    {
      label: 'Редактировать',
      enabled: !isConnected,
      click: dialogs.editBookmark.bind(bookmark)
    }
  )

  // Set the bookmark label
  template.label = bookmark.$name

  if (settings.get('tray_menu_show_type')) {
    template.label += ' - ' + bookmark.type.toUpperCase()
  }

  if (process.platform === 'darwin') {
    // Because Apple likes rhombuses.
    template.label = (isConnected ? '◆ ' : '') + template.label
  } else {
    template.label = (isConnected ? '● ' : '○ ') + template.label
  }

  // Usually should not goes here.
  if (!template.label) {
    template.label = '<Unknown>'
  }

  return {
    template,
    isConnected
  }
}

let downloadStatusWindow = null;

const createDownloadStatusWindow = () => {
  if (downloadStatusWindow) {
    downloadStatusWindow.focus();
    return;
  }

  downloadStatusWindow = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  downloadStatusWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(downloadStatusHTML)}`);

  downloadStatusWindow.on('closed', () => {
    downloadStatusWindow = null;
  });
};

const downloadStatusHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Статус загрузки</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .download-item { margin-bottom: 10px; padding: 10px; background-color: #f0f0f0; border-radius: 5px; }
        .progress-bar { width: 100%; background-color: #e0e0e0; border-radius: 5px; }
        .progress { height: 20px; background-color: #4CAF50; border-radius: 5px; transition: width 0.3s; }
        .close-btn { float: right; cursor: pointer; }
    </style>
</head>
<body>
    <h2>Статус загрузки файлов</h2>
    <div id="downloads"></div>
    <script>
        const downloads = [
            { id: 1, name: 'file1.txt', progress: 75, status: 'downloading' },
            { id: 2, name: 'file2.pdf', progress: 100, status: 'completed' },
            { id: 3, name: 'file3.jpg', progress: 50, status: 'downloading' },
            { id: 4, name: 'file4.docx', progress: 0, status: 'error' },
        ];

        function renderDownloads() {
            const container = document.getElementById('downloads');
            container.innerHTML = '';
            downloads.forEach(download => {
                const item = document.createElement('div');
                item.className = 'download-item';
                item.innerHTML = \`
                    <span class="close-btn" onclick="removeDownload(\${download.id})">✖</span>
                    <div>\${download.name}</div>
                    <div class="progress-bar">
                        <div class="progress" style="width: \${download.progress}%;"></div>
                    </div>
                    <div>\${download.status === 'completed' ? 'Завершено' : download.status === 'error' ? 'Ошибка' : \`\${download.progress}%\`}</div>
                \`;
                container.appendChild(item);
            });
        }

        function removeDownload(id) {
            const index = downloads.findIndex(d => d.id === id);
            if (index !== -1) {
                downloads.splice(index, 1);
                renderDownloads();
            }
        }

        renderDownloads();
    </script>
</body>
</html>
`;

/**
 * Refreshing try menu.
 */
const refreshTrayMenu = function () {
  // If by some reason some part of the code do this.refresh(),
  // before the tray icon initialization, must not continue because possible error.
  if (!trayIndicator) {
    return
  }

  if (isDev) {
    console.log('Refresh tray indicator menu')
  }

  let menuItems = []
  let isConnected = false

  menuItems.push({
    label: 'Новая закладка',
    click: dialogs.addBookmark,
    accelerator: 'CommandOrControl+N'
  })

  let bookmarks = rclone.getBookmarks()

  if (Object.keys(bookmarks).length > 0) {
    menuItems.push({
      type: 'separator'
    })
    for (let key in bookmarks) {
      let bookmarkMenu = generateBookmarkActionsSubmenu(bookmarks[key])
      menuItems.push(bookmarkMenu.template)
      if (bookmarkMenu.isConnected) {
        isConnected = true
      }
    }
  }

  menuItems.push(
    {
      type: 'separator'
    },
    {
      label: 'Статус загрузки',
      click: createDownloadStatusWindow
    },
    {
      label: 'Настройки',
      click: dialogs.preferences,
      accelerator: 'CommandOrControl+,'
    },
    {
      type: 'separator'
    },
    {
      label: 'Выход',
      accelerator: 'CommandOrControl+Q',
      role: 'quit'
    })

  // Set the menu.
  trayIndicator.setContextMenu(Menu.buildFromTemplate(menuItems))

  // Set icon acording to the status
  trayIndicator.setImage(isConnected ? icons.connected : icons.default)
}

/**
 * Refresh the tray menu.
 */
const refresh = function () {
  // Use some kind of static variable to store the timer
  if (refreshTrayMenuAtomicTimer) {
    clearTimeout(refreshTrayMenuAtomicTimer)
  }

  // Set some delay to avoid multiple updates in close time.
  refreshTrayMenuAtomicTimer = setTimeout(refreshTrayMenu, 500)
}

/**
 * Initialize the tray menu.
 */
const init = function () {
  if (trayIndicator) {
    // Avoid double tray loader
    console.error('Cannot start more than one tray indicators.')
    return
  }

  if (process.platform === 'win32') {
    icons.default = path.join(__dirname, 'ui', 'icons', 'icon.ico')
    icons.connected = path.join(__dirname, 'ui', 'icons', 'icon-connected.ico')
  } else if (process.platform === 'linux') {
    // Using bigger images fixes the problem with blurry icon in some DE.
    icons.default = path.join(__dirname, 'ui', 'icons', 'icon.png')
    icons.connected = path.join(__dirname, 'ui', 'icons', 'icon-connected.png')
  } else {
    icons.default = path.join(__dirname, 'ui', 'icons', 'iconTemplate.png')
    icons.connected = path.join(__dirname, 'ui', 'icons', 'icon-connectedTemplate.png')
  }

  // Add system tray icon.
  trayIndicator = new Tray(icons.default)
}

// Exports.
module.exports = {
  refresh: refresh,
  init: init
}