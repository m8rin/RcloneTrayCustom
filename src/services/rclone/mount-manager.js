'use strict'

const os = require('os')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const { shell } = require('electron')
const ProcessManager = require('./process-manager')
const settings = require('../settings')
const dialogs = require('../dialogs')

class MountManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
    this.processManager = new ProcessManager()
    this.updateCallbacks = []
    this.mountPoints = new Map() // Хранит текущие точки монтирования
    this.settings = require('../settings')
  }

  onUpdate(callback) {
    this.updateCallbacks.push(callback)
  }

  notifyUpdateCallbacks() {
    this.updateCallbacks.forEach(callback => callback())
  }

  async initAutoMount(bookmarkManager) {
    if (!this.settings.get('rclone_automount_enabled')) {
      console.log('AutoMount: disabled by settings')
      return
    }

    try {
      // Ждем загрузки закладок
      await bookmarkManager.updateBookmarksCache()
      
      const mountedBookmarks = this.settings.get('mounted_bookmarks', {})
      console.log('AutoMount: checking bookmarks:', mountedBookmarks)
      
      for (const [bookmarkName, shouldMount] of Object.entries(mountedBookmarks)) {
        if (shouldMount) {
          try {
            const bookmark = bookmarkManager.getBookmark(bookmarkName)
            if (bookmark) {
              console.log('AutoMount: Mounting bookmark:', bookmarkName)
              await this.mount(bookmark)
            }
          } catch (err) {
            console.error('AutoMount: Failed to mount bookmark:', bookmarkName, err)
          }
        }
      }
    } catch (err) {
      console.error('AutoMount: Failed to initialize:', err)
    }
  }

  async mount(bookmark) {
    console.log('MountManager: Mounting bookmark:', bookmark)
    
    const mountpoint = await this.getMountPoint(bookmark)
    this.mountPoints.set(bookmark.$name, mountpoint)
    
    if (!this.validateMountPoint(mountpoint)) {
      console.error('MountManager: Invalid mountpoint:', mountpoint)
      throw new Error(`Mount point ${mountpoint} is not available`)
    }

    const command = ['mount', ...this.buildMountCommand(bookmark, mountpoint)]
    console.log('MountManager: Executing mount command:', command)
    
    try {
      await this.processManager.create(`mount:${bookmark.$name}`, command)
      
      // Сохраняем состояние монтирования
      const mountedBookmarks = this.settings.get('mounted_bookmarks', {})
      mountedBookmarks[bookmark.$name] = true
      this.settings.set('mounted_bookmarks', mountedBookmarks)
      
      dialogs.notification(`Монтирование ${bookmark.$name} запущено`)
      
      // Ждем немного и проверяем статус
      setTimeout(() => {
        if (this.getMountStatus(bookmark)) {
          dialogs.notification(`${bookmark.$name} успешно примонтирован к ${mountpoint}`)
          this.notifyUpdateCallbacks()
        }
      }, 2000)
    } catch (err) {
      dialogs.notification(`Ошибка монтирования ${bookmark.$name}: ${err.message}`)
      throw err
    }

    return mountpoint
  }

  unmount(bookmark) {
    try {
      this.processManager.kill(`mount:${bookmark.$name}`)
      this.mountPoints.delete(bookmark.$name)
      
      // Обновляем состояние монтирования
      const mountedBookmarks = this.settings.get('mounted_bookmarks', {})
      mountedBookmarks[bookmark.$name] = false
      this.settings.set('mounted_bookmarks', mountedBookmarks)
      
      dialogs.notification(`${bookmark.$name} отмонтирован`)
      this.notifyUpdateCallbacks()
    } catch (err) {
      dialogs.notification(`Ошибка при отмонтировании ${bookmark.$name}: ${err.message}`)
      throw err
    }
  }

  async getMountPoint(bookmark) {
    if (process.platform === 'win32') {
      return this.getWin32MountPoint(bookmark)
    }
    return this.getUnixMountPoint(bookmark)
  }

  async getWin32MountPoint(bookmark) {
    const drives = await this.getAvailableDrives()
    console.log('Available drives:', drives)
    
    // If preferred drive letter is set
    if (bookmark._rclonetray_mount_drive) {
      const preferredDrive = bookmark._rclonetray_mount_drive + ':'
      console.log('Preferred drive:', preferredDrive)
      
      // Check if it's available
      if (!drives.includes(preferredDrive)) {
        return preferredDrive
      } else {
        throw new Error(`Буква диска ${bookmark._rclonetray_mount_drive} уже используется. Выберите другую букву.`)
      }
    }
    
    // Auto mode - find first available drive letter starting from Z
    const letters = Array.from({length: 26}, (_, i) => String.fromCharCode(90 - i))
    for (const letter of letters) {
      const drive = letter + ':'
      if (!drives.includes(drive)) {
        return drive
      }
    }
    
    throw new Error('Нет доступных букв дисков для монтирования')
  }

  getUnixMountPoint(bookmark) {
    const base = process.platform === 'darwin' 
      ? path.join('/', 'Volumes')
      : path.join(os.homedir())

    return path.join(base, `mount.${bookmark.type}.${bookmark.$name}`)
  }

  validateMountPoint(mountpoint) {
    if (!mountpoint) return false
    
    if (fs.existsSync(mountpoint)) {
      const contents = fs.readdirSync(mountpoint)
      return contents.length === 0
    }
    
    return true
  }

  buildMountCommand(bookmark, mountpoint) {
    return [
      this.getBookmarkRemoteWithRoot(bookmark),
      mountpoint,
      '--attr-timeout', Math.max(1, parseInt(settings.get('rclone_cache_files'))) + 's',
      '--dir-cache-time', Math.max(1, parseInt(settings.get('rclone_cache_directories'))) + 's',
      '--volname', bookmark.$name,
      '-v',
      '--no-check-certificate',
      '--vfs-cache-mode=writes',
      '--links',
      '--vfs-cache-max-age', '24h',
      '--vfs-read-chunk-size', '10M',
      '--vfs-read-chunk-size-limit', '512M',
      '--timeout=10s',
      '--contimeout=5s',
      '--vfs-read-wait=30ms'
    ]
  }

  getBookmarkRemoteWithRoot(bookmark) {
    return `${bookmark.$name}:${bookmark._rclonetray_remote_path || '/'}`
  }

  async getAvailableDrives() {
    return new Promise((resolve, reject) => {
      if (process.platform === 'win32') {
        exec('powershell "Get-WmiObject Win32_LogicalDisk | Select-Object DeviceID"', 
          {encoding: 'utf8'}, 
          (error, stdout, stderr) => {
            if (error) {
              reject(error)
              return
            }
            
            const drives = stdout
              .split('\n')
              .filter(line => line.trim().match(/^[A-Z]:$/))
              .map(drive => drive.trim())
              
            resolve(drives)
        })
      } else {
        resolve(['/'])
      }
    })
  }

  getAvailableLetters(usedDrives) {
    const allLetters = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 
                        'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
    const usedLetters = usedDrives.map(drive => drive.charAt(0))
    return allLetters.filter(letter => !usedLetters.includes(letter))
  }

  freeMountpointDirectory(directoryPath) {
    if (fs.existsSync(directoryPath)) {
      const files = fs.readdirSync(directoryPath)
      if (files.length === 0) {
        fs.rmdirSync(directoryPath)
        return true
      }
    }
    return false
  }

  async openMountPoint(bookmark) {
    console.log('MountManager: Opening mount point for bookmark:', bookmark)
    const mountpoint = this.mountPoints.get(bookmark.$name)
    console.log('MountManager: Mount point path:', mountpoint)
    if (mountpoint && fs.existsSync(mountpoint)) {
      console.log('MountManager: Opening directory:', mountpoint)
      if (process.platform === 'win32') {
        shell.openPath(mountpoint).catch(error => {
          console.error('Failed to open path:', error)
          throw error
        })
      } else {
        shell.openPath(mountpoint)
      }
    } else {
      console.error('MountManager: Mount point does not exist:', mountpoint)
      throw new Error(`Точка монтирования не найдена. Возможно, диск не примонтирован.`)
    }
  }

  getMountStatus(bookmark) {
    const processId = `mount:${bookmark.$name}`
    const exists = this.processManager.exists(processId)
    console.log('MountManager: Mount status for', bookmark.$name, ':', exists)
    if (exists) {
      return true
    }
    return false
  }

  // ... остальные методы для монтирования
}

module.exports = MountManager 