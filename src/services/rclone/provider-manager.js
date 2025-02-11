'use strict'

const { PROVIDERS } = require('../../config/providers')
const cacheManager = require('./cache-manager')

class ProviderManager {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor
  }

  async updateProvidersCache() {
    try {
      const output = await this.commandExecutor.execute(['config', 'providers'])
      const providers = JSON.parse(output)

      const processedProviders = providers
        .filter(provider => 
          PROVIDERS.SUPPORTED.includes(provider.Name)
        )
        .reduce((acc, provider) => {
          acc[provider.Name] = this.processProviderOptions(provider)
          return acc
        }, {})

      cacheManager.setProviders(processedProviders)
    } catch (err) {
      throw new Error('Не удается прочитать список провайдеров.')
    }
  }

  processProviderOptions(provider) {
    if (PROVIDERS.BUCKET_REQUIRED.includes(provider.Prefix)) {
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

    provider.Options = provider.Options.map(this.processOptionDefinition)
    return provider
  }

  processOptionDefinition(option) {
    // Определяем тип опции
    if (typeof option.Default === 'boolean') {
      option.$Type = 'boolean'
    } else if (!isNaN(parseFloat(option.Default)) && isFinite(option.Default)) {
      option.$Type = 'number'
    } else if (option.IsPassword) {
      option.$Type = 'password'
    } else {
      option.$Type = 'string'
    }

    option.$Namespace = 'options'
    return option
  }

  getProvider(name) {
    const providers = cacheManager.getProviders()
    if (name in providers) {
      return providers[name]
    }
    throw new Error(`Провайдер ${name} не найден`)
  }

  getProviders() {
    return cacheManager.getProviders()
  }
}

module.exports = ProviderManager 