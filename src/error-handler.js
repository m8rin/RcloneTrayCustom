'use strict'

const dialogs = require('./dialogs')
const rclone = require('./rclone')
const fs = require('fs')
const path = require('path')
const logFilePath = path.join(__dirname, 'logs.txt') // Путь к файлу логов

// Объект для сопоставления ошибок с сообщениями на русском
const errorMessages = {
  // 'Error while': 'Ошибка во время выполнения',
  // 'Failed to': 'Не удалось выполнить действие',
  // 'Fatal Error': 'Серьезная ошибка',
  // "couldn't connect": 'Не удалось подключиться',
  "webdav root '': Statfs failed: Propfind": 'Ошибка WebDAV: Не удалось выполнить запрос. Проверьте, правильно ли указан адрес: {url}',
  "IO error: couldn't list files: Propfind": 'Ошибка ввода-вывода: Не удалось перечислить файлы. Проверьте, правильно ли указан адрес: {url}',
  "webdav root '': Statfs failed: 401": 'Ошибка WebDAV: Неправильный логин или пароль',
  "Failed to copy: 403": 'Доступ запрещён. Доступ только на чтение',
};

/**
 * Запись сообщения в файл логов
 * @param {string} message - Сообщение для записи
 */
const logToFile = function (message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${typeof message === 'object' ? JSON.stringify(message) : message}\n`;
  // fs.appendFileSync(logFilePath, logMessage, 'utf8');
};

/**
 * Обработка ошибок в выводе
 * @param {Object} lineInfo - Информация о строке лога
 */
const handleProcessOutput = function (lineInfo) {
  let isErrorHandled = false;
  let userMessage = ''

  // Проверяем, содержит ли сообщение об ошибке ключевые слова
  for (const [key, message] of Object.entries(errorMessages)) {
    if (new RegExp(key, 'i').test(lineInfo.message)) {
      userMessage = message

      // Извлекаем URL из сообщения об ошибке
      const urlMatch = lineInfo.message.match(/"(https?:\/\/[^"]+)"/);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        // Заменяем {url} в сообщении на фактический URL
        userMessage = userMessage.replace('{url}', url);
      }

      console.log('Rclone Watchdog lineInfo', lineInfo);
      dialogs.notification(userMessage); // Отображаем сообщение на русском
      logToFile(lineInfo);

      return;
    }
  }

  if (!isErrorHandled) {
    console.log('Rclone Watchdog lineInfo', lineInfo)
    // dialogs.notification('Неизвестная ошибка. Пожалуйста, проверьте логи для получения дополнительной информации.');
  }
};

module.exports = {
  errorMessages,
  logToFile,
  handleProcessOutput
};
