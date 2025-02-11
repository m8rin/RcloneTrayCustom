'use strict'

const { exec } = require('child_process')
const path = require('path')
const os = require('os')
const settings = require('../settings')
const fs = require('fs')

class TerminalManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
    this.tempDir = os.tmpdir()
  }

  openNCDU(bookmark) {
    const command = this.commandExecutor.prepareCommand([
      'ncdu', 
      this.getBookmarkRemoteWithRoot(bookmark)
    ])
    this.doCommandInTerminal(command)
  }

  doCommandInTerminal(command) {
    command = this.commandExecutor.enquoteCommand(command)
    command = command.join(' ')

    if (process.platform === 'darwin') {
      // macOS's Terminal
      command = command.replace(new RegExp('"', 'g'), '\\"')
      exec(`/usr/bin/osascript -e 'tell application "Terminal" to do script "${command}" activate'`)
    } 
    else if (process.platform === 'linux') {
      // Linux terminal
      const tempCmdWrapper = path.join(this.tempDir, 'rclonetray-linux-cmd-wrapper.sh')
      const data = new Uint8Array(Buffer.from(command))
      
      fs.writeFile(tempCmdWrapper, data, (err) => {
        if (err) {
          throw Error('Не удается открыть терминал')
        }
        fs.chmodSync(tempCmdWrapper, 0o755)
        exec(`x-terminal-emulator -e "${tempCmdWrapper}"`)
      })
    } 
    else if (process.platform === 'win32') {
      // Windows cmd
      exec(`start cmd.exe /K "${command}"`)
    }
  }

  getBookmarkRemoteWithRoot(bookmark) {
    return `${bookmark.$name}:${bookmark._rclonetray_remote_path || '/'}`
  }
}

module.exports = TerminalManager 