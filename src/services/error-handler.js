'use strict'

const { dialog } = require('electron')

/**
 * Обработчик ошибок для rclone операций
 */
class ErrorHandler {
  /**
   * Показывает диалог с ошибкой
   * @param {Error|string} error - Ошибка или текст ошибки
   * @param {string} [title='Ошибка'] - Заголовок диалога
   */
  static showError(error, title = 'Ошибка') {
    const message = error instanceof Error ? error.message : error.toString()
    dialog.showErrorBox(title, message)
  }

  /**
   * Обработчик ошибок для асинхронных операций
   * @param {Error} error - Объект ошибки
   */
  static handleAsync(error) {
    console.error('Async error:', error)
    ErrorHandler.showError(error)
  }

  /**
   * Обработчик ошибок для операций rclone
   * @param {Error} error - Объект ошибки
   * @param {string} operation - Название операции
   */
  static handleRcloneError(error, operation) {
    console.error(`Rclone ${operation} error:`, error)
    ErrorHandler.showError(error, `Ошибка операции ${operation}`)
  }

  /**
   * Обработчик ошибок конфигурации
   * @param {Error} error - Объект ошибки
   */
  static handleConfigError(error) {
    console.error('Configuration error:', error)
    ErrorHandler.showError(error, 'Ошибка конфигурации')
  }
}

module.exports = ErrorHandler 