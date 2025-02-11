async addBookmark(type, name, values) {
  console.log('Adding bookmark:', { type, name, values })
  
  if (!/^([a-zA-Z0-9\-_]{1,32})$/.test(name)) {
    throw new Error('Недопустимое имя.\nИмя должно содержать от 1 до 32 символов и состоять только из букв, цифр и _')
  }

  if (name in this.bookmarks) {
    throw new Error(`Закладка "${name}" уже существует`)
  }

  // Создаем закладку с базовыми полями
  const bookmark = {
    $name: name,
    type: type,
    // Специальные поля
    _rclonetray_custom_args: values._rclonetray_custom_args || '',
    _rclonetray_local_path_map: values._rclonetray_local_path_map || '',
    _rclonetray_mount_drive: values._rclonetray_mount_drive || '',  // Пустая строка для автоматического выбора
    // Остальные поля из формы
    ...values
  }
  console.log('Created bookmark:', bookmark)

  try {
    // Создаем начальную конфигурацию
    const iniBlock = `\n[${name}]\nconfig_automatic = no\ntype = ${type}\n`
    fs.appendFileSync(this.commandExecutor.configFile, iniBlock)

    try {
      await this.updateBookmarkFields(name, type, values)
      this.updateBookmarksCache()
      dialogs.notification(`Закладка ${name} успешно создана`)
      return true
    } catch (err) {
      // Откатываем изменения при ошибке
      await this.commandExecutor.execute(['config', 'delete', name])
      console.error('Failed to create bookmark:', err)
      throw new Error('Не удается записать параметры закладок в конфигурацию.')
    }
  } catch (err) {
    console.error('Failed to create bookmark:', err)
    throw new Error('Не удается создать новую закладку')
  }
}

updateBookmark(name, values) {
  console.log('Updating bookmark:', { name, values })
  const bookmark = this.getBookmark(name)
  if (!bookmark) {
    throw new Error(`Bookmark ${name} not found`)
  }

  // Сохраняем существующие специальные поля
  const specialFields = {
    $name: name,
    type: values.type || bookmark.type,
    _rclonetray_custom_args: values._rclonetray_custom_args || bookmark._rclonetray_custom_args || '',
    _rclonetray_local_path_map: values._rclonetray_local_path_map || bookmark._rclonetray_local_path_map || '',
    _rclonetray_mount_drive: values._rclonetray_mount_drive || ''  // Сохраняем пустое значение если выбрано "Автоматически"
  }

  // Обновляем закладку, сохраняя специальные поля
  Object.assign(bookmark, values, specialFields)

  console.log('Updated bookmark:', bookmark)
  
  try {
    this.saveBookmarks()
    this.notifyUpdateCallbacks()
    return bookmark
  } catch (err) {
    console.error('Failed to save bookmark:', err)
    throw new Error('Не удалось сохранить закладку')
  }
} 