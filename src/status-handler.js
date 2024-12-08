'use strict'

const messages = [
  "webdav root '': Statfs failed: Propfind",
  "IO error: couldn't list files: Propfind",
  "critical error: couldn\'t list files: Propfind",
  "webdav root '': Statfs failed: 401",
  "Failed to copy: 403"
];

const bookmarksWithFailedStatus = new Set();

const addBookmarkWithFailedStatus = function (bookmark, lineInfo) {
  if (bookmarksWithFailedStatus.has(bookmark)) {
    return false;
  }

  if (isLogMatchingMessages(lineInfo)) {
    return false;
  }

  bookmarksWithFailedStatus.add(bookmark);
  return true;
};

const removeBookmarkWithFailedStatus = function (bookmark) {
  if (bookmarksWithFailedStatus.has(bookmark)) {
    bookmarksWithFailedStatus.delete(bookmark);
    return true;
  }
  return false;
};

const isLogMatchingMessages = function (lineInfo) {
  return messages.some(message => new RegExp(message, 'i').test(lineInfo.message));
};

const hasBookmarkWithFailedStatus = function (bookmark) {
  return bookmarksWithFailedStatus.has(bookmark);
};

module.exports = {
  addBookmarkWithFailedStatus,
  removeBookmarkWithFailedStatus,
  hasBookmarkWithFailedStatus
};
