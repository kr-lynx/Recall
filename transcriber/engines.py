import json
import subprocess
from pathlib import Path


def parse_whispercpp_json(json_str: str) -> list:
    data = json.loads(json_str)
    segments = []
    for item in data.get("transcription", []):
        offsets = item.get("offsets", {})
        start = offsets.get("from", 0) / 1000.0
        end = offsets.get("to", 0) / 1000.0
        segments.append((start, end, item.get("text", "")))
    return segments


def transcribe_whispercpp(wav_path, model_path, language="ru", binary="whisper-cli") -> list:
    wav_path = Path(wav_path)
    out_prefix = wav_path.with_suffix("")
    cmd = [
        binary, "-m", str(model_path), "-f", str(wav_path),
        "-l", language, "-oj", "-of", str(out_prefix),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    json_file = Path(str(out_prefix) + ".json")
    segments = parse_whispercpp_json(json_file.read_text(encoding="utf-8"))
    json_file.unlink(missing_ok=True)
    return segments


def transcribe_openai(wav_path, model_name="medium", language="auto") -> list:
    import whisper  # lazy import: only needed for --engine openai

    model = whisper.load_model(model_name)
    lang = None if language in (None, "auto") else language
    result = model.transcribe(str(wav_path), language=lang)
    return [(seg["start"], seg["end"], seg["text"]) for seg in result["segments"]]
