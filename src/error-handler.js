'use strict'

const dialogs = require('./dialogs')
const fs = require('fs').promises;
const path = require('path')
const {app} = require('electron');
const logFilePath = path.join(app.getPath('userData'), 'logs', 'logs.txt');

/**
 * Объекты для сопоставления ошибок с сообщениями на русском
 *
 * Флаг alwaysNotify для регулировки спама уведомления
 * alwaysNotify: false. Уведомление будет показано только один раз для закладки до сброса флага через resetNotificationFlag. Сейчас сбрасывается при 'unmount' и получение лога 'Bisync successful'
 * alwaysNotify: true. Уведомление будет показано всегда для ошибки с таким флагом
 */
const errorMessages = {
  // 'Error while': 'Ошибка во время выполнения',
  // 'Failed to': 'Не удалось выполнить действие',
  // 'Fatal Error': 'Серьезная ошибка',
  // "couldn't connect": 'Не удалось подключиться',
  "webdav root '': Statfs failed: Propfind": {
    message: 'Ошибка WebDAV: Не удалось выполнить запрос. Проверьте, правильно ли указан адрес: {url}',
    alwaysNotify: false
  },
  "IO error: couldn't list files: Propfind": {
    message: 'Ошибка ввода-вывода: Не удалось перечислить файлы. Проверьте, правильно ли указан адрес: {url}',
    alwaysNotify: false
  },
  "critical error: couldn't list files: Propfind": {
    message: 'Ошибка синхронизации: Не удалось получить список файлов. Проверьте наличие соединения.',
    alwaysNotify: false
  },
  "webdav root '': Statfs failed: 401": {
    message: 'Ошибка WebDAV: Неправильный логин или пароль',
    alwaysNotify: false
  },
  "Failed to copy: 403": {
    message: 'Доступ запрещён. Доступ только на чтение',
    alwaysNotify: false
  },
};

const notificationFlags = {};

/**
 * Запись сообщения в файл логов асинхронно
 * @param {string} message - Сообщение для записи
 */
const logToFile = async function (message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${typeof message === 'object' ? JSON.stringify(message) : message}\n`;

  try {
    await fs.appendFile(logFilePath, logMessage, 'utf8');
  } catch (error) {
    console.error('Ошибка записи в лог файл:', error);
  }
};

/**
 * Обработка ошибок в выводе
 * @param bookmarkName имя закладки
 * @param {Object} lineInfo - Информация о строке лога
 */
const handleProcessOutput = async function (bookmarkName, lineInfo) {
  let userMessage = '';

  if (bookmarkName && !notificationFlags[bookmarkName]) {
    notificationFlags[bookmarkName] = false;
  }

  // Проверяем, содержит ли сообщение об ошибке ключевые слова
  for (const [key, {message, alwaysNotify}] of Object.entries(errorMessages)) {
    if (new RegExp(key, 'i').test(lineInfo.message)) {
      userMessage = message;

      // Извлекаем URL из сообщения об ошибке
      const urlMatch = lineInfo.message.match(/"(https?:\/\/[^"]+)"/);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        // Заменяем {url} в сообщении на фактический URL
        userMessage = userMessage.replace('{url}', url);
      }

      var showNotify = false;

      if (alwaysNotify) {
        showNotify = true;
      } else {
        if (!bookmarkName || !notificationFlags[bookmarkName]) {
          showNotify = true;
          notificationFlags[bookmarkName] = true;
        } else {
          showNotify = false;
        }
      }

      if (showNotify) {
        dialogs.notification(userMessage);
      }

      await logToFile(lineInfo);
      return;
    }
  }

  console.log('Rclone Watchdog lineInfo', lineInfo);
};

const resetNotificationFlag = function (bookmarkName) {
  if (!bookmarkName || !notificationFlags[bookmarkName]) {
    notificationFlags[bookmarkName] = false;
  }
};

module.exports = {
  errorMessages,
  logToFile,
  handleProcessOutput,
  resetNotificationFlag
};
