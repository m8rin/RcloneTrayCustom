const { contextBridge, ipcRenderer } = require('electron')

// Экспортируем API для диалогов
contextBridge.exposeInMainWorld('$main', {
  loadStyles: () => {
    const style = document.createElement('style')
    style.textContent = `
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        margin: 0;
        padding: 20px;
        background: #ffffff;
      }
      
      .row {
        margin-bottom: 15px;
        display: flex;
        align-items: flex-start;
      }
      
      .cell-left {
        width: 200px;
        padding-right: 20px;
      }
      
      .cell-right {
        flex: 1;
      }
      
      .buttons {
        margin-top: 20px;
        text-align: right;
      }
      
      button {
        padding: 6px 12px;
        margin-left: 8px;
        border: 1px solid #ccc;
        background: #fff;
        border-radius: 4px;
      }
      
      button:hover {
        background: #f5f5f5;
      }
      
      input, select {
        width: 100%;
        padding: 6px;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      
      .label-required {
        color: #ff4444;
        font-size: 12px;
        margin-top: 4px;
      }
      
      .help {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
        line-height: 1.4;
      }
      
      .field {
        margin-bottom: 15px;
      }
      
      .tabs {
        border: 1px solid #ccc;
        border-radius: 4px;
        margin-bottom: 20px;
      }
      
      .tab {
        padding: 15px;
      }
      
      .tab-label {
        font-weight: bold;
        margin-bottom: 10px;
      }

      select {
        height: 28px;
        background: white;
      }

      input[type="text"],
      input[type="password"] {
        height: 26px;
        padding: 0 8px;
      }
    `
    document.head.appendChild(style)
  },
  getProps: () => window.$props || {},
  settings: {
    get: (key) => ipcRenderer.sendSync('settings-get', key),
    set: (key, value) => ipcRenderer.sendSync('settings-set', key, value),
    merge: (data) => ipcRenderer.sendSync('settings-merge', data)
  },
  rclone: {
    getProviders: () => ipcRenderer.invoke('rclone-get-providers'),
    getConfigFile: () => ipcRenderer.invoke('rclone-get-config-file'),
    addBookmark: (type, name, options) => ipcRenderer.invoke('rclone-add-bookmark', type, name, options),
    updateBookmark: (name, options) => ipcRenderer.invoke('rclone-update-bookmark', name, options),
    deleteBookmark: (name) => ipcRenderer.invoke('rclone-delete-bookmark', name)
  },
  refreshTray: () => ipcRenderer.send('refresh-tray'),
  isAutostart: () => ipcRenderer.sendSync('is-autostart'),
  setAutostart: (value) => ipcRenderer.sendSync('set-autostart', value),
  errorBox: (error) => ipcRenderer.send('show-error-box', error),
  checkForRequiredRestart: () => ipcRenderer.send('check-for-required-restart'),
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height)
})

// Добавляем вспомогательные функции
contextBridge.exposeInMainWorld('createTabsElement', () => {
  const tabs = document.createElement('div')
  tabs.className = 'tabs'
  return {
    addTab: (label, content) => {
      const tab = document.createElement('div')
      tab.className = 'tab'
      tab.innerHTML = `
        <div class="tab-label">${label}</div>
        <div class="tab-content">${content}</div>
      `
      tabs.appendChild(tab)
    }
  }
})

contextBridge.exposeInMainWorld('createOptionsFields', (fields) => {
  return fields.map(field => {
    const wrapper = document.createElement('div')
    wrapper.className = 'field'
    wrapper.innerHTML = `
      <label>${field.$Label}</label>
      ${field.Required ? '<span class="required">*</span>' : ''}
      <input type="${field.$Type}" name="${field.Name}" value="${field.Value || ''}" />
      ${field.Help ? `<div class="help">${field.Help}</div>` : ''}
    `
    return wrapper.outerHTML
  }).join('')
})

contextBridge.exposeInMainWorld('getTheFormData', (form) => {
  const formData = new FormData(form)
  return Object.fromEntries(formData)
})

// Добавим функции для работы с формами
contextBridge.exposeInMainWorld('renderBookmarkSettings', (element, type, data = {}) => {
  const provider = window.$main.rclone.getProviders()[type]
  if (!provider) return

  const fields = provider.Options.map(field => {
    return {
      $Label: field.$Label || field.Name,
      $Type: field.$Type || 'text',
      Name: field.Name,
      Help: field.Help,
      Required: field.Required,
      Value: data.options?.[field.Name] || field.Default || ''
    }
  })

  element.innerHTML = window.createOptionsFields(fields)
})

contextBridge.exposeInMainWorld('resizeToContent', () => {
  const body = document.body
  const width = Math.max(600, body.scrollWidth)
  const height = Math.max(100, body.scrollHeight + 50)
  window.$main.resizeWindow(width, height)
}) 