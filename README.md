<div align="center">

# Recall

**Record the call. Recall it all.**

A private, on-device **call recorder & transcriber** — for meetings, 1:1s, and
interviews alike. Your own searchable notes, without uploading anything to a SaaS and
**without a bot joining your call**.

**No cloud. No subscription. No account. Nothing joins the meeting. Everything runs on
your machine.**

</div>

---

## Why

I built this for myself while job-hunting: I wanted to re-listen to recruiter calls,
pull out the questions, and keep searchable notes — without uploading private
conversations to some SaaS.

It turns out the same thing is just as useful for **your own meetings**: stand-ups,
1:1s, client and partner calls — any conversation you want a private record of.

Unlike the usual note-taker tools, Recall **doesn't send a bot into your call** and
doesn't show anything to the other participants. It records your machine's own audio
locally, so it's a good fit when you just want a personal or **internal-only** record and
don't want a third-party recorder visible in the meeting. It's a small, honest desktop
app — free and open-source, and it always will be.

> **Use it responsibly.** Recording laws vary by country and state, and many places
> require the consent of everyone on the call. You're responsible for complying with the
> rules that apply to you.

## Features

- 🎙️ **One-click recording** of system audio + your microphone at the same time
- 🤝 **No bot, no SaaS** — fully local; nothing joins the call or is shown to others
- 🧠 **On-device transcription** — Whisper (whisper.cpp) or Sherpa-ONNX, fully offline
- 🌍 **99+ languages**, with auto-detect for bilingual calls
- 🗂️ **History** with full-text search across every transcript
- 📜 **"All transcripts" view** — read or export every session in one place
- 🧩 **Model manager** — download, switch, and delete transcription models
- 📝 **Markdown export** — speaker-attributed dialogue, ready for notes/Obsidian
- 🌗 Dark / light themes, menu-bar tray, launch-on-startup

## Install

Grab the latest build from [**Releases**](../../releases):

- **macOS (Apple Silicon)** — `Recall-*-arm64.dmg`
- **Windows (x64)** — `Recall-Setup-*.exe`

### macOS (Apple Silicon)

1. Open the `.dmg` and drag **Recall** to Applications.
2. Because the app is **not notarized** (see below), macOS will refuse to open it the
   normal way. Clear the quarantine flag once:
   ```bash
   xattr -cr /Applications/Recall.app
   ```
   …then open it normally. (Or right-click the app → **Open** → **Open**.)
3. First run: open **Models**, download a model (Whisper Large-V3-Turbo is a good
   default, ~1.5 GB), and start recording.

