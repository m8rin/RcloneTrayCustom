'use strict'

const path = require('path')
const { Tray, Menu } = require('electron')
const isDev = require('electron-is-dev')
const settings = require('./settings')
const rclone = require('./rclone')
const dialogs = require('./dialogs')
const statusHandler = require('../utils/status-handler')
const { CONSTANTS } = require('../config/constants')

class TrayService {
  constructor() {
    this.trayIndicator = null
    this.refreshTimer = null
    this.icons = {}
  }

  init() {
    if (this.trayIndicator) {
      console.error('Cannot start more than one tray indicators.')
      return
    }

    this.setupIcons()
    this.trayIndicator = new Tray(this.icons.default)
  }

  setupIcons() {
    if (process.platform === 'win32') {
      this.icons.default = path.join(__dirname, '../ui/icons/icon.ico')
      this.icons.connected = path.join(__dirname, '../ui/icons/icon-connected.ico')
    } else if (process.platform === 'linux') {
      this.icons.default = path.join(__dirname, '../ui/icons/icon.png')
      this.icons.connected = path.join(__dirname, '../ui/icons/icon-connected.png')
    } else {
      this.icons.default = path.join(__dirname, '../ui/icons/iconTemplate.png')
      this.icons.connected = path.join(__dirname, '../ui/icons/icon-connectedTemplate.png')
    }
  }

  refresh() {
    if (!this.trayIndicator) return

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTrayMenu()
    }, 500)
  }

  refreshTrayMenu() {
    if (isDev) {
      console.log('Refresh tray indicator menu')
    }

    const menuItems = []
    let isConnected = false

    menuItems.push({
      label: 'Новая закладка',
      click: dialogs.showAddBookmark,
      accelerator: 'CommandOrControl+N'
    })

    const bookmarks = rclone.getBookmarks()

    if (Object.keys(bookmarks).length > 0) {
      menuItems.push({ type: 'separator' })
      
      for (const key in bookmarks) {
        const bookmarkMenu = this.generateBookmarkActionsSubmenu(bookmarks[key])
        menuItems.push(bookmarkMenu.template)
        if (bookmarkMenu.isConnected) {
          isConnected = true
        }
      }
    }

    this.addDefaultMenuItems(menuItems)
    this.trayIndicator.setContextMenu(Menu.buildFromTemplate(menuItems))
    this.trayIndicator.setImage(isConnected ? this.icons.connected : this.icons.default)
  }

  addDefaultMenuItems(menuItems) {
    menuItems.push(
      { type: 'separator' },
      {
        label: 'Настройки',
        click: dialogs.showPreferences,
        accelerator: 'CommandOrControl+,'
      },
      { type: 'separator' },
      {
        label: 'Выход',
        accelerator: 'CommandOrControl+Q',
        role: 'quit'
      }
    )
  }

  generateBookmarkActionsSubmenu(bookmark) {
    // ... существующая логика из tray.js
  }
}

module.exports = new TrayService() 