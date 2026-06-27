import { app, shell, BrowserWindow, ipcMain, systemPreferences, dialog, Tray, Menu, nativeImage, clipboard, session, desktopCapturer } from 'electron'
import { listRecordings, getRecording, addRecording, deleteRecording, saveRecording, updateRecording } from './storage'
import { listDownloadedModels, setActiveModel } from './downloader'
import { existsSync } from 'fs'

// Enable remote debugging in dev only so agent-browser can connect. Guard on
// app.isPackaged, not NODE_ENV — packaged builds leave NODE_ENV unset, which would
// otherwise open a debug port on every shipped copy.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupTranscribeHandlers } from './transcriber'
import { setupDownloadHandlers } from './downloader'
import { setupAudioHandlers } from './audio'
import { setupSystemAudioHandlers } from './systemAudio'

let tray: Tray | null = null

function appIconPath(): string {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(__dirname, '../../resources/Images/icon.png'),
    join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'Images/icon.png')
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

function trayIconPath(): string {
  // dev: out/main → ../../resources ; packaged: process.resourcesPath.
  // Check both the resources root and an Images/ subfolder (some cloud-sync
  // folders relocate PNGs into subdirectories).
  const candidates = [
    join(__dirname, '../../resources/Images/iconTemplate.png'),
    join(__dirname, '../../resources/iconTemplate.png'),
    join(process.resourcesPath, 'Images/iconTemplate.png'),
    join(process.resourcesPath, 'iconTemplate.png')
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

async function lastTranscript(): Promise<string | null> {
  const recs = await listRecordings() // newest first
  const r = recs.find((x) => x.transcribed !== false && x.markdown)
  return r?.markdown ?? null
}

function buildTrayMenu(win: BrowserWindow): Menu {
  const models = listDownloadedModels()
  const modelSubmenu = models.length
    ? models.map((m) => ({
        label: m.name,
        type: 'radio' as const,
        checked: m.active,
        click: () => {
          setActiveModel(m.id)
          rebuildTrayMenu(win)
          win.webContents.send('models-changed')
        }
      }))
    : [{ label: 'No models downloaded', enabled: false }]

  return Menu.buildFromTemplate([
    { label: 'Open Recall', click: () => { win.show(); win.focus() } },
    { type: 'separator' },
    { label: 'Model', submenu: modelSubmenu },
    {
      label: 'Copy last transcript',
      click: async () => {
        const t = await lastTranscript()
        if (t) clipboard.writeText(t)
      }
    },
    {
      label: 'Settings…',
      click: () => { win.show(); win.focus(); win.webContents.send('navigate', 'settings') }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

function rebuildTrayMenu(win: BrowserWindow): void {
  if (tray) tray.setContextMenu(buildTrayMenu(win))
}

function setTray(win: BrowserWindow, enabled: boolean): void {
  if (enabled && !tray) {
    const p = trayIconPath()
    const img = existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
    if (process.platform === 'darwin') img.setTemplateImage(true)
    tray = new Tray(img)
    tray.setToolTip('Recall')
    tray.setContextMenu(buildTrayMenu(win))
    tray.on('click', () => (win.isVisible() ? win.hide() : (win.show(), win.focus())))
  } else if (!enabled && tray) {
    tray.destroy()
    tray = null
  }
}

// Route navigator.mediaDevices.getDisplayMedia() (used by the recorder to capture the
// other side of the call). On macOS 15+ the native system picker captures system audio
// through ScreenCaptureKit; the 'loopback' string only works on Windows, so on macOS we
// leave audio to the picker. If the picker is unavailable the handler still grants a
// screen so capture doesn't throw — the renderer then records mic only.
function setupDisplayMedia(): void {
  const isMac = process.platform === 'darwin'
  // The macOS system picker routes system audio through ScreenCaptureKit (macOS 15+);
  // the 'loopback' string only captures system audio on Windows. When the picker is
  // active (useSystemPicker) Electron handles the grant itself and this handler isn't
  // called — it stays as the fallback so capture never throws (mic-only on macOS < 15).
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (!sources.length) return callback({})
          callback({ video: sources[0], audio: isMac ? undefined : 'loopback' })
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: isMac }
  )
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f10',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.kr-lynx.recall')

  // Dock icon in dev (packaged builds use resources/icon.icns)
  if (process.platform === 'darwin' && app.dock && existsSync(appIconPath())) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath()))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()

  setupDisplayMedia()
  setupTranscribeHandlers()
  setupSystemAudioHandlers()
  setupDownloadHandlers(win)
  setupAudioHandlers()

  ipcMain.handle('request-permissions', async () => {
    if (process.platform === 'darwin') {
      const mic = await systemPreferences.askForMediaAccess('microphone')
      const screen = systemPreferences.getMediaAccessStatus('screen')
      return { mic, screen }
    }
    return { mic: true, screen: true }
  })

  ipcMain.handle('get-permissions', () => {
    if (process.platform === 'darwin') {
      return {
        mic: systemPreferences.getMediaAccessStatus('microphone'),
        screen: systemPreferences.getMediaAccessStatus('screen')
      }
    }
    return { mic: 'granted', screen: 'granted' }
  })

  ipcMain.handle('open-save-dialog', async (_event, defaultName: string) => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('desktop'), defaultName),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    return filePath
  })

  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    const { writeFile } = await import('fs/promises')
    await writeFile(filePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('get-app-paths', () => ({
    userData: app.getPath('userData'),
    home: app.getPath('home'),
    desktop: app.getPath('desktop'),
    downloads: app.getPath('downloads')
  }))

  // Recordings storage
  ipcMain.handle('list-recordings', () => listRecordings())
  ipcMain.handle('get-recording', (_e, id: string) => getRecording(id))
  ipcMain.handle('add-recording', (_e, rec) => addRecording(rec))
  ipcMain.handle('delete-recording', (_e, id: string) => deleteRecording(id))
  ipcMain.handle(
    'save-recording',
    (_e, payload: { title: string; date: string; durationMs: number; language: string; audioBuffer: ArrayBuffer }) => {
      const { audioBuffer, ...meta } = payload
      return saveRecording(meta, audioBuffer)
    }
  )
  ipcMain.handle('update-recording', (_e, id: string, patch) => updateRecording(id, patch))

  // App / settings
  ipcMain.handle('get-app-version', () => app.getVersion())
  ipcMain.handle('get-log-dir', () => app.getPath('logs'))
  ipcMain.handle('open-path', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('open-recordings-folder', async () => {
    const { mkdir } = await import('fs/promises')
    const dir = join(app.getPath('userData'), 'audio')
    await mkdir(dir, { recursive: true })
    return shell.openPath(dir)
  })
  ipcMain.handle('open-external', (_e, url: string) => shell.openExternal(url))

  ipcMain.handle('get-launch-on-startup', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('set-launch-on-startup', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return enabled
  })

  ipcMain.handle('set-tray', (_e, enabled: boolean) => {
    setTray(win, enabled)
    return enabled
  })

  ipcMain.handle('set-active-model', (_e, id: string) => {
    setActiveModel(id)
    rebuildTrayMenu(win)
    return id
  })

  // Restore tray from persisted renderer setting on launch
  ipcMain.handle('init-tray', (_e, enabled: boolean) => {
    setTray(win, enabled)
    return !!tray
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
