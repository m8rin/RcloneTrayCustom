'use strict'

const fs = require('fs')
const ini = require('ini')
const chokidar = require('chokidar')
const { PROVIDERS } = require('../../config/providers')
const cacheManager = require('./cache-manager')
const path = require('path')
const settings = require('../settings')

class BookmarkManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
    this.bookmarks = {}
    this.updateCallbacks = []
    this.settings = settings
  }

  async init() {
    this.watchConfigFile()
    return this.updateBookmarksCache()
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
      return bookmarks
    } catch (err) {
      console.error('Failed to update bookmarks cache:', err)
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
    // Validate bookmark name
    if (!/^([a-zA-Z0-9\-_]{1,32})$/.test(name)) {
      throw new Error('Недопустимое имя.\nИмя должно содержать от 1 до 32 символов и состоять только из букв, цифр и _')
    }

    // Check if bookmark already exists
    const bookmarks = this.getBookmarks()
    if (name in bookmarks) {
      throw new Error(`Закладка "${name}" уже существует`)
    }

    try {
      // Create initial config with type
      await this.commandExecutor.execute(['config', 'create', name, type])

      // Update bookmark fields if any values provided
      if (Object.keys(values).length > 0) {
        await this.commandExecutor.execute(['config', 'update', name].concat(
          Object.entries(values).map(([key, value]) => `${key}=${value}`)
        ))
      }

      // Update cache and notify
      await this.updateBookmarksCache()
      return this.getBookmark(name)

    } catch (err) {
      // Clean up on failure
      try {
        await this.commandExecutor.execute(['config', 'delete', name])
      } catch (deleteErr) {
        console.error('Failed to clean up bookmark after error:', deleteErr)
      }
      throw err
    }
  }

  async updateBookmark(name, values) {
    console.log('Updating bookmark:', { name, values })
    
    // Проверяем существование закладки
    const bookmark = this.getBookmark(name)
    if (!bookmark) {
      throw new Error(`Закладка ${name} не найдена`)
    }

    try {
      // Сохраняем специальные поля, которые нужно сохранить
      const specialFields = {
        _rclonetray_custom_args: values._rclonetray_custom_args || bookmark._rclonetray_custom_args || '',
        _rclonetray_local_path_map: values._rclonetray_local_path_map || bookmark._rclonetray_local_path_map || '',
        _rclonetray_mount_drive: values._rclonetray_mount_drive || bookmark._rclonetray_mount_drive || '',
        _rclonetray_remote_path: values._rclonetray_remote_path || bookmark._rclonetray_remote_path || ''
      }

      // Получаем все поля для обновления
      const updateFields = {
        ...values,
        ...specialFields
      }

      // Удаляем поля, которые не нужно обновлять
      delete updateFields.$name
      delete updateFields.type

      // Формируем команду обновления
      const updateCommand = ['config', 'update', name]
      Object.entries(updateFields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          updateCommand.push(`${key}=${value}`)
        }
      })

      // Выполняем обновление через rclone
      await this.commandExecutor.execute(updateCommand)

      // Обновляем кэш и уведомляем об изменениях
      await this.updateBookmarksCache()

      // Возвращаем обновленную закладку
      const updatedBookmark = this.getBookmark(name)
      console.log('Updated bookmark:', updatedBookmark)
      return updatedBookmark

    } catch (err) {
      console.error('Failed to update bookmark:', err)
      throw new Error(`Ошибка обновления закладки: ${err.message}`)
    }
  }

  async deleteBookmark(bookmark) {
    const bookmarkData = this.getBookmark(bookmark)
    await this.commandExecutor.execute(['config', 'delete', bookmarkData.$name])
    
    // Удаляем информацию о монтировании при удалении закладки
    const mountedBookmarks = this.settings.get('mounted_bookmarks', {})
    delete mountedBookmarks[bookmarkData.$name]
    this.settings.set('mounted_bookmarks', mountedBookmarks)
    
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