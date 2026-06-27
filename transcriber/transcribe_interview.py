#!/usr/bin/env python3
import argparse
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import engines
from transcript_builder import build_markdown, extract_questions, merge_segments

DEFAULT_MODEL = str(Path(__file__).resolve().parent / "models" / "ggml-large-v3-turbo.bin")


def split_channels(src, tmpdir):
    src = Path(src)
    tmpdir = Path(tmpdir)
    recruiter = tmpdir / "recruiter.wav"
    me = tmpdir / "me.wav"
    base = ["ffmpeg", "-y", "-i", str(src), "-ar", "16000", "-ac", "1"]
    subprocess.run(base + ["-af", "pan=mono|c0=FL", str(recruiter)], check=True, capture_output=True)
    subprocess.run(base + ["-af", "pan=mono|c0=FR", str(me)], check=True, capture_output=True)
    return recruiter, me


def _transcribe(wav, args):
    if args.engine == "whispercpp":
        return engines.transcribe_whispercpp(wav, args.model, language=args.language)
    return engines.transcribe_openai(wav, model_name=args.openai_model, language=args.language)


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe a stereo interview recording (L=interviewer, R=me) to Markdown."
    )
    parser.add_argument("audio", help="Path to the stereo .webm/.wav file")
    parser.add_argument("--engine", choices=["whispercpp", "openai"], default="whispercpp")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="whisper.cpp ggml model")
    parser.add_argument("--openai-model", default="medium")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--title", default=None, help="Company / role")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    src = Path(args.audio).expanduser()
    if not src.exists():
        sys.exit(f"File not found: {src}")

    with tempfile.TemporaryDirectory() as td:
        recruiter_wav, me_wav = split_channels(src, td)
        recruiter_segs = _transcribe(recruiter_wav, args)
        me_segs = _transcribe(me_wav, args)

    merged = merge_segments(recruiter_segs, me_segs)
    questions = extract_questions(recruiter_segs)

    meta = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "source": src.name,
        "title": args.title or src.stem,
    }
    md = build_markdown(meta, merged, questions)

    out = Path(args.out).expanduser() if args.out else src.with_suffix(".md")
    out.write_text(md, encoding="utf-8")
    print(f"Done: {out}")


if __name__ == "__main__":
    main()
