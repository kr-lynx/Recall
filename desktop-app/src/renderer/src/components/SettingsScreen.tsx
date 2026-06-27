import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from '../App'
import { COMMON_LANGUAGES, ALL_LANGUAGES } from '../lib/languages'

interface Props {
  theme:    Theme
  setTheme: (t: Theme) => void
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`no-drag w-11 h-6 rounded-full transition-colors duration-150 cursor-pointer flex items-center px-0.5 ${
        on ? 'bg-accent' : 'bg-border'
      }`}
    >
      <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-150 ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-7">
      <p className="text-[11px] uppercase tracking-[0.16em] text-fg/35 font-semibold mb-2.5 px-1">{title}</p>
      <div className="rounded-2xl border border-border bg-muted/40 divide-y divide-border">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-fg/40 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

const selectCls =
  'no-drag bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent/60 cursor-pointer'

export function SettingsScreen({ theme, setTheme }: Props) {
  const [lang,    setLang]    = useState(() => localStorage.getItem('recall.defaultLanguage') || 'en')
  const [micId,   setMicId]   = useState(() => localStorage.getItem('recall.micId') || '')
  const [sysId,   setSysId]   = useState(() => localStorage.getItem('recall.systemDeviceId') || '')
  const [mics,    setMics]    = useState<MediaDeviceInfo[]>([])
  const [startup, setStartup] = useState(false)
  const [tray,    setTray]    = useState(() => localStorage.getItem('recall.tray') === '1')

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((d) => setMics(d.filter((x) => x.kind === 'audioinput')))
    window.api.getLaunchOnStartup().then(setStartup)
  }, [])

  const changeLang = (v: string) => { setLang(v); localStorage.setItem('recall.defaultLanguage', v) }
  const changeMic  = (v: string) => { setMicId(v); localStorage.setItem('recall.micId', v) }
  const changeSys  = (v: string) => { setSysId(v); localStorage.setItem('recall.systemDeviceId', v) }
  const changeStartup = async (v: boolean) => { setStartup(v); await window.api.setLaunchOnStartup(v) }
  const changeTray = async (v: boolean) => {
    setTray(v); localStorage.setItem('recall.tray', v ? '1' : '0'); await window.api.setTray(v)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>
      <div className="max-w-2xl">

        <Section title="Appearance">
          <Row label="Theme" hint="Dark, or cream light like the website">
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              {(['dark', 'light'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`no-drag px-3.5 py-1.5 capitalize cursor-pointer transition-colors ${
                    theme === t ? 'bg-accent text-white' : 'text-fg/60 hover:text-fg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="Recording">
          <Row label="Default language" hint="Pre-selected when you start a new recording">
            <select className={selectCls} value={lang} onChange={(e) => changeLang(e.target.value)}>
              <optgroup label="Common">
                {COMMON_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </optgroup>
              <optgroup label="All languages">
                {ALL_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </optgroup>
            </select>
          </Row>
          <Row label="Microphone" hint="Input device used for your voice">
            <select className={selectCls} value={micId} onChange={(e) => changeMic(e.target.value)}>
              <option value="">System default</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
              ))}
            </select>
          </Row>
          <Row
            label="System audio source"
            hint="The other side of the call. macOS captures it natively (just grant Screen Recording). Pick a device only to override — e.g. BlackHole, or on Windows."
          >
            <select className={selectCls} value={sysId} onChange={(e) => changeSys(e.target.value)}>
              <option value="">Automatic (recommended)</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>{m.label || 'Input device'}</option>
              ))}
            </select>
          </Row>
        </Section>

        <Section title="App">
          <Row label="Launch on startup" hint="Open Recall when you log in">
            <Toggle on={startup} onChange={changeStartup} />
          </Row>
          <Row label="Show tray icon" hint="Keep Recall in the menu bar">
            <Toggle on={tray} onChange={changeTray} />
          </Row>
          <Row label="Recordings folder" hint="Where your audio files are stored">
            <button
              onClick={() => window.api.openRecordingsFolder()}
              className="no-drag text-sm font-medium text-accent px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer"
            >
              Open
            </button>
          </Row>
        </Section>

      </div>
    </div>
  )
}
