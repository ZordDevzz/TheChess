#!/usr/bin/env python3
import os
import urllib.request
from pathlib import Path

BASE_URL = "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound"
DEST_ROOT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "sounds"

THEMES = ["standard", "woodland", "piano", "nes", "futuristic"]
FILES = [
    "Move.mp3",
    "Capture.mp3",
    "Check.mp3",
    "Victory.mp3",
    "Defeat.mp3",
    "Draw.mp3",
    "LowTime.mp3",
    "Error.mp3",
    "GenericNotify.mp3",
]

def download():
    DEST_ROOT.mkdir(parents=True, exist_ok=True)
    for theme in THEMES:
        theme_dir = DEST_ROOT / theme
        theme_dir.mkdir(parents=True, exist_ok=True)
        print(f"[*] Đang tải theme '{theme}'...")
        for fname in FILES:
            dest_file = theme_dir / fname
            if dest_file.exists() and dest_file.stat().st_size > 500:
                continue
            url = f"{BASE_URL}/{theme}/{fname}"
            req = urllib.request.Request(url, headers={"User-Agent": "TheChess/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp, open(dest_file, "wb") as f:
                    f.write(resp.read())
                print(f"  + {fname} ({dest_file.stat().st_size} bytes)")
            except Exception as e:
                fallback_url = f"{BASE_URL}/standard/{fname}"
                try:
                    req_fb = urllib.request.Request(fallback_url, headers={"User-Agent": "TheChess/1.0"})
                    with urllib.request.urlopen(req_fb, timeout=10) as resp, open(dest_file, "wb") as f:
                        f.write(resp.read())
                    print(f"  + {fname} (từ fallback standard)")
                except Exception as fb_err:
                    print(f"  ! Lỗi tải {fname}: {e} (fallback: {fb_err})")

    print("[+] Hoàn tất tải toàn bộ âm thanh!")

if __name__ == "__main__":
    download()
