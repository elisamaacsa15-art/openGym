// #303: an instance-wide default language, and the browser's, apply only to a copy nobody has
// picked a language for — never to an existing profile, whose `lang: 'en'` may be a choice.
import { describe, expect, it } from 'vitest'
import { matchLocale, autoLang, effectiveLang } from './default-lang.js'

describe('matchLocale', () => {
  it('matches the full tag first, in any case or separator', () => {
    expect(matchLocale('pt-BR')).toBe('pt-BR')
    expect(matchLocale('pt_br')).toBe('pt-BR')
    expect(matchLocale(' DE-ch ')).toBe('de-CH')
  })
  it('falls back to the base language, and to nothing for one the app does not have', () => {
    expect(matchLocale('de-AT')).toBe('de')
    expect(matchLocale('lt-LT')).toBe('lt')
    expect(matchLocale('en-US')).toBe('en')
    expect(matchLocale('pt')).toBe('pt')
    expect(matchLocale('nl-NL')).toBe(null)
    expect(matchLocale('')).toBe(null)
    expect(matchLocale(undefined)).toBe(null)
  })
  it('reads the Traditional Chinese tags as zh-TW and the rest of Chinese as zh', () => {
    expect(matchLocale('zh-TW')).toBe('zh-TW')
    expect(matchLocale('zh-Hant')).toBe('zh-TW')
    expect(matchLocale('zh-Hant-TW')).toBe('zh-TW')
    expect(matchLocale('zh-HK')).toBe('zh-TW')
    expect(matchLocale('zh-MO')).toBe('zh-TW')
    expect(matchLocale('zh-CN')).toBe('zh')
    expect(matchLocale('zh-Hans-CN')).toBe('zh')
    expect(matchLocale('zh')).toBe('zh')
  })
})

describe('autoLang', () => {
  const fresh = { lang: 'en', langAuto: true }
  it('leaves a copy alone that chose, or that predates the mark', () => {
    expect(autoLang({ lang: 'en' }, { default_lang: 'pt-BR' }, ['de-DE'])).toBe(null)
    expect(autoLang({ lang: 'en', langAuto: false }, { default_lang: 'pt-BR' }, ['de-DE'])).toBe(null)
  })
  it('puts DEFAULT_LANG before the browser, the browser before English', () => {
    expect(autoLang(fresh, { default_lang: 'pt-BR' }, ['de-DE'])).toBe('pt-BR')
    expect(autoLang(fresh, { default_lang: 'lt-LT' }, ['de-DE'])).toBe('lt')
    expect(autoLang(fresh, {}, ['nl-NL', 'de-DE'])).toBe('de')
    expect(autoLang(fresh, {}, ['nl-NL'])).toBe('en')
    expect(autoLang(fresh, { default_lang: 'xx' }, ['fr-FR'])).toBe('fr')
  })
})

// A static build (no api, so no /api/config) carries its default as VITE_DEFAULT_LANG.
describe('effectiveLang with a build default', () => {
  const fresh = { lang: 'en', langAuto: true }
  const clearCache = () => { try { localStorage.removeItem('gym_default_lang') } catch { /* no storage */ } }
  it('uses the build default for a fresh copy before any config is seen, over the browser', () => {
    clearCache()
    expect(effectiveLang(fresh, null, ['en-US'], 'pt-BR')).toBe('pt-BR')
  })
  it('keeps the stored language when there is no build default and no config yet', () => {
    clearCache()
    expect(effectiveLang(fresh, null, ['de-DE'], '')).toBe('en')
  })
  it('lets a server config win over the build default', () => {
    clearCache()
    expect(effectiveLang(fresh, { default_lang: 'es' }, ['en-US'], 'pt-BR')).toBe('es')
  })
  it('never changes a copy that picked its language', () => {
    clearCache()
    expect(effectiveLang({ lang: 'de' }, null, ['en-US'], 'pt-BR')).toBe('de')
    expect(effectiveLang({ lang: 'en', langAuto: false }, null, ['en-US'], 'pt-BR')).toBe('en')
  })
})
