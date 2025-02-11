'use strict'

const { shell, dialog, app, Notification } = require('electron')
const DialogManager = require('../ui/dialog-manager')
const { CONSTANTS } = require('../config/constants')
const rclone = require('./rclone')

class DialogService {
  constructor() {
    this.dialogManager = DialogManager
  }

  showPreferences() {
    return this.dialogManager.createDialog(CONSTANTS.DIALOG_TYPES.PREFERENCES, {
      width: 600,
      height: 300
    })
  }

  showAddBookmark() {
    return this.dialogManager.createDialog(CONSTANTS.DIALOG_TYPES.ADD_BOOKMARK, {
      width: 600,
      height: 100
    })
  }

  showEditBookmark(bookmark) {
    return this.dialogManager.createDialog(CONSTANTS.DIALOG_TYPES.EDIT_BOOKMARK, {
      width: 600,
      height: 460
    }, bookmark)
  }

  missingRclone() {
    const { dialog } = require('electron')
    dialog.showErrorBox(
      'Ошибка',
      'Не удается найти исполняемый файл rclone. Пожалуйста, убедитесь, что rclone установлен и доступен в системе.'
    )
  }

  notification(message) {
    if (Notification.isSupported()) {
      console.log('Showing notification:', message)
      new Notification({
        title: 'CSync',
        body: message,
        silent: false
      }).show()
    } else {
      console.log('Notification:', message)
      dialog.showMessageBox(null, {
        type: 'info',
        title: 'CSync',
        message: message
      })
    }
  }

  errorMultiInstance() {
    dialog.showErrorBox('', 'CSync уже запущен и не может быть запущен дважды.')
  }

  uncaughtException(detail) {
    if (app.isReady()) {
      const choice = dialog.showMessageBox(null, {
        type: 'warning',
        buttons: ['Выход', 'Отмена'],
        title: 'Ошибка',
        message: 'Непредвиденная ошибка.',
        detail: (detail || '').toString()
      })
      app.focus()
      return choice === 0
    } else {
      dialog.showErrorBox(
        'Непредвиденная ошибка во время выполнения. Не удается запустить CSync.',
        (detail || '').toString()
      )
      app.focus()
      return true
    }
  }

  confirmExit() {
    const choice = dialog.showMessageBox(null, {
      type: 'warning',
      buttons: ['Да', 'Нет'],
      title: 'Выйти из CSync',
      message: 'Вы уверены, что хотите выйти?',
      detail: 'Есть активные процессы, которые будут завершены.'
    })
    return choice === 0
  }

  async selectDriveLetter(availableLetters) {
    const result = await dialog.showMessageBox(null, {
      type: 'question',
      buttons: availableLetters.map(letter => `${letter}:`),
      defaultId: 0,
      title: 'Выбор буквы диска',
      message: 'Выберите букву для монтирования диска:',
      detail: 'Выберите букву, которая будет использоваться для монтирования.'
    })
    
    if (result.response === -1) {
      return null
    }
    
    return availableLetters[result.response]
  }
}

module.exports = new DialogService() 