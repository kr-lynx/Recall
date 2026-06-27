// system-audio-capture — captures macOS system audio (the other side of a call) via
// ScreenCaptureKit and writes it to a WAV file. No virtual audio driver required; the
// only prerequisite is Screen Recording permission (the same one screen recorders use).
//
// Usage:  system-audio-capture <output.wav>
// Runs until it receives SIGINT/SIGTERM, then finalizes the WAV and exits 0.
//
// Built and bundled like ffmpeg / whisper-cli; spawned by the Electron main process for
// the duration of a recording.

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia

// ── args ────────────────────────────────────────────────────────────────────────
guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: system-audio-capture <output.wav>\n".utf8))
    exit(2)
}
let outURL = URL(fileURLWithPath: CommandLine.arguments[1])

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write(Data("system-audio-capture: \(msg)\n".utf8))
    exit(1)
}

// ── recorder ────────────────────────────────────────────────────────────────────
final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private var audioFile: AVAudioFile?
    private let url: URL
    private let lock = NSLock()

    init(url: URL) { self.url = url }

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else { fail("no display available") }

        // Capture everything on the display except our own process audio, so we don't
        // record the app's own sounds back into the mix.
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 2
        // SCStream still needs a (tiny) video stream to run; we ignore the frames.
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 6)
        config.queueDepth = 6

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "sac.audio"))
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "sac.video"))
        self.stream = stream
        try await stream.startCapture()
    }

    func stop() {
        let sem = DispatchSemaphore(value: 0)
        stream?.stopCapture { _ in sem.signal() }
        _ = sem.wait(timeout: .now() + 3)
        lock.lock()
        audioFile = nil // closing the AVAudioFile finalizes the WAV header
        lock.unlock()
    }

    // SCStreamOutput
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid,
              let pcm = sampleBuffer.asPCMBuffer() else { return }
        lock.lock(); defer { lock.unlock() }
        do {
            if audioFile == nil {
                audioFile = try AVAudioFile(
                    forWriting: url,
                    settings: pcm.format.settings,
                    commonFormat: .pcmFormatFloat32,
                    interleaved: false)
            }
            try audioFile?.write(from: pcm)
        } catch {
            FileHandle.standardError.write(Data("write error: \(error)\n".utf8))
        }
    }

    // SCStreamDelegate
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        FileHandle.standardError.write(Data("stream stopped: \(error)\n".utf8))
    }
}

extension CMSampleBuffer {
    func asPCMBuffer() -> AVAudioPCMBuffer? {
        guard let fmtDesc = CMSampleBufferGetFormatDescription(self),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmtDesc)?.pointee else { return nil }
        var asbdVar = asbd
        guard let format = AVAudioFormat(streamDescription: &asbdVar) else { return nil }
        let frames = AVAudioFrameCount(CMSampleBufferGetNumSamples(self))
        guard frames > 0,
              let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        pcm.frameLength = frames
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            self, at: 0, frameCount: Int32(frames), into: pcm.mutableAudioBufferList)
        return status == noErr ? pcm : nil
    }
}

// ── run ─────────────────────────────────────────────────────────────────────────
let recorder = Recorder(url: outURL)

// Graceful shutdown on SIGINT/SIGTERM: stop the stream, finalize the WAV, exit.
let sigHandler: @convention(c) (Int32) -> Void = { _ in }
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
let sigSrcInt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
let sigSrcTerm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let onSignal: () -> Void = {
    recorder.stop()
    exit(0)
}
sigSrcInt.setEventHandler(handler: onSignal)
sigSrcTerm.setEventHandler(handler: onSignal)
sigSrcInt.resume()
sigSrcTerm.resume()
_ = sigHandler

Task {
    do {
        try await recorder.start()
        FileHandle.standardError.write(Data("system-audio-capture: started\n".utf8))
    } catch {
        fail("could not start capture: \(error)")
    }
}

dispatchMain()
