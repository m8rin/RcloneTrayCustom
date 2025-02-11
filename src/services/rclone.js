'use strict'

const RcloneService = require('./rclone/index')

// Реэкспортируем все методы из нового сервиса для обратной совместимости
module.exports = {
  init: () => RcloneService.init(),
  getVersion: () => RcloneService.getVersion(),
  getConfigFile: () => RcloneService.getConfigFile(),
  prepareQuit: (event) => RcloneService.prepareQuit(event),
  onUpdate: (callback) => RcloneService.onUpdate(callback),

  // Методы для работы с закладками
  getBookmark: (bookmark) => RcloneService.bookmarkManager.getBookmark(bookmark),
  getBookmarks: () => RcloneService.bookmarkManager.getBookmarks(),
  addBookmark: (type, name, values) => RcloneService.bookmarkManager.addBookmark(type, name, values),
  updateBookmark: (bookmark, values) => RcloneService.bookmarkManager.updateBookmark(bookmark, values),
  deleteBookmark: (bookmark) => RcloneService.bookmarkManager.deleteBookmark(bookmark),
  validateBookmarkOptions: (provider, values) => RcloneService.bookmarkManager.validateBookmarkOptions(provider, values),

  // Методы для работы с провайдерами
  getProvider: (name) => RcloneService.getProvider(name),
  getProviders: () => RcloneService.getProviders(),

  // Методы для монтирования
  mount: (bookmark) => {
    console.log('rclone.js: Mounting bookmark:', bookmark)
    return RcloneService.mount(bookmark)
  },
  unmount: (bookmark) => RcloneService.unmount(bookmark),
  getMountStatus: (bookmark) => RcloneService.getMountStatus(bookmark),
  openMountPoint: (bookmark) => RcloneService.openMountPoint(bookmark),

  // Методы для синхронизации
  sync: (direction, bookmark) => RcloneService.sync(direction, bookmark),
  stopSync: (direction, bookmark) => RcloneService.stopSync(direction, bookmark),
  isSync: (direction, bookmark) => RcloneService.syncManager.isSync(direction, bookmark),
  download: (bookmark) => RcloneService.download(bookmark),
  upload: (bookmark) => RcloneService.upload(bookmark),
  stopDownload: (bookmark) => RcloneService.stopDownload(bookmark),
  stopUpload: (bookmark) => RcloneService.stopUpload(bookmark),
  toggleAutomaticUpload: (bookmark) => RcloneService.toggleAutomaticUpload(bookmark),

  // Методы для serve
  getAvailableServeProtocols: () => RcloneService.getAvailableServeProtocols(),
  serveStart: (protocol, bookmark) => RcloneService.serveStart(protocol, bookmark),
  serveStop: (protocol, bookmark) => RcloneService.serveStop(protocol, bookmark),
  serveStatus: (protocol, bookmark) => RcloneService.serveStatus(protocol, bookmark),

  // Методы для терминала
  openNCDU: (bookmark) => RcloneService.openNCDU(bookmark),

  // Вспомогательные методы
  getBookmarkRemoteWithRoot: (bookmark) => `${bookmark.$name}:${bookmark._rclonetray_remote_path || '/'}`
} 