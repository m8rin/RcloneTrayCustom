const driveLetterSelect = document.createElement('select')
driveLetterSelect.id = 'rclone_mount_drive'
;['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].forEach(letter => {
  const option = document.createElement('option')
  option.value = letter
  option.textContent = letter + ':'
  driveLetterSelect.appendChild(option)
})
driveLetterSelect.value = settings.get('rclone_mount_drive')

const driveLetterLabel = document.createElement('label')
driveLetterLabel.textContent = 'Предпочтительная буква диска:'
driveLetterLabel.htmlFor = 'rclone_mount_drive'

// Добавляем элементы в форму
form.appendChild(driveLetterLabel)
form.appendChild(driveLetterSelect) 