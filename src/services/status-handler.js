'use strict'

/**
 * Обработчик статусов для закладок и операций
 */
class StatusHandler {
  constructor() {
    this.bookmarkStatuses = new Map()
    this.failedBookmarks = new Set()
  }

  /**
   * Добавить статус с ошибкой для закладки
   * @param {string} bookmarkName 
   * @param {Object} statusInfo 
   */
  addBookmarkWithFailedStatus(bookmarkName, statusInfo) {
    this.failedBookmarks.add(bookmarkName)
    this.bookmarkStatuses.set(bookmarkName, {
      status: 'failed',
      info: statusInfo,
      timestamp: Date.now()
    })
  }

  /**
   * Удалить статус с ошибкой для закладки
   * @param {string} bookmarkName 
   */
  removeBookmarkWithFailedStatus(bookmarkName) {
    this.failedBookmarks.delete(bookmarkName)
    this.bookmarkStatuses.delete(bookmarkName)
  }

  /**
   * Проверить, есть ли у закладки статус с ошибкой
   * @param {string} bookmarkName 
   * @returns {boolean}
   */
  hasFailedStatus(bookmarkName) {
    return this.failedBookmarks.has(bookmarkName)
  }

  /**
   * Получить информацию о статусе закладки
   * @param {string} bookmarkName 
   * @returns {Object|null}
   */
  getBookmarkStatus(bookmarkName) {
    return this.bookmarkStatuses.get(bookmarkName) || null
  }

  /**
   * Очистить все статусы
   */
  clearAllStatuses() {
    this.failedBookmarks.clear()
    this.bookmarkStatuses.clear()
  }
}

// Экспортируем синглтон
module.exports = new StatusHandler() 