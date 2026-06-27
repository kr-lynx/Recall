import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engines import parse_whispercpp_json


def test_parse_whispercpp_json():
    sample = (
        '{"transcription":['
        '{"offsets":{"from":0,"to":2000},"text":" Hello"},'
        '{"offsets":{"from":2000,"to":4000},"text":" world"}'
        ']}'
    )
    assert parse_whispercpp_json(sample) == [
        (0.0, 2.0, " Hello"),
        (2.0, 4.0, " world"),
    ]


def test_parse_whispercpp_json_empty():
    assert parse_whispercpp_json('{"transcription":[]}') == []
