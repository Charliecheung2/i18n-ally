import { extname } from 'path'
import { workspace, commands, window, EventEmitter, Event, ExtensionContext, ConfigurationChangeEvent } from 'vscode'
import { EXT_NAMESPACE } from '../meta'
import { isVueI18nProject } from '../utils/utils'
import { ConfigLocalesGuide } from '../commands/configLocales'
import { PARSERS } from '../parsers'
import { Log } from '../utils'
import { LocaleLoader, Config } from '.'

export type KeyStyle = 'auto' | 'nested' | 'flat'

export class Global {
  private static _loaders: Record<string, LocaleLoader> = {}

  private static _rootpath: string

  private static _enabled: boolean = false

  static context: ExtensionContext

  static parsers = PARSERS

  // events
  private static _onDidChangeRootPath: EventEmitter<string> = new EventEmitter()

  static readonly onDidChangeRootPath: Event<string> = Global._onDidChangeRootPath.event

  private static _onDidChangeEnabled: EventEmitter<boolean> = new EventEmitter()

  static readonly onDidChangeEnabled: Event<boolean> = Global._onDidChangeEnabled.event

  private static _onDidChangeLoader: EventEmitter<LocaleLoader> = new EventEmitter()

  static readonly onDidChangeLoader: Event<LocaleLoader> = Global._onDidChangeLoader.event

  static async init (context: ExtensionContext) {
    this.context = context

    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(e => this.updateRootPath()))
    context.subscriptions.push(window.onDidChangeActiveTextEditor(e => this.updateRootPath()))
    context.subscriptions.push(workspace.onDidOpenTextDocument(e => this.updateRootPath()))
    context.subscriptions.push(workspace.onDidCloseTextDocument(e => this.updateRootPath()))
    context.subscriptions.push(workspace.onDidChangeConfiguration(e => this.update(e)))
    await this.updateRootPath()
  }

  private static async initLoader (rootpath: string, reload = false) {
    if (!rootpath)
      return

    if (this._loaders[rootpath] && !reload)
      return this._loaders[rootpath]

    const loader = new LocaleLoader(rootpath)
    await loader.init()
    this.context.subscriptions.push(loader.onDidChange(() => this._onDidChangeLoader.fire(loader)))
    this.context.subscriptions.push(loader)
    this._loaders[rootpath] = loader

    return this._loaders[rootpath]
  }

  private static async updateRootPath () {
    const editor = window.activeTextEditor
    let rootpath = ''

    if (!editor || !workspace.workspaceFolders || workspace.workspaceFolders.length === 0)
      return

    const resource = editor.document.uri
    if (resource.scheme === 'file') {
      const folder = workspace.getWorkspaceFolder(resource)
      if (folder)
        rootpath = folder.uri.fsPath
    }

    if (!rootpath && workspace.rootPath)
      rootpath = workspace.rootPath

    if (rootpath && rootpath !== this._rootpath) {
      this._rootpath = rootpath
      Log.divider()
      Log.info(`💼 Workspace root changed to "${rootpath}"`)
      await this.update()
      this._onDidChangeRootPath.fire(rootpath)
    }
  }

  private static async update (e?: ConfigurationChangeEvent) {
    let reload = false
    if (e) {
      let affected = false
      for (const config of Config.reloadConfigs) {
        const key = `${EXT_NAMESPACE}.${config}`
        if (e.affectsConfiguration(key)) {
          affected = true
          reload = true
          Log.info(`🧰 Config "${key}" changed, reloading`)
          break
        }
      }
      for (const config of Config.refreshConfigs) {
        const key = `${EXT_NAMESPACE}.${config}`
        if (e.affectsConfiguration(key)) {
          affected = true
          Log.info(`🧰 Config "${key}" changed`)
          break
        }
      }
      if (!affected)
        return
      if (reload)
        Log.info('🔁 Reloading loader')
    }

    const i18nProject = isVueI18nProject(this._rootpath)
    const hasLocalesSet = !!Config.localesPaths.length
    const shouldEnabled = Config.forceEnabled || (i18nProject && hasLocalesSet)
    this.setEnabled(shouldEnabled)
    if (this.enabled) {
      await this.initLoader(this._rootpath, reload)
    }
    else {
      if (!i18nProject)
        Log.info('⚠ Current workspace is not a vue-i18n project, extension disabled')
      else if (!hasLocalesSet)
        Log.info('⚠ No locales path found, extension disabled')

      if (i18nProject && !hasLocalesSet)
        ConfigLocalesGuide.autoSet()

      this.unloadAll()
    }

    this._onDidChangeLoader.fire(this.loader)
  }

  private static unloadAll () {
    Object.values(this._loaders).forEach(loader => loader.dispose())
    this._loaders = {}
  }

  static get loader () {
    return this._loaders[this._rootpath]
  }

  static getMatchedParser (ext: string) {
    if (!ext.startsWith('.'))
      ext = extname(ext)
    return this.parsers.find(parser => parser.supports(ext))
  }

  // enables
  static get enabled () {
    return this._enabled
  }

  private static setEnabled (value: boolean) {
    if (this._enabled !== value) {
      Log.info(value ? '🌞 Enabled' : '🌚 Disabled')
      this._enabled = value
      commands.executeCommand('setContext', 'vue-i18n-ally-enabled', value)
      this._onDidChangeEnabled.fire()
    }
  }

  static get allLocales () {
    return this.loader.locales
  }

  static get visibleLocales () {
    return this.getVisibleLocales(this.allLocales)
  }

  static getVisibleLocales (locales: string[]) {
    const ignored = Config.ignoredLocales
    return locales.filter(locale => !ignored.includes(locale))
  }
}
