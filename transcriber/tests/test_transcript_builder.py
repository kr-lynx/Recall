import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from transcript_builder import format_timestamp, split_sentences, merge_segments, extract_questions, build_markdown


def test_format_timestamp_basic():
    assert format_timestamp(0) == "00:00"
    assert format_timestamp(72) == "01:12"
    assert format_timestamp(2.9) == "00:02"


def test_split_sentences():
    assert split_sentences("Hello. How are you? Good!") == ["Hello.", "How are you?", "Good!"]
    assert split_sentences("   ") == []
    assert split_sentences("One sentence without a period") == ["One sentence without a period"]


def test_merge_segments_orders_by_start():
    recruiter = [(0.0, 2.0, "Tell me about yourself?")]
    me = [(2.5, 4.0, "Sure, of course")]
    merged = merge_segments(recruiter, me)
    assert [s.speaker for s in merged] == ["Interviewer", "Me"]
    assert merged[0].text == "Tell me about yourself?"
    assert merged[1].text == "Sure, of course"


def test_merge_segments_drops_empty():
    merged = merge_segments([(0.0, 1.0, "   ")], [(1.0, 2.0, "hi")])
    assert len(merged) == 1
    assert merged[0].speaker == "Me"


def test_extract_questions_unique_and_ordered():
    recruiter = [
        (0.0, 2.0, "Tell me about yourself. Why are you leaving?"),
        (3.0, 5.0, "Why are you leaving?"),
        (6.0, 8.0, "What are your salary expectations?"),
    ]
    assert extract_questions(recruiter) == [
        "Why are you leaving?",
        "What are your salary expectations?",
    ]


def test_build_markdown_has_sections():
    merged = merge_segments([(0.0, 2.0, "Tell me about yourself?")], [(2.5, 4.0, "Yes")])
    questions = ["Tell me about yourself?"]
    meta = {"date": "2026-06-12", "source": "x.webm", "title": "Acme"}
    md = build_markdown(meta, merged, questions)
    assert "## Recruiter Questions" in md
    assert "- Tell me about yourself?" in md
    assert "**Interviewer** (00:00): Tell me about yourself?" in md
    assert "**Me** (00:02): Yes" in md
    assert "source: x.webm" in md


def test_build_markdown_no_questions_placeholder():
    meta = {"date": "2026-06-12", "source": "x.webm", "title": "Acme"}
    md = build_markdown(meta, [], [])
    assert "_No questions detected._" in md
