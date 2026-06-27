import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

type Settings = { activeModelId?: string }

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf-8')) as Settings
  } catch {
    return {}
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const s = getSettings()
  s[key] = value
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8')
}
