#!/usr/bin/env python3
"""
Tạo Polyglot opening book (human_book.bin) chứa các khai cuộc phổ biến của con người.
Chuẩn định dạng Polyglot: 16 bytes/entry (key, move, weight, learn), sắp xếp theo key.
"""
import struct
from pathlib import Path
import chess
import chess.polyglot

def encode_move(move: chess.Move) -> int:
    to_sq = move.to_square
    from_sq = move.from_square
    prom = (move.promotion - 1) if move.promotion else 0
    return to_sq | (from_sq << 6) | (prom << 12)

# Tập hợp các biến khai cuộc con người phổ biến (SAN) kèm trọng số ban đầu
OPENING_VARIATIONS = [
    # --- 1. e4 e5 ---
    # Ruy Lopez
    ("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3", 80),
    ("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O d4", 50),
    ("e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5", 40),
    ("e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5", 45),
    # Italian Game / Giuoco Piano
    ("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O a4 a5", 75),
    ("e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 Nc3 d6 O-O O-O Bg5 h6", 60),
    ("e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3", 65),
    ("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6", 50),
    # Scotch Game
    ("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nc3 Bb4 Nxc6 bxc6 Bd3 d5", 55),
    ("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4", 45),
    # Four Knights
    ("e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6", 50),
    # King's Gambit
    ("e4 e5 f4 exf4 Nf3 g5 Bc4 Bg7 O-O h6 d4 d6", 30),

    # --- 1. e4 c5 (Sicilian Defense) ---
    # Najdorf
    ("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O", 90),
    ("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7 O-O-O", 80),
    # Classical / Dragon
    ("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4", 75),
    ("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6 Qd2 a6 O-O-O", 65),
    # Scheveningen
    ("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6 Be2 Be7 O-O O-O f4 Nc6", 70),
    # Kan / Taimanov
    ("e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Bc5 Nb3 Ba7 O-O Nc6", 60),
    ("e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be2 a6 O-O Nf6", 65),
    # Alapin (2. c3)
    ("e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6 Be2 Be7 O-O O-O", 65),
    ("e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 e6", 55),
    # Closed Sicilian
    ("e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3 e5 Qd2 Nge7", 50),

    # --- 1. e4 e6 (French Defense) ---
    ("e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5", 70),
    ("e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O Bd3", 65),
    ("e4 e6 d4 d5 Nd2 c5 exd5 exd5 Ngf3 Nc6 Bb5 Bd6 O-O Nge7", 60),
    ("e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 Nh6 b4 cxd4 cxd4 Nf5", 65),

    # --- 1. e4 c6 (Caro-Kann Defense) ---
    ("e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7", 75),
    ("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Qb6 Nc3 Nc6 O-O", 70),
    ("e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qc8 Nd2", 60),

    # --- 1. e4 d6 / g6 (Pirc / Modern) ---
    ("e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4 Nbd7", 55),
    ("e4 g6 d4 Bg7 Nf3 d6 c4 Bg4 Be2 Nc6 Be3 e5 d5 Bxf3 Bxf3 Nd4", 45),

    # --- 1. e4 d5 (Scandinavian Defense - các biến con người chuẩn xác) ---
    ("e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6", 60),
    ("e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 c6 g3 Bf5 Bg2 e6", 50),
    ("e4 d5 exd5 Nf6 d4 Nxd5 Nf3 Bg4 Be2 e6 O-O Be7 c4 Nb6", 55),

    # --- 1. d4 d5 ---
    # Queen's Gambit Declined
    ("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5", 85),
    ("d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bf4 O-O e3 c5 dxc5 Bxc5 Qc2", 70),
    ("d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O dxc4 Qc2 a6", 65),
    # Queen's Gambit Accepted
    ("d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3", 60),
    # Slav Defense
    ("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O", 75),
    ("d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Nc3 e6 Nh4 Bg6 Nxg6 hxg6", 65),
    # London System
    ("d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 Qb6 Qb3 c4 Qc2 g6", 80),
    ("d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 c3 e6 Nbd2 Bd6 Bg3 O-O", 75),
    ("d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O h3 d6 Be2 Nbd7 O-O", 70),

    # --- 1. d4 Nf6 ---
    # King's Indian Defense
    ("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7", 85),
    ("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 d5 a5 Bg5 Na6", 60),
    # Grunfeld Defense
    ("d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Rb1", 75),
    # Nimzo-Indian Defense
    ("d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O dxc4 Bxc4", 80),
    ("d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7", 75),
    # Benoni / Benko
    ("d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O", 60),
    ("d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 g6 Nc3 Bxa6 e4 Bxf1 Kxf1 d6", 50),

    # --- 1. c4 (English Opening) ---
    ("c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7", 75),
    ("c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O d4 cxd4", 70),
    ("c4 e6 Nf3 d5 g3 Nf6 Bg2 Be7 O-O O-O b3 c5 Bb2 Nc6", 65),

    # --- 1. Nf3 (Reti / King's Indian Attack) ---
    ("Nf3 d5 g3 Nf6 Bg2 c6 O-O Bf5 d3 e6 Nbd2 h6 b3 Be7", 70),
    ("Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nbd2 Nc6", 60),
]

def build_book():
    dest_path = Path(__file__).resolve().parent / "books" / "human_book.bin"
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Gom các entry theo (key, move): cộng dồn trọng số
    table = {}
    
    for san_line, base_weight in OPENING_VARIATIONS:
        board = chess.Board()
        moves = san_line.split()
        for idx, san in enumerate(moves):
            try:
                move = board.parse_san(san)
            except Exception as e:
                print(f"Lỗi parse SAN '{san}' trong dòng: {san_line}")
                break
            
            key = chess.polyglot.zobrist_hash(board)
            raw_move = encode_move(move)
            entry_key = (key, raw_move)
            
            # Trọng số giảm dần theo độ sâu nước đi
            w = max(5, int(base_weight * (0.95 ** idx)))
            table[entry_key] = table.get(entry_key, 0) + w
            
            board.push(move)

    # Đóng gói và sắp xếp theo key tăng dần (quy định của Polyglot binary)
    sorted_entries = sorted(table.items(), key=lambda item: item[0][0])
    
    with open(dest_path, "wb") as f:
        for (key, raw_move), weight in sorted_entries:
            clamped_weight = min(65535, weight)
            f.write(struct.pack(">QHHI", key, raw_move, clamped_weight, 0))
            
    print(f"[+] Đã tạo Polyglot Opening Book tại: {dest_path}")
    print(f"    Tổng số vị trí thế cờ (entries): {len(sorted_entries)}")
    
    # Kiểm tra thử bằng chess.polyglot
    with chess.polyglot.open_reader(dest_path) as reader:
        b = chess.Board()
        entries = list(reader.find_all(b))
        print("    Các nước đi nước 1 từ book:")
        for e in entries:
            print(f"      - {b.san(e.move)} (UCI: {e.move.uci()}, weight={e.weight})")

if __name__ == "__main__":
    build_book()
