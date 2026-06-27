import type { ReactNode } from 'react'
import type { Theme } from '../App'
import { recallLogo } from '../lib/logo'

export type Section = 'record' | 'history' | 'models' | 'settings' | 'about'

interface Props {
  section:    Section
  setSection: (s: Section) => void
  theme:      Theme
  setTheme:   (t: Theme) => void
  version:    string
}

const NAV: { key: Section; label: string; icon: ReactNode }[] = [
  {
    key: 'record', label: 'Record',
    icon: (<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></>)
  },
  {
    key: 'history', label: 'History',
    icon: (<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>)
  },
  {
    key: 'models', label: 'Models',
    icon: (<><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></>)
  },
  {
    key: 'settings', label: 'Settings',
    icon: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>)
  },
  {
    key: 'about', label: 'About',
    icon: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>)
  }
]

export function Sidebar({ section, setSection, theme, setTheme, version }: Props) {
  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col border-r border-border bg-bg">
      {/* Logo (top area draggable; sits below macOS traffic lights) */}
      <div className="drag px-5 pt-10 pb-5 flex items-center gap-2.5">
        <img src={recallLogo} alt="Recall" className="w-[26px] h-[26px] rounded-[6px]" />
        <span className="text-lg font-bold tracking-tight">Recall</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map((item) => {
          const active = section === item.key
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`no-drag w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                          transition-colors duration-150 cursor-pointer ${
                active ? 'bg-accent text-white' : 'text-fg/60 hover:text-fg hover:bg-muted'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
              </svg>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer: theme + version */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <span className="text-[11px] text-fg/30">v{version}</span>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
          className="no-drag p-1.5 rounded-lg text-fg/40 hover:text-fg hover:bg-muted transition-colors duration-150 cursor-pointer"
        >
          {theme === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  )
}
