addBookmark(type, name, values) {
  console.log('Adding bookmark:', { type, name, values })
  const bookmark = {
    $name: name,
    type: type,
    _rclonetray_custom_args: '',
    _rclonetray_local_path_map: '',
    _rclonetray_mount_drive: values._rclonetray_mount_drive || 'E',  // Буква диска для монтирования
    ...values
  }
  console.log('Created bookmark:', bookmark)
  
  this.bookmarks[name] = bookmark
  this.saveBookmarks()
  this.notifyUpdateCallbacks()
  return bookmark
}

updateBookmark(name, values) {
  console.log('Updating bookmark:', { name, values })
  const bookmark = this.getBookmark(name)
  if (!bookmark) {
    throw new Error(`Bookmark ${name} not found`)
  }

  Object.assign(bookmark, {
    ...values,
    $name: name,
    _rclonetray_mount_drive: values._rclonetray_mount_drive || bookmark._rclonetray_mount_drive || 'E'
  })
  console.log('Updated bookmark:', bookmark)

  this.saveBookmarks()
  this.notifyUpdateCallbacks()
  return bookmark
} 