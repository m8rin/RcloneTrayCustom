'use strict'

const chokidar = require('chokidar')
const settings = require('../settings')
const dialogs = require('../dialogs')
const errorHandler = require('../../utils/error-handler')

class SyncManager {
  constructor(commandExecutor, processManager) {
    this.commandExecutor = commandExecutor
    this.processManager = processManager
    this.automaticUploadRegistry = {}
  }

  async sync(direction, bookmark) {
    const processId = `${direction}:${bookmark.$name}`
    
    if (this.processManager.exists(processId)) {
      throw new Error(`${bookmark.$name} уже синхронизируется`)
    }

    if (!bookmark._rclonetray_local_path_map) {
      throw new Error('Локальный путь не настроен')
    }

    const command = this.buildSyncCommand(direction, bookmark)
    this.processManager.create(processId, command)
  }

  stopSync(direction, bookmark) {
    this.processManager.kill(`${direction}:${bookmark.$name}`)
  }

  isSync(direction, bookmark) {
    return this.processManager.exists(`${direction}:${bookmark.$name}`)
  }

  toggleAutomaticSync(bookmark) {
    if (this.automaticUploadRegistry[bookmark.$name]) {
      this.stopAutomaticSync(bookmark)
    } else {
      this.startAutomaticSync(bookmark)
    }
  }

  startAutomaticSync(bookmark) {
    if (!bookmark._rclonetray_local_path_map) {
      throw new Error('Локальный путь не настроен')
    }

    this.automaticUploadRegistry[bookmark.$name] = {
      watcher: null,
      timer: null,
      interval: null,
      isSyncing: false
    }

    // Настройка наблюдателя за изменениями
    const watcher = chokidar.watch(bookmark._rclonetray_local_path_map, {
      ignoreInitial: true,
      disableGlobbing: true,
      usePolling: false,
      useFsEvents: true,
      persistent: true,
      alwaysStat: true,
      atomic: true
    })

    watcher.on('raw', () => {
      const reg = this.automaticUploadRegistry[bookmark.$name]
      if (reg.timer) {
        clearTimeout(reg.timer)
      }
      reg.timer = setTimeout(() => {
        this.sync('upload', bookmark)
      }, settings.get('rclone_sync_autoupload_delay') * 1000)
    })

    // Настройка интервала для скачивания
    const interval = setInterval(() => {
      const reg = this.automaticUploadRegistry[bookmark.$name]
      if (!reg.isSyncing) {
        reg.isSyncing = true
        this.sync('download', bookmark)
          .finally(() => {
            reg.isSyncing = false
          })
      }
    }, settings.get('rclone_sync_autoupload_delay') * 1000)

    this.automaticUploadRegistry[bookmark.$name].watcher = watcher
    this.automaticUploadRegistry[bookmark.$name].interval = interval
  }

  stopAutomaticSync(bookmark) {
    const reg = this.automaticUploadRegistry[bookmark.$name]
    if (reg) {
      if (reg.timer) clearTimeout(reg.timer)
      if (reg.interval) clearInterval(reg.interval)
      if (reg.watcher) reg.watcher.close()
      delete this.automaticUploadRegistry[bookmark.$name]
    }
  }

  buildSyncCommand(direction, bookmark) {
    const isUpload = direction === 'upload'
    const source = isUpload ? bookmark._rclonetray_local_path_map : this.getBookmarkRemoteWithRoot(bookmark)
    const dest = isUpload ? this.getBookmarkRemoteWithRoot(bookmark) : bookmark._rclonetray_local_path_map

    return [
      'sync',
      source,
      dest,
      '--create-empty-src-dirs',
      '--track-renames',
      '--delete-during',
      '-v'
    ]
  }

  getBookmarkRemoteWithRoot(bookmark) {
    return `${bookmark.$name}:${bookmark._rclonetray_remote_path || '/'}`
  }

  download(bookmark) {
    return this.sync('download', bookmark)
  }

  upload(bookmark) {
    return this.sync('upload', bookmark)
  }

  stopDownload(bookmark) {
    return this.stopSync('download', bookmark)
  }

  stopUpload(bookmark) {
    return this.stopSync('upload', bookmark)
  }

  toggleAutomaticUpload(bookmark) {
    return this.toggleAutomaticSync(bookmark)
  }
}

module.exports = SyncManager 