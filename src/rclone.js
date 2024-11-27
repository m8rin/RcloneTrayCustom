'use strict'

const { exec, execSync, spawn } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')
const chokidar = require('chokidar')
const ini = require('ini')
const { app, shell } = require('electron')
const isDev = require('electron-is-dev')
const settings = require('./settings')
const dialogs = require('./dialogs')
const errorHandler = require('./error-handler')

/**
 * Define unsupported provider types
 * @private
 */
const UnsupportedRcloneProviders = [
  'union',
  'crypt'
]

/**
 * Define providers that require buckets and cannot works with root.
 * @private
 */
const BucketRequiredProviders = [
  'b2',
  'swift',
  's3',
  'gsc',
  'hubic'
]

/**
 * Rclone executable filename
 * @private
 */
const RcloneBinaryName = process.platform === 'win32' ? 'rclone.exe' : 'rclone'

/**
 * Bundled Rclone path
 * @private
 */
const RcloneBinaryBundled = app.isPackaged
  // When packed, the rclone is placed under the resource directory.
  ? path.join(process.resourcesPath, 'rclone', process.platform, RcloneBinaryName)
  // When unpacked and in dev, rclone directory is whithin the app directory.
  : path.join(app.getAppPath(), 'rclone', process.platform, RcloneBinaryName)

/**
 * System's temp directory
 * @private
 */
const tempDir = app.getPath('temp')

/**
 * Rclone settings cache
 * @private
 */
const Cache = {
  version: null,
  configFile: '',
  providers: {},
  bookmarks: {}
}

/**
 * @private
 */
const UpdateCallbacksRegistry = []

/**
 * BookmarkProcessManager registry
 * @private
 */
const BookmarkProcessRegistry = {}

/**
 * Automatic Upload for bookmark registry
 * @private
 */
const AutomaticUploadRegistry = {}

/**
 * Enquote command
 * @param {Array} command
 */
const enquoteCommand = function (command) {
  for (let i in command) {
    if (command[i].substr(0, 2) !== '--') {
      command[i] = JSON.stringify(command[i])
    }
  }
  return command
}

/**
 * Prepare array to Rclone command, rclone binary should be ommited
 * @param {array} command
 * @returns {string|array}
 * @private
 */
const prepareRcloneCommand = function (command) {
  let config = getConfigFile()
  if (config) {
    command.unshift('--config', config)
  }

  if (settings.get('rclone_use_bundled')) {
    command.unshift(RcloneBinaryBundled)
  } else {
    command.unshift(RcloneBinaryName)
  }

  command.push('--auto-confirm')

  return command
}

/**
 * Append custom rclone args to command array
 * @param {Array} commandArray
 * @param {string} bookmarkName
 * @returns {Array}
 */
const appendCustomRcloneCommandArgs = function (commandArray, bookmarkName) {
  // @private
  const verboseCommandStrPattern = new RegExp(/^-v+\b/)
  const filterCustomArgsVerbose = function (arg) {
    if (verboseCommandStrPattern.test(arg)) {
      return false
    }
  }

  const argsSplitterPattern = new RegExp(/\n+/)

  let customGlobalArgs = settings.get('custom_args').trim().split(argsSplitterPattern)
//  customGlobalArgs = customGlobalArgs.filter(filterCustomArgsVerbose)
  commandArray = commandArray.concat(customGlobalArgs)

  if (bookmarkName) {

    let bookmark = getBookmark(bookmarkName)
    console.info('Debug Ilya', bookmark)
    if ('_rclonetray_custom_args' in bookmark && bookmark._rclonetray_custom_args.trim()) {
      let customBookmarkArgs = bookmark._rclonetray_custom_args.trim().split(argsSplitterPattern)
      console.info('Debug Ilya', customBookmarkArgs)
//      customBookmarkArgs = customBookmarkArgs.filter(filterCustomArgsVerbose)
      console.info('Debug Ilya', customBookmarkArgs)
      commandArray = commandArray.concat(customBookmarkArgs)
    }
  }

  // Remove empties.
  return commandArray.filter(function (element) {
    return !!element.trim()
  })
}

/**
 * Execute async Rclone command
 * @param command
 * @returns {Promise}
 * @private
 */
