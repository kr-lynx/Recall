import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
def test_split_channels_produces_two_mono(tmp_path):
    import transcribe_interview as ti

    stereo = tmp_path / "stereo.wav"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
            "-f", "lavfi", "-i", "sine=frequency=880:duration=1",
            "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]",
            "-map", "[a]", str(stereo),
        ],
        check=True, capture_output=True,
    )

    recruiter, me = ti.split_channels(stereo, tmp_path)
    assert recruiter.exists() and me.exists()

    for wav in (recruiter, me):
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=channels",
             "-of", "default=nw=1:nk=1", str(wav)],
            capture_output=True, text=True,
        )
        assert probe.stdout.strip() == "1"
