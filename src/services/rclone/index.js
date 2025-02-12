'use strict'

const CommandExecutor = require('./command-executor')
const MountManager = require('./mount-manager')
const ProcessManager = require('./process-manager')
const BookmarkManager = require('./bookmark-manager')
const SyncManager = require('./sync-manager')
const ServeManager = require('./serve-manager')
const TerminalManager = require('./terminal-manager')
const path = require('path')
const ProviderManager = require('./provider-manager')
const cacheManager = require('./cache-manager')
const dialogs = require('../dialogs')

class RcloneService {
  constructor() {
    // Логируем инициализацию сервисов
    console.log('RcloneService: Initializing services...')

    this.commandExecutor = new CommandExecutor()
    this.processManager = new ProcessManager()
    this.bookmarkManager = new BookmarkManager(this.commandExecutor)
    this.mountManager = new MountManager(this.commandExecutor)
    this.syncManager = new SyncManager(this.commandExecutor, this.processManager)
    this.serveManager = new ServeManager(this.commandExecutor, this.processManager)
    this.terminalManager = new TerminalManager(this.commandExecutor)
    this.providerManager = new ProviderManager(this.commandExecutor)

    this.mountManager.onUpdate(() => {
      this.bookmarkManager.notifyUpdateCallbacks()
    })
  }

  async init() {
    try {
      this.setupEnvironment()
      this.commandExecutor.updateVersionCache()
      await this.providerManager.updateProvidersCache()
      
      // Ждем полной инициализации bookmarkManager
      await this.bookmarkManager.init()
      
      // Теперь можно безопасно запускать автомонтирование
      console.log('RcloneService: Starting automount...')
      await this.mountManager.initAutoMount(this.bookmarkManager)
    } catch (err) {
      console.error('RcloneService: Init failed:', err)
    }
  }

  setupEnvironment() {
    if (process.platform === 'linux' || process.platform === 'darwin') {
      process.env.PATH += ':' + path.join('/', 'usr', 'local', 'bin')
    }
  }

  // Методы-прокси для удобства использования
  mount(bookmark) {
    console.log('RcloneService: Mounting bookmark:', bookmark)
    return this.mountManager.mount(this.bookmarkManager.getBookmark(bookmark))
  }

  unmount(bookmark) {
    return this.mountManager.unmount(this.bookmarkManager.getBookmark(bookmark))
  }

  getMountStatus(bookmark) {
    return this.mountManager.getMountStatus(this.bookmarkManager.getBookmark(bookmark))
  }

  sync(direction, bookmark) {
    return this.syncManager.sync(direction, this.bookmarkManager.getBookmark(bookmark))
  }

  stopSync(direction, bookmark) {
    return this.syncManager.stopSync(direction, this.bookmarkManager.getBookmark(bookmark))
  }

  // Методы-прокси для serve
  getAvailableServeProtocols() {
    return this.serveManager.getAvailableProtocols()
  }

  serveStart(protocol, bookmark) {
    return this.serveManager.startServing(protocol, this.bookmarkManager.getBookmark(bookmark))
  }

  serveStop(protocol, bookmark) {
    return this.serveManager.stopServing(protocol, this.bookmarkManager.getBookmark(bookmark))
  }

  serveStatus(protocol, bookmark) {
    return this.serveManager.getServeStatus(protocol, this.bookmarkManager.getBookmark(bookmark))
  }

  // Методы-прокси для терминала
  openNCDU(bookmark) {
    return this.terminalManager.openNCDU(this.bookmarkManager.getBookmark(bookmark))
  }

  getVersion() {
    return cacheManager.getVersion()
  }

  prepareQuit(event) {
    if (this.processManager.getActiveProcessesCount() < 1) {
      return
    }

    if (!dialogs.confirmExit()) {
      event.preventDefault()
      return
    }

    this.processManager.killAll()
  }

  onUpdate(callback) {
    this.bookmarkManager.onUpdate(callback)
  }

  download(bookmark) {
    return this.syncManager.download(this.bookmarkManager.getBookmark(bookmark))
  }

  upload(bookmark) {
    return this.syncManager.upload(this.bookmarkManager.getBookmark(bookmark))
  }

  stopDownload(bookmark) {
    return this.syncManager.stopDownload(this.bookmarkManager.getBookmark(bookmark))
  }

  stopUpload(bookmark) {
    return this.syncManager.stopUpload(this.bookmarkManager.getBookmark(bookmark))
  }

  toggleAutomaticUpload(bookmark) {
    return this.syncManager.toggleAutomaticUpload(this.bookmarkManager.getBookmark(bookmark))
  }

  async openMountPoint(bookmark) {
    try {
      console.log('RcloneService: Opening mount point for bookmark:', bookmark)
      const bookmarkObj = this.bookmarkManager.getBookmark(bookmark)
      if (!bookmarkObj) {
        throw new Error(`Bookmark ${bookmark} not found`)
      }
      await this.mountManager.openMountPoint(bookmarkObj)
    } catch (err) {
      console.error('Failed to open mount point:', err)
      dialogs.notification(`Не удалось открыть точку монтирования: ${err.message}`)
    }
  }

  getConfigFile() {
    return cacheManager.getConfigFile()
  }

  getProviders() {
    return this.providerManager.getProviders()
  }

  getProvider(name) {
    return this.providerManager.getProvider(name)
  }
}

module.exports = new RcloneService() 