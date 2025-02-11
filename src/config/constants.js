'use strict'

const path = require('path')
const isDev = require('electron-is-dev')

const CONSTANTS = {
  APP_NAME: 'CSync',
  RCLONE_BINARY_NAME: process.platform === 'win32' ? 'rclone.exe' : 'rclone',
  
  getRcloneBundledPath() {
    const resourcesPath = isDev 
      ? path.join(__dirname, '..', '..', 'rclone')
      : process.resourcesPath

    if (process.platform === 'win32') {
      return path.join(resourcesPath, 'win32', 'rclone.exe')
    } else if (process.platform === 'darwin') {
      return path.join(resourcesPath, 'darwin', 'rclone')
    } else {
      return path.join(resourcesPath, 'linux', 'rclone')
    }
  },

  DIALOG_TYPES: {
    PREFERENCES: 'preferences',
    ADD_BOOKMARK: 'add-bookmark',
    EDIT_BOOKMARK: 'edit-bookmark'
  },

  FILE_EXPLORER_LABEL: process.platform === 'darwin' 
    ? 'Finder'
    : process.platform === 'win32' 
      ? 'Проводнике' 
      : 'Файловом менеджере',

  DEFAULT_SETTINGS: {
    tray_menu_show_type: true,
    rclone_use_bundled: true,
    rclone_config: '',
    custom_args: '',
    rclone_cache_files: 3,
    rclone_cache_directories: 10,
    rclone_sync_enable: true,
    rclone_sync_autoupload_delay: 15,
    rclone_ncdu_enable: false,
    rclone_serving_http_enable: false,
    rclone_serving_ftp_enable: false,
    rclone_serving_restic_enable: false,
    rclone_serving_webdav_enable: false,
    rclone_serving_username: '',
    rclone_serving_password: ''
  }
}

module.exports = { CONSTANTS } 