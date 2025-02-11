'use strict'

const fs = require('fs')
const ini = require('ini')
const chokidar = require('chokidar')
const { PROVIDERS } = require('../../config/providers')
const cacheManager = require('./cache-manager')
const path = require('path')

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

  updateBookmark(name, values) {
    console.log('Updating bookmark:', { name, values })
    const bookmark = this.getBookmark(name)
    if (!bookmark) {
      throw new Error(`Bookmark ${name} not found`)
    }

    // Сохраняем существующие специальные поля
    const specialFields = {
      $name: name,
      type: bookmark.type,
      _rclonetray_custom_args: bookmark._rclonetray_custom_args || '',
      _rclonetray_local_path_map: bookmark._rclonetray_local_path_map || '',
      _rclonetray_mount_drive: values._rclonetray_mount_drive || bookmark._rclonetray_mount_drive || ''
    }

    // Обновляем закладку, сохраняя специальные поля
    Object.assign(bookmark, values, specialFields)

    console.log('Updated bookmark:', bookmark)
    this.saveBookmarks()
    this.notifyUpdateCallbacks()
    return bookmark
  }

  async deleteBookmark(bookmark) {
    const bookmarkData = this.getBookmark(bookmark)
    await this.commandExecutor.execute(['config', 'delete', bookmarkData.$name])
    this.updateBookmarksCache()
  }

  updateBookmarkFields(name, fields) {
    if (!name || !fields) {
      console.error('Invalid arguments:', { name, fields })
      return
    }
    
    const configPath = path.join(
      cacheManager.getConfigPath(),
      `bookmark.${name}.json`
    )
    
    if (!fs.existsSync(configPath)) {
      console.error('Config file not found:', configPath)
      return
    }

    const config = JSON.parse(fs.readFileSync(configPath))
    Object.assign(config, fields)
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  }

  onUpdate(callback) {
    this.updateCallbacks.push(callback)
  }

  notifyUpdateCallbacks() {
    this.updateCallbacks.forEach(callback => callback())
  }
}

module.exports = BookmarkManager 