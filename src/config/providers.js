'use strict'

const PROVIDERS = {
  UNSUPPORTED: ['union', 'crypt'],
  BUCKET_REQUIRED: ['b2', 'swift', 's3', 'gsc', 'hubic'],
  
  SUPPORTED: ['webdav', 'local'],
  
  ERROR_MESSAGES: {
    webdav: {
      connection: 'Ошибка WebDAV: Не удалось выполнить запрос',
      auth: 'Ошибка WebDAV: Неправильный логин или пароль'
    },
    common: {
      forbidden: 'Доступ запрещён. Доступ только на чтение.',
      notFound: 'Путь не найден или нет доступа'
    }
  }
}

module.exports = { PROVIDERS } 