import { LanguageId } from '../utils'
import { Framework } from './base'

class NextTranslateFramework extends Framework {
  id= 'next-translate'
  display= 'Next Translate'

  detection= {
    packageJSON: [
      'next-translate',
    ],
  }

  languageIds: LanguageId[] = [
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
    'ejs',
  ]

  // for visualize the regex, you can use https://regexper.com/
  usageMatchRegex = [
    '[^\\w\\d]t\\([\'"`]({key})[\'"`]',
    '[^\\w\\d]t`({key})`',
    'Trans\\s+i18nKey=[\'"`]({key})[\'"`]',
  ]

  refactorTemplates(keypath: string) {
    return [
      `{t('${keypath}')}`,
      `t('${keypath}')`,
      keypath,
    ]
  }

  rewriteKeys(key: string) {
    return key.replace(/:/g, '.')
  }

  pathMatcher() {
    return '{locale}/{namespace}.json'
  }

  perferredKeystyle = 'nested' as const

  enableFeatures = {
    namespace: true,
  }
}

export default NextTranslateFramework
