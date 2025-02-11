const form = document.createElement('form')
form.className = 'form'

// Создаем поля формы на основе провайдера
provider.fields.forEach(field => {
  const container = document.createElement('div')
  container.className = 'form-group'

  const label = document.createElement('label')
  label.textContent = field.label || field.name
  label.htmlFor = field.name

  let input
  if (field.type === 'select') {
    input = document.createElement('select')
    field.options.forEach(option => {
      const opt = document.createElement('option')
      opt.value = option.value
      opt.textContent = option.label
      input.appendChild(opt)
    })
  } else {
    input = document.createElement('input')
    input.type = field.type || 'text'
  }
  input.id = field.name
  input.name = field.name
  input.className = 'form-control'
  if (field.required) input.required = true

  container.appendChild(label)
  container.appendChild(input)
  form.appendChild(container)

  // Добавляем выбор буквы диска после поля URL
  if (field.name === 'url') {
    const driveLetterContainer = document.createElement('div')
    driveLetterContainer.className = 'form-group'
    
    const driveLetterSelect = document.createElement('select')
    driveLetterSelect.id = '_rclonetray_mount_drive'
    driveLetterSelect.name = '_rclonetray_mount_drive'
    driveLetterSelect.className = 'form-control'
    
    const driveLetterLabel = document.createElement('label')
    driveLetterLabel.textContent = 'Буква диска для монтирования (необязательно)'
    driveLetterLabel.htmlFor = '_rclonetray_mount_drive'
    
    // Добавляем пустой вариант для автоматического выбора
    const emptyOption = document.createElement('option')
    emptyOption.value = ''
    emptyOption.textContent = 'Автоматически'
    driveLetterSelect.appendChild(emptyOption)
    
    ;['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 
      'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].forEach(letter => {
        const option = document.createElement('option')
        option.value = letter
        option.textContent = letter + ':'
        driveLetterSelect.appendChild(option)
    })
    
    driveLetterContainer.appendChild(driveLetterLabel)
    driveLetterContainer.appendChild(driveLetterSelect)
    form.appendChild(driveLetterContainer)
  }
})

// Добавляем поле выбора буквы диска
const driveLetter = {
  name: '_rclonetray_mount_drive',
  label: 'Буква диска для монтирования (необязательно)',
  type: 'select',
  options: ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 
    'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map(letter => ({
      value: letter,
      label: letter + ':'
    }))
}

const container = document.createElement('div')
container.className = 'form-group'

const label = document.createElement('label')
label.textContent = driveLetter.label
label.htmlFor = driveLetter.name

const select = document.createElement('select')
select.id = driveLetter.name
select.name = driveLetter.name
select.className = 'form-control'

// Добавляем пустой вариант для автоматического выбора
const emptyOption = document.createElement('option')
emptyOption.value = ''
emptyOption.textContent = 'Автоматически'
select.appendChild(emptyOption)

driveLetter.options.forEach(option => {
  const opt = document.createElement('option')
  opt.value = option.value
  opt.textContent = option.label
  select.appendChild(opt)
})

container.appendChild(label)
container.appendChild(select)
form.appendChild(container)

// Обработчик формы
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = nameInput.value.trim()
  const mountDrive = driveLetterSelect.value

  try {
    await rclone.addBookmark(provider.name, name, {
      _rclonetray_mount_drive: mountDrive
    })
    window.close()
  } catch (err) {
    console.error('Failed to add bookmark:', err)
  }
}) 