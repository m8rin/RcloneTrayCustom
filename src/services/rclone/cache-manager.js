'use strict'

class CacheManager {
  constructor() {
    this.cache = {
      version: null,
      configFile: '',
      providers: {},
      bookmarks: {}
    }
  }

  getConfigFile() {
    return this.cache.configFile
  }

  setConfigFile(file) {
    this.cache.configFile = file
  }

  getVersion() {
    return this.cache.version
  }

  setVersion(version) {
    this.cache.version = version
  }

  setBookmarks(bookmarks) {
    this.cache.bookmarks = bookmarks
  }

  getBookmarks() {
    return this.cache.bookmarks
  }

  setProviders(providers) {
    this.cache.providers = providers
  }

  getProviders() {
    return this.cache.providers
  }
}

module.exports = new CacheManager() 