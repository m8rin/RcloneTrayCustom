const form = document.createElement('form')
form.className = 'form'

// Добавляем поле выбора буквы диска
const driveLetterContainer = document.createElement('div')
driveLetterContainer.className = 'form-group'

const driveLetterSelect = document.createElement('select')
driveLetterSelect.id = '_rclonetray_mount_drive'
driveLetterSelect.name = '_rclonetray_mount_drive'
driveLetterSelect.className = 'form-control'
driveLetterSelect.value = bookmark._rclonetray_mount_drive || 'E'

;['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].forEach(letter => {
  const option = document.createElement('option')
  option.value = letter
  option.textContent = letter + ':'
  driveLetterSelect.appendChild(option)
})

const driveLetterLabel = document.createElement('label')
driveLetterLabel.textContent = 'Буква диска для монтирования:'
driveLetterLabel.htmlFor = '_rclonetray_mount_drive'

driveLetterContainer.appendChild(driveLetterLabel)
driveLetterContainer.appendChild(driveLetterSelect)

// Создаем поля формы на основе провайдера
provider.fields.forEach(field => {
  // ... существующий код создания полей ...
})

// Добавляем выбор буквы диска после основных полей
form.appendChild(driveLetterContainer)

// Добавляем кнопки
const buttons = document.createElement('div')
buttons.className = 'buttons'

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const formData = new FormData(form)
  console.log('Form data:', Object.fromEntries(formData))
  const values = {
    ...Object.fromEntries(formData),
    _rclonetray_mount_drive: driveLetterSelect.value,
    type: bookmark.type
  }
  console.log('Submitting values:', values)

  try {
    rclone.updateBookmark(bookmark.$name, values)
    window.close()
  } catch (err) {
    console.error('Failed to update bookmark:', err)
  }
}) 