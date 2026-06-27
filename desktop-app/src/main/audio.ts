import { ipcMain } from 'electron'

// Audio handling is done in the renderer via Web Audio API.
// This module provides IPC for any main-process audio tasks (future: direct capture).
export function setupAudioHandlers(): void {
  // placeholder for future native audio capture on Windows (WASAPI loopback)
  ipcMain.handle('get-audio-sources', async () => {
    // On Mac/Win, desktopCapturer is called from renderer directly
    return []
  })
}