const doCommand = function (command) {
  return new Promise(function (resolve, reject) {
    command = prepareRcloneCommand(command)
    command = enquoteCommand(command)
    if (isDev) {
      console.info('Rclone[A]', command)
    }
    exec(command.join(' '), {maxBuffer: 1024 * 2048} ,function (err, stdout, stderr) {
      if (err) {
        console.error('Rclone', err)
        errorHandler.logToFile(err)
        reject(Error('Rclone command error.'))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Execute synchronious Rclone command and return the output
 * @param command
 * @returns {string}
 * @private
 * @throws {err}
 */
const doCommandAsync = function (command) {
  return new Promise((resolve, reject) => {
    command = prepareRcloneCommand(command)
    command = enquoteCommand(command)
    if (isDev) {
      console.info('Rclone[S]', command)
    }
    exec(command.join(' '), (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve(stdout.toString())
      }
    })
  })
}

const doCommandSync = function (command) {
  command = prepareRcloneCommand(command)
  command = enquoteCommand(command)
  if (isDev) {
    console.info('Rclone[S]', command)
  }
  return execSync(command.join(' ')).toString()
}

/**
 *
 * @param {*} command
 */
const doCommandInTerminal = function (command) {
  command = enquoteCommand(command)
  command = command.join(' ')

  if (isDev) {
    console.log('Rclone[T]', command)
  }

  if (process.platform === 'darwin') {
    // macOS's Terminal
    command = command.replace(new RegExp('"', 'g'), '\\"')
    spawn('/usr/bin/osascript', ['-e', `tell application "Terminal" to do script "${command}" activate`])
  } else if (process.platform === 'linux') {
    // Linux terminal
    let tempCmdWrapper = path.join(tempDir, 'rclonetray-linux-cmd-wrapper.sh')
    const data = new Uint8Array(Buffer.from(command))
    fs.writeFile(tempCmdWrapper, data, function (err) {
      if (err) {
        throw Error('Не удается открыть терминал')
      } else {
        fs.chmodSync(tempCmdWrapper, 0o755)
        exec(`x-terminal-emulator -e "${tempCmdWrapper}"`)
      }
    })
  } else if (process.platform === 'win32') {
    // Windows cmd
    exec(`start cmd.exe /K "${command}"`)
  }
}

/**
 * Simple process tracker. Used to track the rclone command processes status and output.
 */
class BookmarkProcessManager {
  /**
   * Constructor
   * @param {*} processName
   * @param {*} bookmarkName
   */
  constructor (processName, bookmarkName) {
    this.id = `${bookmarkName}:${processName}`
    this.bookmarkName = bookmarkName
    this.processName = processName
  };

  /**
   * Create new monitored process
   * @param {Array} command
   */
  create (command) {
    if (!command || command.length < 0) {
      throw Error('Некорректная команда')
    }
    if (this.exists()) {
      console.error(`Trying to create new ${this.processName} over existing for ${this.bookmarkName}.`)
      errorHandler.logToFile(`Trying to create new ${this.processName} over existing for ${this.bookmarkName}.`)
      // throw Error('Такой процесс уже существует.')
    }
    let id = this.id

    command = prepareRcloneCommand(command)
    command = appendCustomRcloneCommandArgs(command, this.bookmarkName)

    BookmarkProcessRegistry[id] = {
      bookmarkName: this.bookmarkName,
      processName: this.processName,
      process: spawn(command[0], command.slice(1)),
      data: {
        OK: false
      }
    }

    if (isDev) {
      console.log('Rclone[BP]', command)
      errorHandler.logToFile(command)
    }

    BookmarkProcessRegistry[id].process.stderr.on('data', this.rcloneProcessWatchdog.bind(this))

    BookmarkProcessRegistry[id].process.on('close', function () {
      if (BookmarkProcessRegistry[id].data.OK) {
        if (BookmarkProcessRegistry[id].processName === 'download') {
          dialogs.notification(`Скачивание из ${BookmarkProcessRegistry[id].bookmarkName} завершено`)
        } else if (BookmarkProcessRegistry[id].processName === 'upload') {
          dialogs.notification(`Загрузка в ${BookmarkProcessRegistry[id].bookmarkName} завершена`)
        } else if (BookmarkProcessRegistry[id].processName === 'mount') {
          dialogs.notification(`Отмонтирован ${BookmarkProcessRegistry[id].bookmarkName}`)
        } else if (BookmarkProcessRegistry[id].processName.startsWith('serve_')) {
          let servingProtocolName = getAvailableServeProtocols()[BookmarkProcessRegistry[id].data.protocol]
          dialogs.notification(`${servingProtocolName} сервер для ${BookmarkProcessRegistry[id].bookmarkName} остановлен`)
        }
      }
      delete BookmarkProcessRegistry[id]
      fireRcloneUpdateActions()
    })
  }

  /**
   * Get the process
   * @returns {childProcess}
   */
  getProcess () {
    return BookmarkProcessRegistry[this.id].process
  }

  /**
   * Set meta data
   * @param {string} key
   * @param {*} value
   */
  set (key, value) {
    if (this.exists()) {
      BookmarkProcessRegistry[this.id].data[key] = value
      return true
    } else {
      return false
    }
  }

  /**
   * Get meta data
   * @param {*} key
   * @returns {*}
   */
  get (key) {
    return BookmarkProcessRegistry[this.id].data[key]
  }

  /**
   * Check if process is existing and running
   * @returns bool
   */
  exists () {
    return BookmarkProcessRegistry.hasOwnProperty(this.id)
  }

  /**
   * Kill the process wit signal
   * @param {string} signal
   */
  kill (signal) {
    if (this.exists()) {
      BookmarkProcessRegistry[this.id].process.kill(signal || 'SIGTERM')
    } else {
      throw Error('Такого процесса нет')
    }
  }

  /**
   * Kill all processes for given bookmark
   * @param {string} bookmarkName
   */
  static killAll (bookmarkName) {
    Object.values(BookmarkProcessRegistry).forEach(function (item) {
      if (!bookmarkName || item.bookmarkName === bookmarkName) {
        item.process.kill()
      }
    })
  }

  /**
   * Get count of active processes
   * @returns {Number}
   */
  static getActiveProcessesCount () {
    return Object.values(BookmarkProcessRegistry).length
  }

  /**
   * @TODO make better log catcher
   *
   * Process rclone output line and do action
   * @param {string} logLine
   * @param {{}} bookmark
   * @param {BookmarkProcessManager} bookmarkProcess
   */
  rcloneProcessWatchdogLine (logLine) {
    // Prepare lineInfo{time,level,message}
    let lineInfo = {}

    // Time is Y/m/d H:i:s
    lineInfo.time = logLine.substr(0, 19)

    // Level could be ERROR, NOTICE, INFO or DEBUG.
    logLine = logLine.substr(19).trim().split(':')
    lineInfo.level = (logLine[0] || '').toString().toUpperCase().trim()

    if (['ERROR', 'NOTICE', 'INFO', 'DEBUG'].indexOf(lineInfo.level) === -1) {
      lineInfo.level = 'UNKNOWN'
      lineInfo.message = logLine.join(':').trim()
    } else {
      // String message
      lineInfo.message = logLine.slice(1).join(':').trim()
    }

    // Just refresh when:
    if (/rclone.*finishing/i.test(lineInfo.message)) {
      fireRcloneUpdateActions()
      return
    }

    // Catch errors in the output, so need to kill the process and refresh
    if (['ERROR'].indexOf(lineInfo.level) !== -1) {
      errorHandler.handleProcessOutput(lineInfo)

      if (/(Statfs failed|IO error: couldn't list files: Propfind)/i.test(lineInfo.message)) {
        unmount(this.bookmarkName);
      }

      fireRcloneUpdateActions()
      return
    }

//     if (/(Error while|Failed to|Fatal Error|coudn't connect|no such host)/i.test(lineInfo.message)) {
//       console.log('Rclone Watchdog', lineInfo)
//       dialogs.notification(lineInfo.message)
// //      BookmarkProcessRegistry[this.id].process.kill()
//       fireRcloneUpdateActions()
//       return
//     }

    // When remote is mounted.
    if (/Mounting on "/.test(lineInfo.message)) {
      dialogs.notification(`Примонтирован ${this.bookmarkName}`)
      fireRcloneUpdateActions()
      this.set('OK', true)
      return
    }

    // When serving address is already binded.
    let addressInUse = lineInfo.message.match(/Opening listener.*address already in use/i)
    if (addressInUse) {
      dialogs.notification(addressInUse[0])
      BookmarkProcessRegistry[this.id].process.kill()
      fireRcloneUpdateActions()
      return
    }

    // Serving is started.
    let matchingString = lineInfo.message.match(/(Serving FTP on|Serving on|Server started on|Serving restic REST API on)\s*(.*)$/i)
    if (matchingString && matchingString[2]) {
      dialogs.notification(matchingString[0])
      this.set('OK', true)
      if (matchingString[1] === 'Serving FTP on') {
        this.set('URI', 'ftp://' + matchingString[2])
      } else {
        this.set('URI', matchingString[2])
      }
      fireRcloneUpdateActions()
      return
    }

    if (isDev) {
      console.log('Rclone Watchdog', lineInfo)
    }

    // ERROR логируется в файл в handleProcessOutput(), DEBUG не логируется
    if (['NOTICE', 'INFO'].indexOf(lineInfo.level) !== -1) {
      errorHandler.logToFile(lineInfo)
    }
  }

  /**
   * Helper function that split stream to lines and send to rcloneProcessWatchdogLine for processing
   * @param {{}} bookmark
   * @param {{}} data
   */
  rcloneProcessWatchdog (data) {
    // https://stackoverflow.com/a/30136877
    let acc = ''
    let splitted = data.toString().split(/\r?\n/)
    let inTactLines = splitted.slice(0, splitted.length - 1)
    // if there was a partial, unended line in the previous dump, it is completed by the first section.
    inTactLines[0] = acc + inTactLines[0]
    // if there is a partial, unended line in this dump,
    // store it to be completed by the next (we assume there will be a terminating newline at some point.
    // This is, generally, a safe assumption.)
    acc = splitted[splitted.length - 1]
    for (var i = 0; i < inTactLines.length; ++i) {
      this.rcloneProcessWatchdogLine(inTactLines[i].trim())
    }
  }
}

/**
 * Get current config file location
 * @returns {string}
 */
const getConfigFile = function () {
  return Cache.configFile
}

/**
 * Update version cache
 * @private
 */
const updateVersionCache = function () {
  let output = doCommandSync(['version'])
  let version = output.trim().split(/\r?\n/).shift().split(/\s+/).pop() || 'Unknown'
  if (Cache.version && Cache.version !== version) {
    // rclone binary is upgraded
  }
  Cache.version = version
}

/**
 * Update bookmarks cache
 * @private
 */
const updateBookmarksCache = function () {
  doCommand(['config', 'dump'])
    .then(function (bookmarks) {
      Cache.bookmarks = {}
      try {
        bookmarks = JSON.parse(bookmarks)

        // Add virtual $name representing the bookmark name from index.
        Object.keys(bookmarks).forEach(function (key) {
          if (UnsupportedRcloneProviders.indexOf(bookmarks[key].type) !== -1) {
            return
          }
          Cache.bookmarks[key] = bookmarks[key]
          Cache.bookmarks[key].$name = key
        })
      } catch (err) {
        throw Error('Проблема с чтением списка закладок.')
      }
      fireRcloneUpdateActions()
    })
}

/**
 * Update providers cache, add $type options objects
 * @private
 */
const updateProvidersCache = function () {
  doCommand(['config', 'providers'])
    .then(function (providers) {
      try {
        providers = JSON.parse(providers)
      } catch (err) {
        throw Error('Не удается прочитать список п��овайдеро.')
      }

      Cache.providers = {}

      const filteredProviders = providers.filter(provider =>
        provider.Name === 'webdav' || provider.Name === 'local'
      )

      filteredProviders.forEach(function (provider) {
        if (UnsupportedRcloneProviders.indexOf(provider.Prefix) !== -1) {
          return false
        }

        if (BucketRequiredProviders.indexOf(provider.Prefix) !== -1) {
          provider.Options.unshift({
            $Label: 'Bucket or Path',
            $Type: 'string',
            Name: '_rclonetray_remote_path',
            Help: '',
            Required: true,
            Hide: false,
            Advanced: false
          })
        }

        provider.Options.map(function (optionDefinition) {
          // Detect type acording the default value and other criteries.
          optionDefinition.$Type = 'string'
          if (optionDefinition.Default === true || optionDefinition.Default === false) {
            optionDefinition.$Type = 'boolean'
          } else if (!isNaN(parseFloat(optionDefinition.Default)) && isFinite(optionDefinition.Default)) {
            optionDefinition.$Type = 'number'
          } else if (optionDefinition.IsPassword) {
            optionDefinition.$Type = 'password'
          } else {
            optionDefinition.$Type = 'string'
          }

          optionDefinition.$Namespace = 'options'
          return optionDefinition
        })

        // Add custom preferences.
        provider.Options.push({
          $Label: 'Локальный путь',
          $Type: 'directory',
          Name: '_rclonetray_local_path_map',
          Help: 'Установите локальный каталог, который мог бы соответствовать удаленному корневому каталогу. Эта опция необходима для использования функций загрузки.',
          Required: false,
          Hide: false,
          Advanced: false
        })

        // custom args
        provider.Options.push({
          $Label: 'Пользовательские аргументы',
          $Type: 'text',
          Name: '_rclonetray_custom_args',
          Help: `
            Пользовательские аргументы, разделенные пробелом или новой строкой.
            Подробнее о возможностях читайте на сайте https://rclone.org/${provider.Name}/#standard-options
          `,
          Required: false,
          Hide: false,
          Advanced: true
        })

        // Удаляем не нужные нам поля
        provider.Options = provider.Options.filter(function (item) {
          return item.Name != 'bearer_token' && item.Name != 'bearer_token_command' && item.Name != 'unix_socket'
             && item.Name != 'owncloud_exclude_mounts' && item.Name != 'owncloud_exclude_shares' && item.Name != "nextcloud_chunk_size"
        })

        // Set system $Label
        provider.Options.map(function (item) {
          // Исключаем варианты выбора у поля Вендор
          if (item.Name == 'vendor') {
            item.Examples = item.Examples.filter(function (vend) {
              return vend.Value == 'other'
            })
          }

          if (!item.hasOwnProperty('$Label')) {
            item.$Label = item.Name
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (string) {
                return string.charAt(0).toUpperCase() + string.substr(1)
              })
              .trim()

            const helpMessages = {
              // Локальный диск
              'Nounc': {
                Help: 'Отключить преобразование UNC (длинных имен путей) в Windows.',
                newLabel: 'Существительные'
              },
              'Copy Links': {
                Help: 'Перейдите по символическим ссылкам и скопируйте указанный элемент.',
                newLabel: 'Копировать ссылки'
              },
              'Links': {
                Help: 'Переводите символические ссылки в обычные файлы с расширением ".rclonelink".',
                newLabel: 'Ссылки'
              },
              'Skip Links': {
                Help: 'Не предупреждать о пропущенных символических ссылках.\n\n' +
                  'Этот флаг оключает сообщения предупреждения о пропущенных символических ссылках или точках соединения, так как вы явно признаете, что их следует пропустить.',
                newLabel: 'Пропустить ссылки'
              },
              'Zero Size Links': {
                Help: 'Предположите, что размер ссылок равен нулю (и читайте их вместо этого) (устарело).\n\n' +
                  'Rclone раньше использовал размер Stat ссылок как размер ссылки, но это не срабатывает во многих случаях:\n\n' +
                  '- Windows\n' +
                  '- На некоторых виртуальных файловых системах (например, LucidLink)\n' +
                  '- Android.\n\n' +
                  'Поэтому rclone теперь всегда читает ссылку.',
                newLabel: 'Ссылки нулевого размера'
              },
              'Unicode Normalization': {
                Help: 'Примените нормализацию Unicode NFC к путям и именам файлов.\n\n' +
                  'Этот флаг может быть использован для нормализации имен файлов в форму unicode NFC, которые считываются из локальной файловой системы.\n\n' +
                  'Rclone обычно не изменяет кодировку имен файлов, которые считываются из файловой системы.\n\n' +
                  'Это может быть полезно при использовании macOS, так как она обычно предоставляет декомпозированную (NFD) юникод, который в некоторых языках (например, корейском) отображается неправильно на некоторых ОС.\n\n' +
                  'Обратите внимание, что rclone сравнивает имена файлов с нормализацией unicode в процедуре синхронизации, поэтому этот флаг обычно не следует использовать.',
                newLabel: 'Нормализация Unicode'
              },
              'No Check Updated': {
                Help: 'Не проверять, изменяются ли файлы во время загрузки.\n\n' +
                  'Обычно rclone проверяет размер и время изменения файлов во время загрузки и прерывает выполнение с сообщением, ' +
                  'которое начинается с "не могу скопировать - исходный файл обновляется", если файл изменяется во время загрузки.\n\n' +
                  'Однако на некоторых файловых системах эта проверка времени изменения может не сработать (например, [Glusterfs #2206](https://github.com/rclone/rclone/issues/2206)), ' +
                  'поэтому эту проверку можно отключить с помощью этого флага.\n\n' +
                  'Если этот флаг установлен, rclone будет прилагать все усилия для передачи файла, который обновляется.\n\n' +
                  'Если фал только дополняется (например, журнал), то rclone передаст файл журнала с размером, который он имел в первый раз, когда rclone его увидел.\n\n' +
                  'Если файл изменяется полностью (не только дополняется), то передача может завершиться неудачей с ошибкой проверки хэша.\n\n' +
                  'В деталях, после того как файл был обработан с помощью stat() в первый раз, мы:\n\n' +
                  '- Передаем только размер, который указал stat\n' +
                  '- Проверяем контрольную сумму только для размера, который указал stat\n' +
                  '- Не обновляем информацию stat для файла.\n\n' +
                  '**Примечание**: не используйте этот флаг на томе Windows Volume Shadow (VSS). По неизвестной причине файлы в VSS иногда показывают разные размеры по сравнению со списком каталогов (где первоначальное значение stat берется на Windows) и когда stat вызывается на них напрямую. Другие инструменты копирования всегда используют прямое значение stat, и установка этого флага отключит это.',
                newLabel: 'Не проверять обновления'
              },
              'One File System': {
                Help: 'Не пересекать границы файловых систем (только unix/macOS).',
                newLabel: 'Одна файловая система'
              },
              'Case Sensitive': {
                Help: 'Заставить файловую систему сообщать о себе как о чувствительной к регистру.\n\n' +
                  'Обычно локальный бэкенд объявляет себя как нечувствительный к регистру на Windows/macOS и чувствительный к регистру для всего остального. Используйте этот флаг, чтобы переопределить выбор по умолчанию.',
                newLabel: 'Чувствительность к регистру'
              },
              'Case Insensitive': {
                Help: 'Заставить файловую систему сообщать о себе как о нечувствительной к регистру.\n\n' +
                  'Обычно локальный бэкенд объявляет себя как нечувствительный к регистру на Windows/macOS и чувствительный к регистру для всего остального. Используйте этот флаг, чтобы переопределить выбор по умолчанию.',
                newLabel: 'Нечувствительность к регистру'
              },
              'No Clone': {
                Help: 'Отключить клонирование reflink для серверных копий.\n\n' +
                  'Обычно, для локальных трансферов, rclone будет "клонировать" файл, когда это возможно, и вернется к "копированию", ' +
                  'только когда клонирование не поддерживается.\n\n' +
                  'Клонирование создает поверхностную копию (или "reflink"), которая изначально делит блоки с оригинальным файлом.\n\n' +
                  'В отличие от "жесткой ссыки", два файла независимы, и ни один из них не повлияет на другой, если они будут изменены впоследствии.\n\n' +
                  'Клонирование обычно предпочтительнее копирования, так как оно намного быстрее и по умолчанию является дедуплицированным (т.е. наличие двух идентичных файлов не потребляет больше места, чем наличие только одного). ' +
                  'Однако для случаев, когда избыточность данных предпочтительнее, --local-no-clone можно использовать для отключения клонирования и принуждения "глубоких" копий.\n\n' +
                  'В настоящее время клонирование поддерживается только при использовании APFS на macOS (поддержка других платформ может быть добавлена в будущем).',
                newLabel: 'Без клонирования'
              },
              'No Preallocate': {
                Help: 'Отключить предварительное выделение дискового пространства для переданных файлов.\n\n' +
                  'Предварительное выделение дискового пространства помогает предотвратить фрагментацию файловой системы. Однако некоторые виртуальные файловые системы (такие как Google Drive File Stream) могут неправильно устанавливать фактический размер файла равным предварительно выделенному пространству, что приводит к сбоям проверки контрольной суммы и размера файла. Используйте этот флаг, чтобы отключить предварительное выделение.',
                newLabel: 'Без предварительного выделения'
              },
              'No Sparse': {
                Help: 'Отключить разреженные файлы для многопоточных загрузок.\n\n' +
                  'На платформах Windows rclone будет создавать разреженные файлы при выполнении многопоточных загрузок. Это предотвращает долгие паузы на больших файлах, где ОС обнуляет файл. Однако разреженные файлы могут быть нежелательны, так как они вызывают фрагментацию диска и могут работать медленно.',
                newLabel: 'Без разреженных файлов'
              },
              'No Set Modtime': {
                Help: 'Отключить установку времени изменения.\n\n' +
                  'Обычно rclone обновляет время изменения файлов после их загрузки. Это может вызвать проблемы с разрешениями на платформах Linux, когда пользователь, от имени которого работает rclone, не владеет загруженным файлом, например, при копировании на CIFS-монтирование, принадлежащее другому пользователю. Если эта опция включена, rclone больше н будет обновлять время изменения после копирования файла.',
                newLabel: 'Без установки времени изменения'
              },
              'Time Type': {
                Help: 'Установите, какой тип времени будет возвращен.\n\n' +
                  'Обычно rclone выполняет все операции на mtime или времени изменения.\n\n' +
                  'Если вы установите этот флаг, rclone будет возвращать время изменения в зависимости от того, что вы здесь установили. ' +
                  'Так что если вы используете "rclone lsl --local-time-type ctime", вы увидите ctime в списке.\n\n' +
                  'Если ОС не поддерживает возврат указанного time_type, rclone тихо заменит его на время изменения, которое поддерживают все ОС.\n\n' +
                  '- mtime поддерживается всеми ОС\n\n' +
                  '- atime поддерживается всеми ОС, кроме: plan9, js\n\n' +
                  '- btime поддерживается только на: Windows, macOS, freebsd, netbsd\n\n' +
                  '- ctime поддерживается всеми ОС, кроме: Windows, plan9, js. \n\n' +
                  'Обратите внимание, что установка времени все равно установит время изменения, поэтому это полезно только для чтения.',
                newLabel: 'Тип времени'
              },

              // WedDav
              'Url': {
                Help: 'URL-адрес http-хостинга, к которому нужно подключиться.',
                newLabel: 'Url'
              },
              'Vendor': {
                Help: 'Название веб-сайта/службы/программного обеспечения WebDAV, которые вы используете.',
                newLabel: 'Вендор'
              },
              'User': {
                Help: 'Имя пользователя.\n\nВ случае использования аутентификации NTLM имя пользователя должно быть в формате "Домен\\Пользователь".',
                newLabel: 'Пользователь'
              },
              'Pass': {
                Help: 'Пароль.',
                newLabel: 'Пароль'
              },
              'Encoding': {
                Help: 'Кодировка для серверной части.\n\n' +
                  'Смотрите раздел [кодировка в обзоре] (/overview/#encoding) для получения дополнительной информации.',
                newLabel: 'Кодировка'
              },
              'Headers': {
                Help: 'Установите HTTP-заголовки для всех транзакций.\n\n' +
                  'Используйте это для установки дополнительных HTTP-заголовков для всех транзакций.',
                newLabel: 'Заголовки'
              },
              'Pacer Min Sleep': {
                Help: 'Минимальное время ожидания между вызовами API.',
                newLabel: 'Минимальное время ожидания'
              },
              // 'Nextcloud Chunk Size': {
              //   Help: 'Размер блока загрузки Nextcloud.\n\n' +
              //     'Мы рекомендуем настроить ваш инстанс NextCloud так, чтобы увеличить максимальный размер блока данных до 1 ГБ для повышения производительности загрузки.',
              //   newLabel: 'Размер блока Nextcloud'
              // },
              // 'Owncloud Exclude Shares': {
              //   Help: 'Исключить общие ресурсы Owncloud.',
              //   newLabel: 'Исключение общих ресурсов Owncloud'
              // },
              // 'Owncloud Exclude Mounts': {
              //   Help: 'Исключить хранилища, подключенные к Owncloud.',
              //   newLabel: 'Исключение монтирования Owncloud'
              // },
              // 'Unix Socket': {
              //   Help: 'Путь к доменному сокету unix, к которому можно подключиться, вместо прямого открытия TCP-соединения.',
              //   newLabel: 'Сокет Unix'
              // },
              'Description': {
                Help: 'Описание удаленного подключения.',
                newLabel: 'Описание'
              }
            }

            // Обработка элемента
            if (helpMessages[item.$Label]) {
              item.Help = helpMessages[item.$Label].Help
              if (helpMessages[item.$Label].newLabel) {
                item.$Label = helpMessages[item.$Label].newLabel
              }
            }
          }
        })

        Cache.providers[provider.Prefix] = provider
      })

      fireRcloneUpdateActions()
    })
}

/**
 * Trigger for register update cache listeners
 * @param eventName
 * @private
 */
let updateTimer = null;
let pendingUpdate = false;

const fireRcloneUpdateActions = function (eventName) {
  if (updateTimer) {
    clearTimeout(updateTimer);
    pendingUpdate = true;
  }
  
  updateTimer = setTimeout(() => {
    UpdateCallbacksRegistry.forEach(function (callback) {
      callback(eventName);
    });
    
    // Если было отложенное обновление - запустим его
    if (pendingUpdate) {
      pendingUpdate = false;
      setTimeout(() => fireRcloneUpdateActions(eventName), 100);
    }
    
    updateTimer = null;
  }, 100);
}

/**
 * Perform Rclone sync command, this function is used as shared for Download and Upload tasks
 * @private
 * @param {string} method
 * @param {{}} bookmark
 * @throws {Error}
 */
let isSuccessSync = true;

const sync = function (method, bookmark) {
  // Check supported method
  if (method !== 'upload' && method !== 'download') {
    throw Error(`Неподдерживаемый метод синхронизации ${method}`)
  }

  // Check if have set local path mapping.
  if (!('_rclonetray_local_path_map' in bookmark && bookmark._rclonetray_local_path_map)) {
    console.error('Rclone', 'Sync', 'Для этой закладки не задан локальный маппинг путей', bookmark)
    throw Error('Для этой закладки не задан локальный маппинг путей')
  }

  // Do not allow syncing from root / or X:\, they are dangerous and can lead to damages.
  // If you are so powered user, then do it from the cli.
  let localPathMapParsed = path.parse(bookmark._rclonetray_local_path_map)
  if (!localPathMapParsed.dir) {
    console.error('Rclone', 'Sync', 'Trying to sync from/to root', bookmark)
    throw Error('Операции с корневым диском запрещены, поскольку они опасны, поэтому установите дополнительный внутренний каталог для сопоставления каталогов закладок или используйте cli для этой цели..')
  }

  // let cmd = ['sync']
  // if (method === 'upload') {
  //   cmd.push(bookmark._rclonetray_local_path_map, getBookmarkRemoteWithRoot(bookmark))
  // } else {
  //   cmd.push(getBookmarkRemoteWithRoot(bookmark), bookmark._rclonetray_local_path_map)
  // }
  // cmd.push('-vv')

  // Check if source directory is empty because this could damage remote one.
//  if (method === 'upload') {
//    if (!fs.readdirSync(bookmark._rclonetray_local_path_map).length) {
//      throw Error('Не удается загрузить пустой каталог.')
//    }
//  }

  let oppositeMethod = method === 'download' ? 'upload' : 'download'

  if ((new BookmarkProcessManager(oppositeMethod, bookmark.$name)).exists()) {
    return Promise.reject(new Error(`Невозможно выполнить загрузку и выгрузку данных одновременно.`));
  }

  let proc = new BookmarkProcessManager(method, bookmark.$name);

  let cmd = ['bisync','--force','--recover','--create-empty-src-dirs', '--log-format', 'json', bookmark._rclonetray_local_path_map, getBookmarkRemoteWithRoot(bookmark), '-v'];
  proc.create(cmd);
  let resync_f = false;
  let bytes_transferred = 0;

  return new Promise((resolve, reject) => {
    const originalClose = proc.getProcess().listeners('close')[0];
    if (originalClose) {
      proc.getProcess().removeListener('close', originalClose);
    }

    proc.getProcess().on('close', (code) => {
      if (!resync_f && BookmarkProcessRegistry[proc.id] && BookmarkProcessRegistry[proc.id].data && BookmarkProcessRegistry[proc.id].data.OK) {
        if (bytes_transferred > 0) {
          if (method === 'download') {
            dialogs.notification(`Скачивание из ${bookmark.$name} завершено`);
          } else if (method === 'upload') {
            dialogs.notification(`Загрузка в ${bookmark.$name} завершена`);
          }
        }
      }
      delete BookmarkProcessRegistry[proc.id];
      fireRcloneUpdateActions();
      resolve(code); // Разрешаем промис
    });

    proc.getProcess().stderr.on('data', (data) => {
      const output = data.toString();
      const transferMatch = output.match(/Transferred:\s*(\d+)\s*B/i);
      if (transferMatch) {
        bytes_transferred = parseInt(transferMatch[1], 10);
      }

      if (output.includes('--resync')) {
        const savedData = {
          id: proc.id,
          bookmarkName: bookmark.$name,
          processName: method,
          localPath: bookmark._rclonetray_local_path_map,
          remoteRoot: getBookmarkRemoteWithRoot(bookmark)
        };
        resync_f = true;
        proc.getProcess().kill('SIGKILL');

        setTimeout(() => {
          if (BookmarkProcessRegistry[proc.id]) {
            delete BookmarkProcessRegistry[proc.id];
          }

          dialogs.notification('Первый запуск синхронизации. Выполнение начальной синхронизации с --resync...');

          let resyncCmd = ['bisync', '--resync','--create-empty-src-dirs', '--log-format', 'json', savedData.localPath, savedData.remoteRoot, '-v'];
          let resyncProc = new BookmarkProcessManager(savedData.processName, savedData.bookmarkName);
          resyncProc.create(resyncCmd);

          const resyncOriginalClose = resyncProc.getProcess().listeners('close')[0];
          if (resyncOriginalClose) {
            resyncProc.getProcess().removeListener('close', resyncOriginalClose);
          }

          resyncProc.getProcess().on('close', (code) => {
            if (code === 0) {
              console.log(`Initial synchronization for ${savedData.bookmarkName} completed successfully`)
              dialogs.notification(`Начальная синхронизация для ${savedData.bookmarkName} завершена успешно`);
              isSuccessSync = true;
            } else {
              console.log(`Initial synchronization for ${savedData.bookmarkName} failed`)
              if (isSuccessSync) {
                dialogs.notification(`Начальная синхронизация для ${savedData.bookmarkName} завершилась неудачей`);
                isSuccessSync = false;
              }
            }
            delete BookmarkProcessRegistry[resyncProc.id];
            fireRcloneUpdateActions();
            resolve(code);
          });

          fireRcloneUpdateActions();
        }, 1000);
      }
    });

    if (!resync_f) {
      proc.set('OK', true);
    }
    fireRcloneUpdateActions();
  });
};


/**
 * Get bookmark
 * @param {{}|string} bookmark
 * @returns {{}}
 * @throws {Error}
 */
const getBookmark = function (bookmark) {
  if (typeof bookmark === 'object') {
    return bookmark
  } else if (bookmark in Cache.bookmarks) {
    return Cache.bookmarks[bookmark]
  } else {
    throw Error(`Закладки ${bookmark} нет`)
  }
}

/**
 * Add callback to execute when Rclone config is changed.
 * @param callback
 */
const onUpdate = function (callback) {
  UpdateCallbacksRegistry.push(callback)
}

/**
 * Get available providers
 * @returns {Cache.providers|{}}
 */
const getProviders = function () {
  return Cache.providers
}

/**
 * Get specific provider
 * @param providerName
 * @returns {{}}
 * @throws {Error}
 */
const getProvider = function (providerName) {
  if (Cache.providers.hasOwnProperty(providerName)) {
    return Cache.providers[providerName]
  } else {
    throw Error(`Такого провайдера ${providerName} нет`)
  }
}

/**
 * Get bookmarks
 * @returns {Cache.bookmarks}
 */
const getBookmarks = function () {
  return Cache.bookmarks
}

/**
 * Check if bookmark options are valid
 * @param {*} providerObject
 * @param {*} values
 * @return Error|null
 */
const validateBookmarkOptions = function (providerObject, values) {
  providerObject.Options.forEach(function (optionDefinition) {
    let fieldName = optionDefinition.$Label || optionDefinition.Name
    if (optionDefinition.Required && (!values.hasOwnProperty(optionDefinition.Name) || !values[optionDefinition.Name])) {
      throw Error(`${fieldName} поле является обязательным для заполнения`)
    }
    // @TODO type checks
  })
}

/**
 * Update existing bookmark's fields (rclone remote optons)
 * @param {string} bookmarkName
 * @param {{}} providerObject
 * @param {{}} values
 * @throws {Error}
 */
const updateBookmarkFields = function (bookmarkName, providerObject, values, oldValues) {
  let valuesPlain = {}

  providerObject.Options.forEach(function (optionDefinition) {
    if (optionDefinition.$Type === 'password') {
      if (!oldValues || oldValues[optionDefinition.Name] !== values[optionDefinition.Name]) {
        doCommandSync(['config', 'password', bookmarkName, optionDefinition.Name, values[optionDefinition.Name]])
      }
    } else {
      // Sanitize booleans.
      if (optionDefinition.$Type === 'boolean') {
        if (optionDefinition.Name in values && ['true', 'yes', true, 1].indexOf(values[optionDefinition.Name]) > -1) {
          values[optionDefinition.Name] = 'true'
        } else {
          values[optionDefinition.Name] = 'false'
        }
      }
      valuesPlain[optionDefinition.Name] = values[optionDefinition.Name]
    }
  })

  try {
    let configIniStruct = ini.decode(fs.readFileSync(getConfigFile()).toString())
    configIniStruct[bookmarkName] = Object.assign(configIniStruct[bookmarkName], valuesPlain)
    fs.writeFileSync(getConfigFile(), ini.encode(configIniStruct, {
      whitespace: true
    }))
  } catch (err) {
    console.error(err)
    errorHandler.logToFile(err)
    throw Error('Не удается обновить поля закладок.')
  }
  console.log('Rclone', 'Updated bookmark', bookmarkName)
}

/**
 * Create new bookmark
 * @param {string} type
 * @param {string} bookmarkName
 * @param {{}} values
 * @returns {Promise}
 */
const addBookmark = function (type, bookmarkName, values) {
  // Will throw an error if no such provider exists.
  let providerObject = getProvider(type)
  let configFile = getConfigFile()

  return new Promise(function (resolve, reject) {
    if (!/^([a-zA-Z0-9\-_]{1,32})$/.test(bookmarkName)) {
      reject(Error(`Неопустимое имя.\nИмя должно содержать от 1 до 32 символов и состоять только из букв, цифр и _`))
      return
    }

    // Validate values.
    validateBookmarkOptions(providerObject, values)

    if (Cache.bookmarks.hasOwnProperty(bookmarkName)) {
      reject(Error(`Закладка "${bookmarkName}" уже есть`))
      return
    }
    try {
      let iniBlock = `\n[${bookmarkName}]\nconfig_automatic = no\ntype = ${type}\n`
      fs.appendFileSync(configFile, iniBlock)
      console.log('Rclone', 'Создание новой закладки', bookmarkName)
      try {
        updateBookmarkFields(bookmarkName, providerObject, values)
        dialogs.notification(`Закладка ${bookmarkName} создана`)
        resolve()
        // Done.
      } catch (err) {
        console.error('Rclone', 'Возврат закладки из-за проблемы', bookmarkName, err)
        errorHandler.logToFile(err)
        doCommand(['config', 'delete', bookmarkName])
          .then(function () {
            reject(Error('Не удается записать параметры закладок в конфигурацию.'))
          })
          .catch(reject)
      }
    } catch (err) {
      console.error(err)
      errorHandler.logToFile(err)
      reject(Error('Не удается создать новую закладку'))
    }
  })
}

/**
 * Update existing bookmark
 * @param {{}|string} bookmark
 * @param {{}} values
 * @returns {Promise}
 */
const updateBookmark = function (bookmark, values) {
  bookmark = getBookmark(bookmark)
  let providerObject = getProvider(bookmark.type)
  return new Promise(function (resolve, reject) {
    // Validate values.
    validateBookmarkOptions(providerObject, values)

    try {
      updateBookmarkFields(bookmark.$name, providerObject, values, bookmark)
      dialogs.notification(`Закладка ${bookmark.$name} обновлена.`)
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}
/**
 * Delete existing bookmark
 * @param {{}|string} bookmark
 * @returns {Promise}
 */
const deleteBookmark = function (bookmark) {
  bookmark = getBookmark(bookmark)
  return new Promise(function (resolve, reject) {
    doCommand(['config', 'delete', bookmark.$name])
      .then(function () {
        BookmarkProcessManager.killAll(bookmark.$name)
        updateBookmarksCache()
        dialogs.notification(`Закладка ${bookmark.$name} удалена.`)
        resolve()
      })
      .catch(reject)
  })
}

/**
 * Get bookmark remote with root
 * @param {{}} bookmark
 * @returns {string}
 */
const getBookmarkRemoteWithRoot = function (bookmark) {
  return bookmark.$name + ':' + (bookmark._rclonetray_remote_path || '/')
}

/**
 * Free directory that we use for mountpoints
 * @param {String} directoryPath
 * @returns {Boolean}
 */
const freeMountpointDirectory = function (directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdir(directoryPath, function (err, files) {
      if (err) {
        throw err
      }
      if (!files.length) {
        fs.rmdirSync(directoryPath)
      }
    })
  }
  return true
}

/**
 * On windows find free drive letter.
 * @returns {string}
 */
const win32GetFreeLetter = function () {
  // First letters are reserved, floppy, system drives etc.
  const allLetters = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
  let usedDriveLetters = execSync('wmic logicaldisk get name')
  usedDriveLetters = usedDriveLetters.toString()
    .split(/\n/)
    .map(function (line) {
      let letter = line.trim().match(/^([A-Z]):/)
      if (letter) {
        return letter[1]
      }
      return null
    })
    .filter(function (letter) {
      return !!letter
    })

  let freeLetter = allLetters.find(function (letter) {
    return usedDriveLetters.indexOf(letter) === -1
  })

  if (!freeLetter) {
    throw Error('Недоступна свободная буква диска')
  }

  return freeLetter + ':'
}

/**
 * Mount given bookmark
 * @param {{}|string} bookmark
 */
const mount = function (bookmark) {
  bookmark = getBookmark(bookmark)
  let proc = new BookmarkProcessManager('mount', bookmark.$name)

  if (proc.exists()) {
    throw Error(`Закладка ${bookmark.$name} уже примонтирована.`)
  }

  let mountpoint
  if (process.platform === 'win32') {
    mountpoint = win32GetFreeLetter()
  } else if (process.platform === 'linux') {
    mountpoint = path.join(os.homedir(), `mount.${bookmark.type}.${bookmark.$name}`)
  } else {
    mountpoint = path.join('/', 'Volumes', `${bookmark.type}.${bookmark.$name}`)
  }

  // Check if destination mountpoint is already used.
  const mountpointDirectoryExists = fs.existsSync(mountpoint)
  if (!mountpoint || (mountpointDirectoryExists && fs.readdirSync(mountpoint).length > 0)) {
    throw Error(`Конечная точка монтирования "${mountpoint}" не свободна.`)
  }
  if (process.platform === 'linux' && !mountpointDirectoryExists) {
    fs.mkdirSync(mountpoint)
  }

  proc.create([
    'mount',
    getBookmarkRemoteWithRoot(bookmark),
    mountpoint,
    '--attr-timeout', Math.max(1, parseInt(settings.get('rclone_cache_files'))) + 's',
    '--dir-cache-time', Math.max(1, parseInt(settings.get('rclone_cache_directories'))) + 's',
    '--allow-non-empty',
    '--volname', bookmark.$name,
    '-vv',
//    '--no-check-certificate',
    '--vfs-cache-mode=writes'
  ])
  proc.set('mountpoint', mountpoint)

  if (process.platform === 'linux') {
    proc.getProcess().on('close', function () {
      freeMountpointDirectory(mountpoint)
      if (fs.existsSync(mountpoint)) {
        fs.readdir(mountpoint, function (err, files) {
          if (err) {
            throw err
          }
          if (!files.length) {
            fs.rmdir(mountpoint, function () { })
          }
        })
      }
    })
  }

  fireRcloneUpdateActions()
}

/**
 * Check is given bookmark is mounted
 * @param {{}|string} bookmark
 * @returns {false|string Mountpoint}
 */
const getMountStatus = function (bookmark) {
  bookmark = getBookmark(bookmark)
  let proc = new BookmarkProcessManager('mount', bookmark.$name)
  let exists = proc.exists()
  if (exists) {
    let mountpoint = proc.get('mountpoint')
    if (fs.existsSync(mountpoint)) {
      return mountpoint
    }
  }
  return false
}

/**
 * Unmount given bookmark (if it's mounted)
 * @param {{}|string} bookmark
 */
const unmount = function (bookmark) {
  bookmark = getBookmark(bookmark)
  let proc = new BookmarkProcessManager('mount', bookmark.$name)
  if (proc.exists()) {
    proc.kill()
  }
}

/**
 * Open mounted directory bookmark in platform's file browser
 * @param {{}|string} bookmark
 */
const openMountPoint = function (bookmark) {
  let mountpoint = getMountStatus(bookmark)
  if (mountpoint) {
    shell.openExternal(`file://${mountpoint}`)
  } else {
    console.error('Trying to open non-mounted drive.')
    errorHandler.logToFile('Trying to open non-mounted drive.')
  }
}

/**
 * Perform download task
 * @see sync()
 * @param {{}|string} bookmark
 */
const download = function (bookmark) {
  sync('download', getBookmark(bookmark))
}

/**
 * Perform upload task
 * @see sync()
 * @param {{}|string} bookmark
 */
const upload = function (bookmark) {
  sync('upload', getBookmark(bookmark))
}

/**
 * Check if current is uploading
 * @param {{}|string} bookmark
 * @returns {boolean}
 */
const isUpload = function (bookmark) {
  bookmark = getBookmark(bookmark)
  return (new BookmarkProcessManager('upload', bookmark.$name)).exists()
}

/**
 * Check if current is downloading
 * @param {{}|string} bookmark
 * @returns {boolean}
 */
const isDownload = function (bookmark) {
  bookmark = getBookmark(bookmark)
  return (new BookmarkProcessManager('download', bookmark.$name)).exists()
}

/**
 * Stop currently running downloading process
 * @param {{}|string} bookmark
 */
const stopDownload = function (bookmark) {
  bookmark = getBookmark(bookmark);
  (new BookmarkProcessManager('download', bookmark.$name)).kill()
}

/**
 * Stop currently running uploading process
 * @param {{}|string} bookmark
 */
const stopUpload = function (bookmark) {
  bookmark = getBookmark(bookmark);
  (new BookmarkProcessManager('upload', bookmark.$name)).kill()
}

/**
 *
 * @param {*} bookmark
 */
const isAutomaticUpload = function (bookmark) {
  bookmark = getBookmark(bookmark)
  return !!AutomaticUploadRegistry.hasOwnProperty(bookmark.$name)
}

/**
 *
 * @param {*} bookmark
 */
const toggleAutomaticUpload = function (bookmark) {
  bookmark = getBookmark(bookmark)

  if (AutomaticUploadRegistry.hasOwnProperty(bookmark.$name)) {
    // Если уже существует запись, очищаем таймер и интервал
    if (AutomaticUploadRegistry[bookmark.$name].timer) {
      clearTimeout(AutomaticUploadRegistry[bookmark.$name].timer)
    }
    if (AutomaticUploadRegistry[bookmark.$name].interval) {
      clearInterval(AutomaticUploadRegistry[bookmark.$name].interval)
    }
    AutomaticUploadRegistry[bookmark.$name].watcher.close()
    delete AutomaticUploadRegistry[bookmark.$name]
  } else if ('_rclonetray_local_path_map' in bookmark && bookmark._rclonetray_local_path_map) {
    // Set the registry.
    AutomaticUploadRegistry[bookmark.$name] = {
      watcher: null,
      timer: null,
      interval: null, // Поле для хранения интервала
      isSyncing: false // Флаг для отслеживания статуса синхронизации
    }

    AutomaticUploadRegistry[bookmark.$name].watcher = chokidar.watch(bookmark._rclonetray_local_path_map, {
      ignoreInitial: true,
      disableGlobbing: true,
      usePolling: false,
      useFsEvents: true,
      persistent: true,
      alwaysStat: true,
      atomic: true
    })

    AutomaticUploadRegistry[bookmark.$name].watcher.on('raw', function () {
      if (AutomaticUploadRegistry[bookmark.$name].timer) {
        clearTimeout(AutomaticUploadRegistry[bookmark.$name].timer)
      }
      AutomaticUploadRegistry[bookmark.$name].timer = setTimeout(function () {
        sync('upload', bookmark)
      }, 3000)
    })

    // Устанавливаем интервал для выполнения sync('download'
    AutomaticUploadRegistry[bookmark.$name].interval = setInterval(function () {
      if (!AutomaticUploadRegistry[bookmark.$name].isSyncing) {
        AutomaticUploadRegistry[bookmark.$name].isSyncing = true; // Устанавливаем флаг
        sync('download', bookmark).then(() => {
          AutomaticUploadRegistry[bookmark.$name].isSyncing = false; // Сбрасываем флаг после завершения
        }).catch(() => {
          AutomaticUploadRegistry[bookmark.$name].isSyncing = false; // Сбрасываем флаг в случае ошибки
        });
      }
    }, settings.get('rclone_sync_autoupload_delay') * 1000) // Значение из настроек Синхронизация "Автоматическая загрузка"
  }

  fireRcloneUpdateActions()
}

/**
 * Open local path mapping
 * @param {{}|string} bookmark
 */
const openLocal = function (bookmark) {
  bookmark = getBookmark(bookmark)
  if ('_rclonetray_local_path_map' in bookmark) {
    if (fs.existsSync(bookmark._rclonetray_local_path_map)) {
      return shell.openExternal(`file://${bookmark._rclonetray_local_path_map}`)
    } else {
      console.error('Rclone', 'Local path does not exists.', bookmark._rclonetray_local_path_map, bookmark.$name)
      throw Error(`Локальный путь ${bookmark._rclonetray_local_path_map} не существует`)
    }
  } else {
    return false
  }
}

/**
 * Get available serving protocols
 * @returns {{}}
 */
const getAvailableServeProtocols = function () {
  let protocols = {}
  if (settings.get('rclone_serving_http_enable')) {
    protocols.http = 'HTTP'
  }
  if (settings.get('rclone_serving_ftp_enable')) {
    protocols.ftp = 'FTP'
  }
  if (settings.get('rclone_serving_webdav_enable')) {
    protocols.webdav = 'WebDAV'
  }
  if (settings.get('rclone_serving_restic_enable')) {
    protocols.restic = 'Restic'
  }
  return protocols
}

/**
 * Start serving protocol+bookmark
 * @param {string} protocol
 * @param {{}|string} bookmark
 */
const serveStart = function (protocol, bookmark) {
  if (!getAvailableServeProtocols().hasOwnProperty(protocol)) {
    throw Error(`Протокол "${protocol}" не поддерживается`)
  }

  bookmark = getBookmark(bookmark)

  let proc = new BookmarkProcessManager(`serve_${protocol}`, bookmark.$name)

  if (proc.exists()) {
    throw Error(`${bookmark.$name} уже служит.`)
  }

  proc.create([
    'serve',
    protocol,
    getBookmarkRemoteWithRoot(bookmark),
    '--attr-timeout', Math.max(1, parseInt(settings.get('rclone_cache_files'))) + 's',
    '--dir-cache-time', Math.max(1, parseInt(settings.get('rclone_cache_directories'))) + 's',
    '-vv'
  ])
  proc.set('protocol', protocol)
  fireRcloneUpdateActions()
}

/**
 * Stop serving protocol+bookmark
 * @param {string} protocol
 * @param {{}|string} bookmark
 */
const serveStop = function (protocol, bookmark) {
  bookmark = getBookmark(bookmark)
  if (serveStatus(protocol, bookmark) !== false) {
    let proc = new BookmarkProcessManager(`serve_${protocol}`, bookmark.$name)
    if (proc.exists()) {
      proc.kill()
    }
  }
}

/**
 * Check if current protocol+bookmark is in serving
 * @param {string} protocol
 * @param {{}} bookmark
 * @returns {string|boolean}
 */
const serveStatus = function (protocol, bookmark) {
  bookmark = getBookmark(bookmark)
  let proc = new BookmarkProcessManager(`serve_${protocol}`, bookmark.$name)
  if (proc.exists()) {
    return proc.get('URI') || ''
  } else {
    return false
  }
}

/**
 * Open NCDU in platform's terminal emulator
 * @param {{}|string} bookmark
 */
const openNCDU = function (bookmark) {
  bookmark = getBookmark(bookmark)
  let command = prepareRcloneCommand(['ncdu', getBookmarkRemoteWithRoot(bookmark)])
  command = appendCustomRcloneCommandArgs(command, bookmark.$name)
  doCommandInTerminal(command)
}

/**
 * Get version of installed Rclone
 * @returns {string}
 */
const getVersion = function () {
  return Cache.version
}

/**
 * Init Rclone
 */
const init = async function () {
  // On linux and mac add /usr/local/bin to the $PATH
  if (process.platform === 'linux' || process.platform === 'darwin') {
    process.env.PATH += ':' + path.join('/', 'usr', 'local', 'bin')
  }

  try {
    // Update version cache, it also do the first Rclone existance check
    await updateVersionCache()
  } catch (err) {
    errorHandler.logToFile(err)
    dialogs.missingRclone()
    // If fails again, then there is really something wrong
    await updateVersionCache()
  }

  // Update config file path cache.
  if (settings.get('rclone_config')) {
    Cache.configFile = settings.get('rclone_config')
  } else {
    let output = await doCommandAsync(['config', 'file'])
    Cache.configFile = output.trim().split(/\r?\n/).pop()
  }

  // While chokidar fails if the watching file is not exists.
  // then need to create empty rclone conf file.
  if (!fs.existsSync(getConfigFile())) {
    fs.appendFileSync(getConfigFile(), '')
  }

  // chokidar seems to be more relyable than fs.watch() and give better results.
  chokidar.watch(getConfigFile(), {
    ignoreInitial: true,
    disableGlobbing: true,
    usePolling: false,
    useFsEvents: true,
    persistent: true,
    alwaysStat: true,
    atomic: true
  })
    .on('change', updateBookmarksCache)

  // Update caches
  await updateProvidersCache()
  await updateBookmarksCache()
}

/**
 * Prepare app to quit, show dialog if there is running processes
 * @param {Event} event
 */
const prepareQuit = function (event) {
  if (BookmarkProcessManager.getActiveProcessesCount() < 1) {
    return
  }

  if (!dialogs.confirmExit()) {
    event.preventDefault()
    return
  }

  // Kill all active proccesses before quit.
  BookmarkProcessManager.killAll()
}

// Exports.
module.exports = {
  getConfigFile,

  getProviders,
  getProvider,

  getBookmark,
  getBookmarks,
  addBookmark,
  updateBookmark,
  deleteBookmark,

  mount,
  unmount,
  getMountStatus,
  openMountPoint,

  download,
  stopDownload,
  isDownload,

  upload,
  stopUpload,
  isUpload,
  isAutomaticUpload,
  toggleAutomaticUpload,

  openLocal,

  getAvailableServeProtocols,
  serveStart,
  serveStop,
  serveStatus,

  openNCDU,

  getVersion,

  onUpdate,

  init,

  prepareQuit
}
