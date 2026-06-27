/**
 * electron-builder afterPack hook (macOS).
 *
 * Why this exists:
 *   The bundled `whisper-cli` + ffmpeg + their dylibs are pre-built binaries that
 *   have been patched with install_name_tool (to use @rpath / @loader_path). That
 *   patching INVALIDATES their code signature. On Apple Silicon, macOS SIGKILLs any
 *   binary whose signature is invalid -> whisper-cli dies with no exit code, surfacing
 *   in the app as "whisper exit null" and a total transcription failure.
 *
 *   electron-builder copies `extraResources` verbatim and does NOT re-sign executables
 *   inside Contents/Resources, so the broken signatures ship as-is. This hook re-signs
 *   every nested Mach-O and then re-seals the whole .app bundle so it actually runs.
 *
 * iCloud caveat:
 *   When the project lives in iCloud Drive, the fileprovider daemon continuously
 *   re-stamps `com.apple.FinderInfo` onto the bundle root, which codesign rejects with
 *   "resource fork, Finder information, or similar detritus not allowed". We strip
 *   xattrs and retry the bundle seal until the strip+sign wins the race.
 *
 * Identity:
 *   - Set MAC_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" for a
 *     hardened-runtime, timestamped, notarization-ready build.
 *   - Leave it unset for an ad-hoc signed build (runs locally / when shared with the
 *     Gatekeeper bypass, but cannot be notarized).
 */
const { execFileSync } = require('child_process')
const { join } = require('path')
const fs = require('fs')

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context
  if (electronPlatformName !== 'darwin') return

  const appName = packager.appInfo.productFilename // "Recall"
  const appPath = join(appOutDir, `${appName}.app`)
  const resources = join(appPath, 'Contents', 'Resources')
  const libDir = join(resources, 'lib')
  const binDir = join(resources, 'bin')
  const entitlements = join(__dirname, '..', 'resources', 'entitlements.mac.plist')

  const identity = process.env.MAC_SIGN_IDENTITY || '-'
  const adhoc = identity === '-'

  const codesign = (file, { withEntitlements = false, deep = false } = {}) => {
    const args = ['--force']
    if (deep) args.push('--deep') // recurse into Electron/Squirrel frameworks + helpers
    args.push('--sign', identity)
    if (!adhoc) {
      args.push('--options', 'runtime', '--timestamp')
      if (withEntitlements) args.push('--entitlements', entitlements)
    }
    args.push(file)
    execFileSync('codesign', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  }

  const stripXattrs = () => {
    try {
      execFileSync('xattr', ['-cr', appPath], { stdio: 'ignore' })
    } catch {
      /* best-effort */
    }
  }
  const sleep = (s) => {
    try {
      execFileSync('sleep', [String(s)])
    } catch {
      /* ignore */
    }
  }

  // 1) nested dylibs (libraries need no entitlements)
  if (fs.existsSync(libDir)) {
    for (const f of fs.readdirSync(libDir)) {
      if (f.endsWith('.dylib')) codesign(join(libDir, f))
    }
  }
  // 2) nested executables (entitlements + hardened runtime on the Developer ID path)
  if (fs.existsSync(binDir)) {
    for (const f of fs.readdirSync(binDir)) codesign(join(binDir, f), { withEntitlements: true })
  }

  // 3) Seal the whole bundle LAST, --deep so the Electron/Squirrel frameworks and
  //    helpers are re-sealed too. Retry through the iCloud FinderInfo race.
  let lastErr = null
  for (let attempt = 1; attempt <= 15; attempt++) {
    stripXattrs()
    try {
      codesign(appPath, { withEntitlements: true, deep: true })
      lastErr = null
      break
    } catch (e) {
      lastErr = e
      sleep(1) // let the iCloud fileprovider settle, then strip+sign again
    }
  }
  if (lastErr) {
    throw new Error(
      `[afterPack] could not seal ${appName}.app after 15 attempts ` +
        `(iCloud FinderInfo race?): ${lastErr.stderr || lastErr.message}`
    )
  }

  console.log(
    `[afterPack] re-signed nested binaries + ${appName}.app ` +
      `(identity: ${adhoc ? 'ad-hoc' : identity})`
  )
}
