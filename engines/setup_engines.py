#!/usr/bin/env python3
"""
Script tải tự động Stockfish (Linux x86-64 AVX2) và bộ trọng số Maia Chess (1100 - 1900)
về thư mục /home/zord/src/TheChess/engines/

Lc0 (để chạy Maia neural net thật — không có bản prebuilt cho Linux):
    pip install meson ninja scipy-openblas64
    git clone --depth 1 --branch v0.32.1 https://github.com/LeelaChessZero/lc0.git
    cd lc0 && meson setup build --buildtype release \
      -Dopenblas_include=$(python -c "import scipy_openblas64,os;print(os.path.join(os.path.dirname(scipy_openblas64.__file__),'include'))") \
      -Dopenblas_libdirs=$(python -c "import scipy_openblas64,os;print(os.path.join(os.path.dirname(scipy_openblas64.__file__),'lib'))")
    ninja -C build && cp build/lc0 /path/to/TheChess/engines/lc0
Không có engines/lc0, hệ thống tự fallback sang chế độ mô phỏng `human_policy_sampling`
(Stockfish + profile Elo) — vẫn chơi được nhưng không phải phân phối nước đi Maia thật.
"""
import json
import os
import stat
import shutil
import tarfile
import urllib.request
from pathlib import Path

ENGINES_DIR = Path(__file__).resolve().parent
WEIGHTS_DIR = ENGINES_DIR / "weights"

STOCKFISH_API_URL = "https://api.github.com/repos/official-stockfish/Stockfish/releases/latest"
STOCKFISH_FALLBACK_URL = "https://github.com/official-stockfish/Stockfish/releases/download/sf_17/stockfish-ubuntu-x86-64-avx2.tar"
MAIA_ELOS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
MAIA_URL_TEMPLATE = "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-{elo}.pb.gz"


def get_stockfish_download_url() -> str:
    try:
        req = urllib.request.Request(STOCKFISH_API_URL, headers={"User-Agent": "TheChess-Setup/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for asset in data.get("assets", []):
                name = asset.get("name", "")
                if "ubuntu-x86-64-avx2.tar" in name:
                    return asset["browser_download_url"]
                if "ubuntu-x86-64.tar" in name:
                    return asset["browser_download_url"]
    except Exception as e:
        print(f"[!] Không truy vấn được GitHub API ({e}), dùng URL dự phòng...")
    return STOCKFISH_FALLBACK_URL


def download_file(url: str, dest: Path, desc: str) -> bool:
    print(f"[*] Đang tải {desc} từ {url} ...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TheChess-Setup/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
            shutil.copyfileobj(resp, out)
        print(f"[+] Đã tải xong: {dest.name} ({dest.stat().st_size / (1024*1024):.2f} MB)")
        return True
    except Exception as e:
        print(f"[!] Lỗi khi tải {desc}: {e}")
        return False


def setup_stockfish():
    sf_bin = ENGINES_DIR / "stockfish"
    if sf_bin.exists() and os.access(sf_bin, os.X_OK):
        print(f"[+] Stockfish đã sẵn sàng tại: {sf_bin}")
        return

    tar_path = ENGINES_DIR / "stockfish.tar"
    sf_url = get_stockfish_download_url()
    if not download_file(sf_url, tar_path, "Stockfish AVX2 Linux"):
        return

    print("[*] Đang giải nén Stockfish...")
    extract_dir = ENGINES_DIR / "_sf_extract"
    extract_dir.mkdir(exist_ok=True)
    try:
        with tarfile.open(tar_path, "r") as tar:
            tar.extractall(path=extract_dir)
        # Tìm file binary stockfish bên trong
        for root, _, files in os.walk(extract_dir):
            for f in files:
                if f.startswith("stockfish-ubuntu") or f == "stockfish":
                    candidate = Path(root) / f
                    shutil.move(str(candidate), str(sf_bin))
                    sf_bin.chmod(sf_bin.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
                    print(f"[+] Cài đặt thành công Stockfish tại: {sf_bin}")
                    break
    finally:
        if tar_path.exists():
            tar_path.unlink()
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)


def setup_maia_weights():
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    for elo in MAIA_ELOS:
        weight_path = WEIGHTS_DIR / f"maia-{elo}.pb.gz"
        if weight_path.exists() and weight_path.stat().st_size > 100_000:
            print(f"[+] Maia {elo} weight đã tồn tại: {weight_path.name}")
            continue
        url = MAIA_URL_TEMPLATE.format(elo=elo)
        download_file(url, weight_path, f"Maia {elo} neural network weight")


def setup_opening_book():
    book_path = ENGINES_DIR / "books" / "human_book.bin"
    if book_path.exists() and book_path.stat().st_size > 0:
        print(f"[+] Opening book đã sẵn sàng tại: {book_path}")
        return
    print("[*] Đang khởi tạo Polyglot Opening Book...")
    from build_opening_book import build_book
    build_book()


if __name__ == "__main__":
    print("=== CÀI ĐẶT CHESS ENGINES & MODELS CHO THECHESS ===")
    setup_stockfish()
    setup_maia_weights()
    setup_opening_book()
    print("=== HOÀN TẤT ===")
