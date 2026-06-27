import re
from dataclasses import dataclass


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker: str


def format_timestamp(seconds: float) -> str:
    total = int(seconds)
    minutes, secs = divmod(total, 60)
    return f"{minutes:02d}:{secs:02d}"


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def split_sentences(text: str) -> list:
    text = text.strip()
    if not text:
        return []
    return [part.strip() for part in _SENTENCE_SPLIT.split(text) if part.strip()]


def extract_questions(recruiter: list) -> list:
    questions = []
    seen = set()
    for (_start, _end, text) in recruiter:
        for sentence in split_sentences(text):
            if sentence.endswith("?"):
                key = sentence.lower()
                if key not in seen:
                    seen.add(key)
                    questions.append(sentence)
    return questions


def merge_segments(recruiter: list, me: list) -> list:
    segments = [Segment(s, e, t.strip(), "Interviewer") for (s, e, t) in recruiter if t.strip()]
    segments += [Segment(s, e, t.strip(), "Me") for (s, e, t) in me if t.strip()]
    segments.sort(key=lambda seg: seg.start)
    return segments


def build_markdown(meta: dict, merged: list, questions: list) -> str:
    lines = [
        "---",
        f"date: {meta['date']}",
        f"source: {meta['source']}",
        "---",
        f"# Interview — {meta['title']} ({meta['date']})",
        "",
        "## Recruiter Questions",
    ]
    if questions:
        lines += [f"- {q}" for q in questions]
    else:
        lines.append("_No questions detected._")
    lines += ["", "## Full Transcript"]
    for seg in merged:
        lines.append(f"**{seg.speaker}** ({format_timestamp(seg.start)}): {seg.text}")
    lines.append("")
    return "\n".join(lines)
