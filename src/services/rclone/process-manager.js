'use strict'

const { spawn } = require('child_process')
const errorHandler = require('../../utils/error-handler')
const settings = require('../settings')
const { CONSTANTS } = require('../../config/constants')

class ProcessManager {
  constructor() {
    this.processes = {}
  }

  create(id, command, options = {}) {
    console.log('ProcessManager: Creating process:', { id, command })
    if (this.exists(id)) {
      console.error('ProcessManager: Process already exists:', id)
      throw new Error(`Process ${id} already exists`)
    }

    // Используем rclone из настроек
    const rclonePath = settings.get('rclone_use_bundled') 
      ? CONSTANTS.getRcloneBundledPath()
      : CONSTANTS.RCLONE_BINARY_NAME

    // Добавляем путь к rclone и конфиг
    const configFile = settings.get('rclone_config')
    const fullCommand = [
      rclonePath,
      ...(configFile ? ['--config', configFile] : []),
      ...command
    ]

    const process = spawn(fullCommand[0], fullCommand.slice(1), options)
    
    this.processes[id] = {
      process,
      data: { OK: false },
      ...options
    }

    console.log('ProcessManager: Process created:', id)
    this.setupProcessHandlers(id, process)
    
    return process
  }

  exists(id) {
    return id in this.processes
  }

  kill(id, signal = 'SIGTERM') {
    if (this.exists(id)) {
      this.processes[id].process.kill(signal)
      delete this.processes[id]
    }
  }

  killAll() {
    Object.keys(this.processes).forEach(id => this.kill(id))
  }

  setupProcessHandlers(id, process) {
    process.stdout.on('data', data => {
      console.log('ProcessManager: Process stdout:', { id, data: data.toString() })
    })

    process.stderr.on('data', data => {
      console.log('ProcessManager: Process stderr:', { id, data: data.toString() })
      errorHandler.handleProcessOutput(id, data.toString())
    })

    process.on('error', (error) => {
      console.error('ProcessManager: Process error:', { id, error })
      errorHandler.handleProcessOutput(id, `Error: ${error.message}`)
    })

    process.on('close', (code) => {
      console.log('ProcessManager: Process closed:', { id, code })
      if (code !== 0) {
        errorHandler.handleProcessOutput(id, `Process exited with code ${code}`)
      }
      delete this.processes[id]
    })
  }

  getActiveProcessesCount() {
    return Object.keys(this.processes).length
  }

  getProcessData(id) {
    return (this.processes[id] && this.processes[id].data) || {}
  }
}

module.exports = ProcessManager 