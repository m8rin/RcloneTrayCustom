'use strict'

class StatusHandler {
  constructor() {
    this.bookmarksWithFailedStatus = new Set()
  }

  addBookmarkWithFailedStatus(bookmark, lineInfo) {
    if (this.bookmarksWithFailedStatus.has(bookmark)) {
      return false
    }

    if (this.isLogMatchingMessages(lineInfo)) {
      return false
    }

    this.bookmarksWithFailedStatus.add(bookmark)
    return true
  }

  removeBookmarkWithFailedStatus(bookmark) {
    if (this.bookmarksWithFailedStatus.has(bookmark)) {
      this.bookmarksWithFailedStatus.delete(bookmark)
      return true
    }
    return false
  }

  hasBookmarkWithFailedStatus(bookmark) {
    return this.bookmarksWithFailedStatus.has(bookmark)
  }

  isLogMatchingMessages(lineInfo) {
    const messages = [
      "webdav root '': Statfs failed: Propfind",
      "IO error: couldn't list files: Propfind", 
      "critical error: couldn't list files: Propfind",
      "webdav root '': Statfs failed: 401",
      "Failed to copy: 403"
    ]

    return messages.some(message => 
      new RegExp(message, 'i').test(lineInfo.message)
    )
  }
}

module.exports = new StatusHandler() 