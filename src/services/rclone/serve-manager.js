'use strict'

const settings = require('../settings')

class ServeManager {
  constructor(commandExecutor, processManager) {
    this.commandExecutor = commandExecutor
    this.processManager = processManager
  }

  getAvailableProtocols() {
    const protocols = {}
    
    if (settings.get('rclone_serving_http_enable')) {
      protocols.http = 'HTTP'
    }
    if (settings.get('rclone_serving_ftp_enable')) {
      protocols.ftp = 'FTP'
    }
    if (settings.get('rclone_serving_webdav_enable')) {
      protocols.webdav = 'WebDAV'
    }
    if (settings.get('rclone_serving_restic_enable')) {
      protocols.restic = 'Restic'
    }
    
    return protocols
  }

  startServing(protocol, bookmark) {
    const protocols = this.getAvailableProtocols()
    if (!protocols.hasOwnProperty(protocol)) {
      throw new Error(`Протокол "${protocol}" не поддерживается`)
    }

    const processId = `serve_${protocol}:${bookmark.$name}`
    if (this.processManager.exists(processId)) {
      throw new Error(`${bookmark.$name} уже обслуживается`)
    }

    const command = this.buildServeCommand(protocol, bookmark)
    this.processManager.create(processId, command)
  }

  stopServing(protocol, bookmark) {
    this.processManager.kill(`serve_${protocol}:${bookmark.$name}`)
  }

  getServeStatus(protocol, bookmark) {
    const processId = `serve_${protocol}:${bookmark.$name}`
    if (this.processManager.exists(processId)) {
      return this.processManager.getProcessData(processId).URI || ''
    }
    return false
  }

  buildServeCommand(protocol, bookmark) {
    return [
      'serve',
      protocol,
      this.getBookmarkRemoteWithRoot(bookmark),
      '--attr-timeout', Math.max(1, parseInt(settings.get('rclone_cache_files'))) + 's',
      '--dir-cache-time', Math.max(1, parseInt(settings.get('rclone_cache_directories'))) + 's',
      '-v'
    ]
  }

  getBookmarkRemoteWithRoot(bookmark) {
    return `${bookmark.$name}:${bookmark._rclonetray_remote_path || '/'}`
  }
}

module.exports = ServeManager 