> **Capturing the other side of the call (system audio).** On macOS Recall records it
> **natively** via **ScreenCaptureKit** — no virtual audio driver, no extra setup. The
> first time you record, macOS asks for **Screen Recording** permission; grant it once
> (System Settings → Privacy & Security → Screen Recording → enable Recall) and you're
> set. The other side's voice lands on one channel, your mic on the other.
>
> *Advanced:* instead of the native capture you can point
> **Settings → System audio source** at a specific input device — e.g.
> [BlackHole](https://existential.audio/blackhole/) routed through a Multi-Output Device.

### Windows (x64)

Run `Recall-Setup-*.exe`. SmartScreen may warn you because the installer isn't signed —
choose **More info → Run anyway**. System audio is captured automatically via loopback;
no extra setup needed.

All binaries (ffmpeg, whisper-cli + dylibs, and the native macOS system-audio helper) are
bundled — no extra tooling needed to *run* it.

## A note on code signing (please read)

This is a hobby project. **I don't have a paid Apple Developer ID or a Windows signing
certificate**, so the macOS app isn't notarized and the Windows installer isn't signed.

What that means for you:

- The macOS app is **ad-hoc signed**. It runs fine, but Gatekeeper will warn you the
  first time — the `xattr -cr` step above (or right-click → Open) gets you past it.
- On Windows, SmartScreen will warn you the first time — **More info → Run anyway**.
- If you don't trust a random installer from the internet — **good instinct.** Build it
  yourself from source in two minutes (below). The whole thing is open.
- The bundled `whisper-cli` is re-signed at build time so macOS doesn't kill it; see
  [`build/afterPack.cjs`](desktop-app/build/afterPack.cjs) for the gory details.

If anyone wants to sponsor a Developer ID / signing cert so releases can be properly
signed, I'm all ears. Until then: manual builds, just for the love of it. 🙂

## How it works

```
 ┌──────────────┐   webm    ┌─────────┐   wav    ┌───────────────────────┐
 │  Renderer     │  audio    │ ffmpeg  │  16 kHz  │  whisper-cli / sherpa  │
 │ (React)       │ ───────►  │ (bundled)│ ───────► │  (on-device, offline)  │
 │ record + UI   │           └─────────┘          └───────────┬───────────┘
 └──────────────┘                                              │ segments
        ▲                                                      ▼
        │ IPC                                        ┌──────────────────────┐
        └──────────────────────────────────────────►│  Markdown transcript  │
                                                     │  speakers + questions │
                                                     └──────────────────────┘
```

The recorder captures the left channel (the other side → "Interviewer") and the right
channel (your mic → "Me") into one stereo `.webm`. On transcription, ffmpeg splits the
channels, each is transcribed separately, and the segments are merged back in time order
so you get a speaker-attributed dialogue.

## Components

| Folder | What it is |
|--------|------------|
| `desktop-app/` | The Electron app — record, transcribe, browse, export |
| `transcriber/` | A standalone Python CLI for the same transcription pipeline |

## Build from source

```bash
cd desktop-app
npm install
npm run dev          # hot-reloading dev app
npm run build:native # compile the macOS system-audio helper (needs Xcode CLT / swiftc)
npm run make:icons   # regenerate icons from brand/ (needs imagemagick + librsvg)
npm run package:mac  # → dist/Recall-*.dmg        (Apple Silicon, runs build:native first)
npm run package:win  # → dist/Recall-Setup-*.exe  (x64, requires Windows or CI)
```

Windows installers are produced by the
[`Build Windows installer`](.github/workflows/build-windows.yml) GitHub Action, which runs
on every `v*` tag and attaches the `.exe` to the matching release.

**Optional dev prerequisites** (only for `npm run dev`, not for the packaged app):
```bash
brew install ffmpeg whisper-cpp        # runtime tools
brew install imagemagick librsvg       # only if you regenerate icons
```

### macOS release notes (read before `package:mac`)

1. **Build outside iCloud Drive / Dropbox.** Cloud-sync daemons rewrite files inside the
   `.app` (relocate PNGs, re-stamp `com.apple.FinderInfo`) and break the code-signature
   seal. If the repo lives in a synced folder, send the output elsewhere:
   ```bash
   npm run build
   npx electron-builder --mac --config.directories.output="$HOME/Desktop/Recall-Release"
   ```
2. **Ad-hoc vs. Developer ID.** By default the build is ad-hoc signed (works locally,
   blocked by Gatekeeper elsewhere). With a real Apple Developer ID you can notarize:
   ```bash
   export MAC_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   # + electron-builder notarize env: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
   npm run package:mac
   ```

## Tech stack

Electron · electron-vite · React 18 · TypeScript · Tailwind CSS · whisper.cpp ·
sherpa-onnx · ffmpeg · ScreenCaptureKit (Swift)

## License

MIT — do whatever you like. See [LICENSE](LICENSE).

---

<div align="center">
Built with ☕ by <a href="https://github.com/kr-lynx">kr-lynx</a>. Acknowledgements to
<a href="https://github.com/ggerganov/whisper.cpp">whisper.cpp</a> and
<a href="https://github.com/k2-fsa/sherpa-onnx">sherpa-onnx</a>.
</div>
