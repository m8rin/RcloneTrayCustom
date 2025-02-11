'use strict'

const fs = require('fs')
const ini = require('ini')
const chokidar = require('chokidar')
const { PROVIDERS } = require('../../config/providers')
const cacheManager = require('./cache-manager')

class BookmarkManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
    this.bookmarks = {}
    this.updateCallbacks = []
  }

  init() {
    this.watchConfigFile()
    this.updateBookmarksCache()
  }

  watchConfigFile() {
    chokidar.watch(this.commandExecutor.configFile, {
      ignoreInitial: true,
      disableGlobbing: true,
      usePolling: false,
      useFsEvents: true,
      persistent: true,
      alwaysStat: true,
      atomic: true
    }).on('change', () => this.updateBookmarksCache())
  }

  async updateBookmarksCache() {
    try {
      const output = await this.commandExecutor.execute(['config', 'dump'])
      const bookmarks = {}
      
      const parsedBookmarks = JSON.parse(output)
      Object.keys(parsedBookmarks).forEach(key => {
        if (!PROVIDERS.UNSUPPORTED.includes(parsedBookmarks[key].type)) {
          bookmarks[key] = {
            ...parsedBookmarks[key],
            $name: key
          }
        }
      })

      cacheManager.setBookmarks(bookmarks)
      this.notifyUpdateCallbacks()
    } catch (err) {
      throw new Error('Проблема с чтением списка закладок.')
    }
  }

  getBookmark(bookmarkNameOrObject) {
    if (typeof bookmarkNameOrObject === 'object') {
      return bookmarkNameOrObject
    } 
    
    const bookmarks = cacheManager.getBookmarks()
    if (bookmarkNameOrObject in bookmarks) {
      return bookmarks[bookmarkNameOrObject]
    }
    
    throw new Error(`Закладки ${bookmarkNameOrObject} нет`)
  }

  getBookmarks() {
    return cacheManager.getBookmarks()
  }

  validateBookmarkOptions(providerObject, values) {
    providerObject.Options.forEach(option => {
      const fieldName = option.$Label || option.Name
      if (option.Required && (!values.hasOwnProperty(option.Name) || !values[option.Name])) {
        throw new Error(`${fieldName} поле является обязательным для заполнения`)
      }
    })
  }

  async addBookmark(type, name, values) {
    if (!/^([a-zA-Z0-9\-_]{1,32})$/.test(name)) {
      throw new Error('Недопустимое имя.\nИмя должно содержать от 1 до 32 символов и состоять только из букв, цифр и _')
    }

    if (name in this.bookmarks) {
      throw new Error(`Закладка "${name}" уже существует`)
    }

    try {
      // Создаем начальную конфигурацию
      const iniBlock = `\n[${name}]\nconfig_automatic = no\ntype = ${type}\n`
      fs.appendFileSync(this.commandExecutor.configFile, iniBlock)

      try {
        await this.updateBookmarkFields(name, type, values)
        this.updateBookmarksCache()
        return true
      } catch (err) {
        // Откатываем изменения при ошибке
        await this.commandExecutor.execute(['config', 'delete', name])
        throw new Error('Не удается записать параметры закладок в конфигурацию.')
      }
    } catch (err) {
      throw new Error('Не удается создать новую закладку')
    }
  }

  async updateBookmark(bookmark, values) {
    const bookmarkData = this.getBookmark(bookmark)
    await this.updateBookmarkFields(bookmarkData.$name, bookmarkData.type, values, bookmarkData)
    this.updateBookmarksCache()
  }

  async deleteBookmark(bookmark) {
    const bookmarkData = this.getBookmark(bookmark)
    await this.commandExecutor.execute(['config', 'delete', bookmarkData.$name])
    this.updateBookmarksCache()
  }

  async updateBookmarkFields(name, type, values, oldValues = null) {
    const valuesPlain = {}

    // Обработка значений
    Object.entries(values).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        valuesPlain[key] = value ? 'true' : 'false'
      } else {
        valuesPlain[key] = value
      }
    })

    try {
      const configContent = fs.readFileSync(this.commandExecutor.configFile).toString()
      const configIni = ini.decode(configContent)
      
      configIni[name] = {
        ...configIni[name],
        ...valuesPlain
      }

      fs.writeFileSync(
        this.commandExecutor.configFile, 
        ini.encode(configIni, { whitespace: true })
      )
    } catch (err) {
      console.error('Bookmark update error:', err)
      throw new Error('Не удается обновить поля закладок.')
    }
  }

  onUpdate(callback) {
    this.updateCallbacks.push(callback)
  }

  notifyUpdateCallbacks() {
    this.updateCallbacks.forEach(callback => callback())
  }
}

module.exports = BookmarkManager 