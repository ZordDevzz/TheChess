"""
TheChess Multiplayer — Tầng Cơ sở dữ liệu (SQLite WAL / PostgreSQL-ready DDL).
Cung cấp:
- Khởi tạo schema 3 bảng cốt lõi: `user`, `match`, `match_detail` cùng Partial Unique Index.
- Cơ chế băm mật khẩu an toàn bằng `hashlib.scrypt` + `hmac.compare_digest`.
- Tự động seed tài khoản Admin mặc định và hệ thống Bot AI (Maia 1100..1900, Stockfish).
- Các nghiệp vụ trọn gói: Admin cấp tài khoản, tạo phòng/ván đấu, ghi nhận từng nước đi (ply)
  kèm kiểm tra luật cờ `python-chess`, đi lại nước (soft-branch `is_mainline = 0`),
  kết thúc ván & cập nhật điểm Elo, và lưu kết quả Game Review.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import random
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

import chess
import chess.pgn

from models import (
    AppendMoveRequest,
    CreateMatchRequest,
    CreateUserByAdminRequest,
    MatchDetailRecord,
    MatchRecord,
    MatchSummaryItem,
    MatchWithDetailsResponse,
    STARTING_FEN,
    UpdateUserByAdminRequest,
    UserRecord,
)

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "data" / "thechess.db"
DEFAULT_SECRET_KEY_FILE = (
    Path(__file__).resolve().parent / "data" / ".secret_key"
)


def _load_or_create_secret_key() -> str:
    """
    Xác định SECRET_KEY dùng để ký token (P0-2):
    1. Ưu tiên biến môi trường `THECHESS_SECRET_KEY`.
    2. Ở môi trường production/staging: thiếu key -> từ chối khởi động.
    3. Ở dev/test: tự sinh key ngẫu nhiên `secrets.token_hex(32)` một lần,
       lưu vào file (mặc định `backend/data/.secret_key`) để token còn hiệu lực qua restart.
    Tuyệt đối không dùng hằng số key tĩnh trong source code.
    """
    env_key = os.environ.get("THECHESS_SECRET_KEY", "").strip()
    if env_key:
        return env_key

    env_name = os.environ.get("THECHESS_ENV", "development").strip().lower()
    if env_name in ("production", "prod", "staging"):
        raise RuntimeError(
            "THECHESS_ENV=production nhưng thiếu THECHESS_SECRET_KEY. "
            "Hãy đặt biến môi trường THECHESS_SECRET_KEY (ví dụ: python -c \"import secrets; print(secrets.token_hex(32))\") "
            "trước khi khởi động máy chủ."
        )

    key_file = Path(
        os.environ.get("THECHESS_SECRET_KEY_FILE", "").strip()
        or DEFAULT_SECRET_KEY_FILE
    )
    try:
        if key_file.exists():
            existing = key_file.read_text(encoding="utf-8").strip()
            if existing:
                return existing
        key = secrets.token_hex(32)
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_text(key, encoding="utf-8")
        try:
            os.chmod(key_file, 0o600)
        except OSError:
            pass
        return key
    except OSError:
        # Filesystem chỉ đọc / không ghi được: dùng key tạm cho phiên chạy này
        # (mỗi lần restart sẽ đăng xuất hết phiên, nhưng vẫn an toàn hơn key tĩnh).
        return secrets.token_hex(32)


SECRET_KEY = _load_or_create_secret_key()

MAIA_BOT_ELOS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

SCHEMA_DDL = """
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
    token_version INTEGER NOT NULL DEFAULT 1,
    quick_link_epoch INTEGER NOT NULL DEFAULT 1,
    created_by_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,

    is_bot INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1)),
    bot_engine TEXT CHECK (bot_engine IN ('maia', 'stockfish') OR bot_engine IS NULL),
    bot_default_elo INTEGER,

    rating INTEGER NOT NULL DEFAULT 1500,
    peak_rating INTEGER NOT NULL DEFAULT 1500,
    rating_deviation REAL NOT NULL DEFAULT 350.0,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    white_wins INTEGER NOT NULL DEFAULT 0,
    black_wins INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_win_streak INTEGER NOT NULL DEFAULT 0,
    avg_accuracy REAL,

    preferred_board_theme TEXT NOT NULL DEFAULT 'classic_wood',
    preferred_piece_set TEXT NOT NULL DEFAULT 'cburnett',

    last_login_at TEXT,
    last_seen_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "match" (
    id TEXT PRIMARY KEY,
    room_code TEXT UNIQUE,
    mode TEXT NOT NULL DEFAULT 'vs_ai' CHECK (mode IN ('training', 'vs_ai', 'online')),
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'setup', 'playing', 'finished', 'aborted')),
    is_rated INTEGER NOT NULL DEFAULT 1 CHECK (is_rated IN (0, 1)),

    white_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    black_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    white_rating_before INTEGER,
    white_rating_after INTEGER,
    white_rating_delta INTEGER,
    black_rating_before INTEGER,
    black_rating_after INTEGER,
    black_rating_delta INTEGER,
    ai_elo_override INTEGER,

    analysis_level TEXT NOT NULL DEFAULT 'off' CHECK (analysis_level IN ('off', 'eval_only', 'full')),
    allow_takeback INTEGER NOT NULL DEFAULT 0 CHECK (allow_takeback IN (0, 1)),
    allow_hints INTEGER NOT NULL DEFAULT 0 CHECK (allow_hints IN (0, 1)),

    time_control_type TEXT NOT NULL DEFAULT 'untimed'
        CHECK (time_control_type IN ('untimed', 'bullet', 'blitz', 'rapid', 'classical', 'custom')),
    initial_time_ms INTEGER,
    increment_ms INTEGER NOT NULL DEFAULT 0,
    white_clock_ms INTEGER,
    black_clock_ms INTEGER,
    last_move_at TEXT,
    white_connected INTEGER NOT NULL DEFAULT 1 CHECK (white_connected IN (0, 1)),
    black_connected INTEGER NOT NULL DEFAULT 1 CHECK (black_connected IN (0, 1)),

    preset_id TEXT,
    initial_fen TEXT NOT NULL,
    current_fen TEXT NOT NULL,
    current_turn TEXT NOT NULL DEFAULT 'w' CHECK (current_turn IN ('w', 'b')),
    total_plies INTEGER NOT NULL DEFAULT 0,

    result TEXT NOT NULL DEFAULT '*' CHECK (result IN ('1-0', '0-1', '1/2-1/2', '*')),
    winner_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    termination TEXT,
    pgn TEXT,

    review_status TEXT NOT NULL DEFAULT 'none'
        CHECK (review_status IN ('none', 'queued', 'running', 'done', 'error')),
    white_accuracy REAL,
    black_accuracy REAL,
    review_summary_json TEXT,

    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "match_detail" (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES "match"(id) ON DELETE CASCADE,
    parent_detail_id TEXT REFERENCES "match_detail"(id) ON DELETE SET NULL,
    ply INTEGER NOT NULL CHECK (ply >= 1),
    move_number INTEGER NOT NULL CHECK (move_number >= 1),
    is_mainline INTEGER NOT NULL DEFAULT 1 CHECK (is_mainline IN (0, 1)),
    variation_index INTEGER NOT NULL DEFAULT 0,

    turn TEXT NOT NULL CHECK (turn IN ('w', 'b')),
    player_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    uci TEXT NOT NULL,
    san TEXT NOT NULL,
    from_sq TEXT NOT NULL,
    to_sq TEXT NOT NULL,
    promotion TEXT,
    piece_moved TEXT NOT NULL,
    piece_captured TEXT,
    is_check INTEGER NOT NULL DEFAULT 0 CHECK (is_check IN (0, 1)),
    is_checkmate INTEGER NOT NULL DEFAULT 0 CHECK (is_checkmate IN (0, 1)),
    is_castling INTEGER NOT NULL DEFAULT 0 CHECK (is_castling IN (0, 1)),

    fen_before TEXT NOT NULL,
    fen_after TEXT NOT NULL,
    time_spent_ms INTEGER,
    clock_after_ms INTEGER,
    hint_used INTEGER NOT NULL DEFAULT 0 CHECK (hint_used IN (0, 1)),

    cp INTEGER,
    mate INTEGER,
    win_percent_white REAL,
    win_loss REAL,
    accuracy REAL,
    classification TEXT CHECK (
        classification IN ('Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder')
        OR classification IS NULL
    ),
    symbol TEXT,
    best_move_uci TEXT,
    best_move_san TEXT,
    pv_lines_json TEXT,

    created_at TEXT NOT NULL
);

-- Partial Unique Index: Đảm bảo nhánh chính (is_mainline = 1) có duy nhất 1 nước ở mỗi ply,
-- nhưng vẫn cho phép lưu không giới hạn các nước đã takeback hoặc nhánh thử nghiệm (is_mainline = 0).
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_detail_mainline_ply
    ON "match_detail" (match_id, ply)
    WHERE is_mainline = 1;

CREATE INDEX IF NOT EXISTS ix_match_detail_match_ply
    ON "match_detail" (match_id, is_mainline, ply ASC);

CREATE INDEX IF NOT EXISTS ix_match_detail_player_classification
    ON "match_detail" (player_user_id, classification);

CREATE INDEX IF NOT EXISTS ix_match_white_created
    ON "match" (white_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_match_black_created
    ON "match" (black_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_match_status_created
    ON "match" (status, created_at DESC);

-- Phòng Lab: giải đấu round-robin AI vs AI. Trận của giải là match thường
-- (mode='vs_ai', cả 2 bên bot) được liên kết qua `schedule` JSON dưới đây.
CREATE TABLE IF NOT EXISTS "lab_tournament" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'finished', 'aborted')),
    participants TEXT NOT NULL,
    schedule TEXT NOT NULL,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT
);

-- Chat thống nhất theo channel topic:
--   'match:<id>' (chat trong trận, khán giả xem được) | 'lobby' (chat Sảnh)
--   | 'dm:<userA>:<userB>' (id đã sort tăng dần).
-- Chat trận giữ vĩnh viễn (chỉ khóa gửi khi ván kết thúc); Sảnh prune > 90 ngày.
CREATE TABLE IF NOT EXISTS "chat_message" (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    sender_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_chat_message_topic_created
    ON "chat_message" (topic, created_at DESC);

-- Thông báo cá nhân (channel user:{id}): kind = 'turn' | 'challenge' |
-- 'match_finished' | 'dm'. WS chỉ push event nhẹ; nội dung nằm đây (nguồn truth HTTP).
CREATE TABLE IF NOT EXISTS "notification" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    read_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_notification_user_read
    ON "notification" (user_id, created_at DESC);
"""


def utc_now_iso() -> str:
    """Trả về chuỗi ISO-8601 UTC hiện tại."""
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    """Băm mật khẩu bằng scrypt (chuẩn thư viện chuẩn Python, chống brute-force)."""
    salt = secrets.token_hex(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=2**14,
        r=8,
        p=1,
        dklen=32,
    )
    return f"scrypt$16384$8$1${salt}${derived.hex()}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    """Kiểm tra mật khẩu khớp với chuỗi băm đã lưu."""
    if not stored_hash or not stored_hash.startswith("scrypt$"):
        return False
    try:
        _, n_s, r_s, p_s, salt, hex_digest = stored_hash.split("$", 5)
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt.encode("utf-8"),
            n=int(n_s),
            r=int(r_s),
            p=int(p_s),
            dklen=32,
        )
        return hmac.compare_digest(derived.hex(), hex_digest)
    except Exception:
        return False


def create_signed_token(payload: Dict[str, Any]) -> str:
    """Tạo token ký bằng HMAC-SHA256 (tương thích chuẩn JWT compact base64url)."""
    body_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    b64_body = base64.urlsafe_b64encode(body_bytes).decode("ascii").rstrip("=")
    sig = hmac.new(
        SECRET_KEY.encode("utf-8"), b64_body.encode("ascii"), hashlib.sha256
    ).digest()
    b64_sig = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    return f"{b64_body}.{b64_sig}"


def verify_signed_token(token: str) -> Optional[Dict[str, Any]]:
    """Xác thực chữ ký HMAC-SHA256 và thời hạn (`exp`) của token."""
    if not token or "." not in token:
        return None
    try:
        b64_body, b64_sig = token.split(".", 1)
        expected_sig = hmac.new(
            SECRET_KEY.encode("utf-8"), b64_body.encode("ascii"), hashlib.sha256
        ).digest()
        expected_b64_sig = (
            base64.urlsafe_b64encode(expected_sig).decode("ascii").rstrip("=")
        )
        if not hmac.compare_digest(b64_sig, expected_b64_sig):
            return None
        pad = "=" * ((4 - len(b64_body) % 4) % 4)
        payload = json.loads(
            base64.urlsafe_b64decode((b64_body + pad).encode("ascii")).decode("utf-8")
        )
        exp = payload.get("exp")
        if exp is not None and time.time() > float(exp):
            return None
        return payload
    except Exception:
        return None


def create_session_token(user: UserRecord, ttl_seconds: int = 30 * 86400) -> str:
    """Tạo token phiên đăng nhập cho người dùng."""
    return create_signed_token(
        {
            "sub": user.id,
            "username": user.username,
            "role": user.role,
            "tv": user.token_version,
            "purpose": "session",
            "exp": int(time.time()) + ttl_seconds,
        }
    )


def create_quick_login_token(user: UserRecord, ttl_seconds: int = 14 * 86400) -> str:
    """
    Tạo Quick-Link token đăng nhập 1 chạm siêu ngắn (19 ký tự base64url) do Admin cấp:
    [4B uid_tag][1B quick_link_epoch][4B exp_timestamp][5B HMAC-SHA256] = 14 bytes -> 19 chars.

    Dùng `quick_link_epoch` (tách riêng khỏi `token_version`) để link KHÔNG chết
    khi user tự đổi mật khẩu — chỉ Admin thu hồi/reset mới làm chết link.
    """
    uid_tag = hashlib.sha256(user.id.encode("utf-8")).digest()[:4]
    ql_epoch_byte = (int(user.quick_link_epoch) & 0xFF).to_bytes(1, "big")
    exp_bytes = int(time.time() + ttl_seconds).to_bytes(4, "big", signed=True)
    header = uid_tag + ql_epoch_byte + exp_bytes
    sig = hmac.new(
        SECRET_KEY.encode("utf-8"),
        b"ql:" + user.id.encode("utf-8") + header,
        hashlib.sha256,
    ).digest()[:5]
    return base64.urlsafe_b64encode(header + sig).decode("ascii").rstrip("=")


def compute_elo_deltas(
    white_rating: int,
    black_rating: int,
    result: str,
    white_games: int = 20,
    black_games: int = 20,
) -> Tuple[int, int]:
    """
    Tính độ lệch Elo (white_delta, black_delta) sau ván đấu có tính điểm.
    Hệ số K linh hoạt: K=32 cho người chơi mới (<30 ván), K=24 cho mức thông thường.
    """
    if result == "1-0":
        score_w, score_b = 1.0, 0.0
    elif result == "0-1":
        score_w, score_b = 0.0, 1.0
    elif result == "1/2-1/2":
        score_w, score_b = 0.5, 0.5
    else:
        return 0, 0

    expected_w = 1.0 / (1.0 + math.pow(10.0, (black_rating - white_rating) / 400.0))
    expected_b = 1.0 - expected_w

    k_w = 32 if white_games < 30 else 24
    k_b = 32 if black_games < 30 else 24

    delta_w = int(round(k_w * (score_w - expected_w)))
    delta_b = int(round(k_b * (score_b - expected_b)))
    return delta_w, delta_b


class DatabaseManager:
    """Quản lý kết nối SQLite (WAL mode) và toàn bộ thao tác trên 3 bảng `user`, `match`, `match_detail`."""

    def __init__(self, db_path: Optional[os.PathLike | str] = None) -> None:
        env_path = os.environ.get("THECHESS_DB_PATH")
        self.db_path = str(db_path or env_path or DEFAULT_DB_PATH)
        # P1-2: tách riêng write-lock để các truy vấn đọc (SELECT) chạy song song,
        # tận dụng khả năng đọc đồng thời của SQLite WAL.
        self._write_lock = threading.RLock()
        self._lock = self._write_lock  # tương thích ngược tên cũ
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._persistent_conn: Optional[sqlite3.Connection] = None
        if self.db_path == ":memory:":
            self._persistent_conn = self._create_connection()
        self.init_schema()
        self._user_columns: List[str] = self._load_user_columns()
        self.seed_defaults()

    def _create_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        if self.db_path != ":memory:":
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Đường ghi: serialize toàn bộ thao tác ghi (BEGIN...COMMIT) qua `_write_lock`."""
        with self._write_lock:
            if self._persistent_conn is not None:
                try:
                    yield self._persistent_conn
                    self._persistent_conn.commit()
                except Exception:
                    self._persistent_conn.rollback()
                    raise
            else:
                conn = self._create_connection()
                try:
                    yield conn
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
                finally:
                    conn.close()

    @contextmanager
    def read_connection(self) -> Iterator[sqlite3.Connection]:
        """
        Đường đọc (P1-2): với DB file WAL, mỗi lần đọc mở connection riêng và
        KHÔNG giữ write-lock -> nhiều thread đọc song song trong khi vẫn có 1 writer.
        Với `:memory:` (connection dùng chung) vẫn phải serialize bằng lock.
        """
        if self._persistent_conn is not None:
            with self._write_lock:
                yield self._persistent_conn
        else:
            conn = self._create_connection()
            try:
                yield conn
            finally:
                conn.close()

    def _load_user_columns(self) -> List[str]:
        with self.read_connection() as conn:
            return [
                r["name"]
                for r in conn.execute('PRAGMA table_info("user")').fetchall()
            ]

    def close(self) -> None:
        with self._write_lock:
            if self._persistent_conn is not None:
                self._persistent_conn.close()
                self._persistent_conn = None

    def init_schema(self) -> None:
        """Thực thi DDL khởi tạo 3 bảng `user`, `match`, `match_detail` và các chỉ mục."""
        with self.connection() as conn:
            conn.executescript(SCHEMA_DDL)
            self._migrate_schema(conn)

    @staticmethod
    def _migrate_schema(conn: sqlite3.Connection) -> None:
        """Migrate nhẹ cho DB đã có: thêm cột mới (CREATE TABLE IF NOT EXISTS không thêm cột)."""
        user_cols = {
            r["name"] for r in conn.execute('PRAGMA table_info("user")').fetchall()
        }
        if "quick_link_epoch" not in user_cols:
            conn.execute(
                'ALTER TABLE "user" ADD COLUMN quick_link_epoch INTEGER NOT NULL DEFAULT 1'
            )

    def seed_defaults(self) -> None:
        """
        Khởi tạo sẵn:
        1. Tài khoản Admin mặc định (nếu chưa có).
        2. Các tài khoản Bot AI hệ thống (`is_bot = 1`): Maia 1100..1900 và Stockfish.
        """
        now = utc_now_iso()
        admin_username = os.environ.get("THECHESS_ADMIN_USER", "admin")
        env_admin_password = os.environ.get("THECHESS_ADMIN_PASSWORD", "").strip()
        if env_admin_password:
            admin_password = env_admin_password
        else:
            # P0-2: không dùng mật khẩu mặc định tĩnh — sinh ngẫu nhiên ở lần chạy đầu
            admin_password = secrets.token_urlsafe(12)
            print(
                f"[TheChess] Đã tạo tài khoản Admin '{admin_username}' với mật khẩu "
                f"ngẫu nhiên (chỉ hiển thị 1 lần này): {admin_password}\n"
                f"[TheChess] Đặt biến môi trường THECHESS_ADMIN_PASSWORD để tự chỉ định.",
                flush=True,
            )

        with self.connection() as conn:
            row = conn.execute(
                'SELECT id FROM "user" WHERE username = ?', (admin_username,)
            ).fetchone()
            if not row:
                admin_id = str(uuid.uuid4())
                conn.execute(
                    """
                    INSERT INTO "user" (
                        id, username, display_name, password_hash, role,
                        is_active, must_change_password, token_version,
                        is_bot, rating, peak_rating, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, 'admin', 1, 0, 1, 0, 1500, 1500, ?, ?)
                    """,
                    (
                        admin_id,
                        admin_username,
                        "Administrator",
                        hash_password(admin_password),
                        now,
                        now,
                    ),
                )

            # Seed các mức Bot Maia (1100..1900)
            for elo in MAIA_BOT_ELOS:
                bot_uname = f"bot_maia_{elo}"
                exists = conn.execute(
                    'SELECT id FROM "user" WHERE username = ?', (bot_uname,)
                ).fetchone()
                if not exists:
                    conn.execute(
                        """
                        INSERT INTO "user" (
                            id, username, display_name, password_hash, role,
                            is_active, must_change_password, token_version,
                            is_bot, bot_engine, bot_default_elo,
                            rating, peak_rating, rating_deviation, created_at, updated_at
                        ) VALUES (?, ?, ?, NULL, 'player', 1, 0, 1, 1, 'maia', ?, ?, ?, 50.0, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            bot_uname,
                            f"Maia {elo}",
                            elo,
                            elo,
                            elo,
                            now,
                            now,
                        ),
                    )

            # Seed Bot Stockfish đại diện chung
            sf_uname = "bot_stockfish"
            sf_exists = conn.execute(
                'SELECT id FROM "user" WHERE username = ?', (sf_uname,)
            ).fetchone()
            if not sf_exists:
                conn.execute(
                    """
                    INSERT INTO "user" (
                        id, username, display_name, password_hash, role,
                        is_active, must_change_password, token_version,
                        is_bot, bot_engine, bot_default_elo,
                        rating, peak_rating, rating_deviation, created_at, updated_at
                    ) VALUES (?, ?, 'Stockfish AI', NULL, 'player', 1, 0, 1, 1, 'stockfish', 2000, 2000, 3190, 40.0, ?, ?)
                    """,
                    (str(uuid.uuid4()), sf_uname, now, now),
                )

    # ------------------------------------------------------------------
    # Chuyển đổi Row -> Pydantic Models
    # ------------------------------------------------------------------
    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> UserRecord:
        return UserRecord(
            id=row["id"],
            username=row["username"],
            email=row["email"],
            display_name=row["display_name"],
            avatar_url=row["avatar_url"],
            bio=row["bio"],
            role=row["role"],
            is_active=bool(row["is_active"]),
            must_change_password=bool(row["must_change_password"]),
            token_version=row["token_version"],
            quick_link_epoch=row["quick_link_epoch"],
            created_by_id=row["created_by_id"],
            is_bot=bool(row["is_bot"]),
            bot_engine=row["bot_engine"],
            bot_default_elo=row["bot_default_elo"],
            rating=row["rating"],
            peak_rating=row["peak_rating"],
            rating_deviation=row["rating_deviation"],
            games_played=row["games_played"],
            wins=row["wins"],
            draws=row["draws"],
            losses=row["losses"],
            white_wins=row["white_wins"],
            black_wins=row["black_wins"],
            current_streak=row["current_streak"],
            best_win_streak=row["best_win_streak"],
            avg_accuracy=row["avg_accuracy"],
            preferred_board_theme=row["preferred_board_theme"],
            preferred_piece_set=row["preferred_piece_set"],
            last_login_at=row["last_login_at"],
            last_seen_at=row["last_seen_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_match(row: sqlite3.Row) -> MatchRecord:
        summary_raw = row["review_summary_json"]
        review_summary = json.loads(summary_raw) if summary_raw else None
        return MatchRecord(
            id=row["id"],
            room_code=row["room_code"],
            mode=row["mode"],
            status=row["status"],
            is_rated=bool(row["is_rated"]),
            white_user_id=row["white_user_id"],
            black_user_id=row["black_user_id"],
            white_rating_before=row["white_rating_before"],
            white_rating_after=row["white_rating_after"],
            white_rating_delta=row["white_rating_delta"],
            black_rating_before=row["black_rating_before"],
            black_rating_after=row["black_rating_after"],
            black_rating_delta=row["black_rating_delta"],
            ai_elo_override=row["ai_elo_override"],
            analysis_level=row["analysis_level"],
            allow_takeback=bool(row["allow_takeback"]),
            allow_hints=bool(row["allow_hints"]),
            time_control_type=row["time_control_type"],
            initial_time_ms=row["initial_time_ms"],
            increment_ms=row["increment_ms"],
            white_clock_ms=row["white_clock_ms"],
            black_clock_ms=row["black_clock_ms"],
            last_move_at=row["last_move_at"],
            white_connected=bool(row["white_connected"]),
            black_connected=bool(row["black_connected"]),
            preset_id=row["preset_id"],
            initial_fen=row["initial_fen"],
            current_fen=row["current_fen"],
            current_turn=row["current_turn"],
            total_plies=row["total_plies"],
            result=row["result"],
            winner_user_id=row["winner_user_id"],
            termination=row["termination"],
            pgn=row["pgn"],
            review_status=row["review_status"],
            white_accuracy=row["white_accuracy"],
            black_accuracy=row["black_accuracy"],
            review_summary=review_summary,
            created_at=row["created_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_match_detail(row: sqlite3.Row) -> MatchDetailRecord:
        pv_raw = row["pv_lines_json"]
        pv_lines = json.loads(pv_raw) if pv_raw else None
        return MatchDetailRecord(
            id=row["id"],
            match_id=row["match_id"],
            parent_detail_id=row["parent_detail_id"],
            ply=row["ply"],
            move_number=row["move_number"],
            is_mainline=bool(row["is_mainline"]),
            variation_index=row["variation_index"],
            turn=row["turn"],
            player_user_id=row["player_user_id"],
            uci=row["uci"],
            san=row["san"],
            from_sq=row["from_sq"],
            to_sq=row["to_sq"],
            promotion=row["promotion"],
            piece_moved=row["piece_moved"],
            piece_captured=row["piece_captured"],
            is_check=bool(row["is_check"]),
            is_checkmate=bool(row["is_checkmate"]),
            is_castling=bool(row["is_castling"]),
            fen_before=row["fen_before"],
            fen_after=row["fen_after"],
            time_spent_ms=row["time_spent_ms"],
            clock_after_ms=row["clock_after_ms"],
            hint_used=bool(row["hint_used"]),
            cp=row["cp"],
            mate=row["mate"],
            win_percent_white=row["win_percent_white"],
            win_loss=row["win_loss"],
            accuracy=row["accuracy"],
            classification=row["classification"],
            symbol=row["symbol"],
            best_move_uci=row["best_move_uci"],
            best_move_san=row["best_move_san"],
            pv_lines=pv_lines,
            created_at=row["created_at"],
        )

    # ------------------------------------------------------------------
    # Nghiệp vụ Bảng `user` (Chỉ Admin cấp tài khoản)
    # ------------------------------------------------------------------
    def get_user_by_id(self, user_id: str) -> Optional[UserRecord]:
        with self.read_connection() as conn:
            row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (user_id,)
            ).fetchone()
            return self._row_to_user(row) if row else None

    def get_user_by_username(self, username: str) -> Optional[UserRecord]:
        with self.read_connection() as conn:
            row = conn.execute(
                'SELECT * FROM "user" WHERE username = ?', (username,)
            ).fetchone()
            return self._row_to_user(row) if row else None

    def list_users(self, include_bots: bool = True) -> List[UserRecord]:
        with self.read_connection() as conn:
            if include_bots:
                rows = conn.execute(
                    'SELECT * FROM "user" ORDER BY is_bot ASC, rating DESC, username ASC'
                ).fetchall()
            else:
                rows = conn.execute(
                    'SELECT * FROM "user" WHERE is_bot = 0 ORDER BY rating DESC, username ASC'
                ).fetchall()
            return [self._row_to_user(r) for r in rows]

    def create_user_by_admin(
        self, admin_user_id: str, req: CreateUserByAdminRequest
    ) -> UserRecord:
        """
        Tạo tài khoản mới — bắt buộc `admin_user_id` phải là Admin đang hoạt động (`role = 'admin'`).
        """
        now = utc_now_iso()
        with self.connection() as conn:
            admin_row = conn.execute(
                'SELECT id, role, is_active FROM "user" WHERE id = ?',
                (admin_user_id,),
            ).fetchone()
            if not admin_row or admin_row["role"] != "admin" or not admin_row["is_active"]:
                raise PermissionError(
                    "Chỉ tài khoản Admin đang hoạt động mới có quyền cấp tài khoản mới."
                )

            user_id = str(uuid.uuid4())
            display_name = (req.display_name or req.username).strip()
            pw_hash = hash_password(req.password)
            conn.execute(
                """
                INSERT INTO "user" (
                    id, username, email, display_name, bio, password_hash,
                    role, is_active, must_change_password, token_version,
                    created_by_id, is_bot, rating, peak_rating, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 0, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    req.username.strip(),
                    req.email,
                    display_name,
                    req.bio,
                    pw_hash,
                    req.role,
                    1 if req.must_change_password else 0,
                    admin_user_id,
                    req.initial_rating,
                    req.initial_rating,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (user_id,)
            ).fetchone()
            return self._row_to_user(row)

    def authenticate_user(self, username: str, password: str) -> Optional[UserRecord]:
        """Xác thực tài khoản người thật bằng username & password."""
        now = utc_now_iso()
        with self.connection() as conn:
            row = conn.execute(
                'SELECT * FROM "user" WHERE username = ?', (username.strip(),)
            ).fetchone()
            if not row or row["is_bot"] or not row["is_active"]:
                return None
            if not verify_password(password, row["password_hash"]):
                return None
            conn.execute(
                'UPDATE "user" SET last_login_at = ?, last_seen_at = ?, updated_at = ? WHERE id = ?',
                (now, now, now, row["id"]),
            )
            updated = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (row["id"],)
            ).fetchone()
            return self._row_to_user(updated)

    def revoke_user_sessions(
        self, admin_user_id: str, target_user_id: str, deactivate: bool = False
    ) -> UserRecord:
        """Tăng `token_version` để vô hiệu hóa mọi JWT đã cấp của `target_user_id`."""
        now = utc_now_iso()
        with self.connection() as conn:
            admin_row = conn.execute(
                'SELECT role, is_active FROM "user" WHERE id = ?', (admin_user_id,)
            ).fetchone()
            if not admin_row or admin_row["role"] != "admin" or not admin_row["is_active"]:
                raise PermissionError("Chỉ Admin mới có quyền thu hồi phiên đăng nhập.")

            if deactivate:
                conn.execute(
                    'UPDATE "user" SET token_version = token_version + 1, quick_link_epoch = quick_link_epoch + 1, is_active = 0, updated_at = ? WHERE id = ?',
                    (now, target_user_id),
                )
            else:
                conn.execute(
                    'UPDATE "user" SET token_version = token_version + 1, quick_link_epoch = quick_link_epoch + 1, updated_at = ? WHERE id = ?',
                    (now, target_user_id),
                )
            row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (target_user_id,)
            ).fetchone()
            if not row:
                raise KeyError(f"Không tìm thấy user id={target_user_id}")
            return self._row_to_user(row)

    # ------------------------------------------------------------------
    # Nghiệp vụ Bảng `match` & `match_detail`
    # ------------------------------------------------------------------
    def _generate_unique_room_code(self, conn: sqlite3.Connection) -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(20):
            code = "".join(secrets.choice(alphabet) for _ in range(6))
            exists = conn.execute(
                'SELECT 1 FROM "match" WHERE room_code = ?', (code,)
            ).fetchone()
            if not exists:
                return code
        return uuid.uuid4().hex[:8].upper()

    def create_match(self, req: CreateMatchRequest) -> MatchRecord:
        """Tạo ván đấu mới, chụp lại Elo đầu trận của Trắng và Đen, khởi tạo đồng hồ Fischer."""
        board = chess.Board(req.initial_fen)
        initial_turn = "w" if board.turn == chess.WHITE else "b"
        now = utc_now_iso()

        with self.connection() as conn:
            # Chấp nhận cả user id (UUID) lẫn username — frontend truyền
            # `bot_maia_1500` / `bot_stockfish` (username của bot) làm id phía đối thủ.
            white_row = conn.execute(
                'SELECT id, rating FROM "user" WHERE id = ? OR username = ?',
                (req.white_user_id, req.white_user_id),
            ).fetchone()
            black_row = conn.execute(
                'SELECT id, rating FROM "user" WHERE id = ? OR username = ?',
                (req.black_user_id, req.black_user_id),
            ).fetchone()
            if not white_row or not black_row:
                raise KeyError("white_user_id hoặc black_user_id không tồn tại trong bảng user.")

            # Luôn lưu id chuẩn hóa (UUID) — nếu caller truyền username, thay bằng id thật.
            white_id = white_row["id"]
            black_id = black_row["id"]

            match_id = str(uuid.uuid4())
            room_code = (
                self._generate_unique_room_code(conn) if req.generate_room_code else None
            )
            started_at = now if req.status == "playing" else None

            conn.execute(
                """
                INSERT INTO "match" (
                    id, room_code, mode, status, is_rated,
                    white_user_id, black_user_id,
                    white_rating_before, black_rating_before, ai_elo_override,
                    analysis_level, allow_takeback, allow_hints,
                    time_control_type, initial_time_ms, increment_ms,
                    white_clock_ms, black_clock_ms,
                    preset_id, initial_fen, current_fen, current_turn, total_plies,
                    result, review_status, created_at, started_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?, ?, 0,
                    '*', 'none', ?, ?, ?
                )
                """,
                (
                    match_id,
                    room_code,
                    req.mode,
                    req.status,
                    1 if req.is_rated else 0,
                    white_id,
                    black_id,
                    white_row["rating"],
                    black_row["rating"],
                    req.ai_elo_override,
                    req.analysis_level,
                    1 if req.allow_takeback else 0,
                    1 if req.allow_hints else 0,
                    req.time_control_type,
                    req.initial_time_ms,
                    req.increment_ms,
                    req.initial_time_ms,
                    req.initial_time_ms,
                    req.preset_id,
                    req.initial_fen,
                    req.initial_fen,
                    initial_turn,
                    now,
                    started_at,
                    now,
                ),
            )
            row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            return self._row_to_match(row)

    def append_move(self, match_id: str, req: AppendMoveRequest) -> MatchDetailRecord:
        """
        Thêm 1 nửa nước đi (`ply`) vào `match_detail`:
        - Kiểm tra tính hợp lệ của nước đi bằng `python-chess`.
        - Tự động nối `parent_detail_id` với nước `is_mainline = 1` liền trước.
        - Cập nhật `current_fen`, `current_turn`, `total_plies`, và đồng hồ trên bảng `match`.
        """
        now = utc_now_iso()
        with self.connection() as conn:
            match_row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            if not match_row:
                raise KeyError(f"Không tìm thấy match id={match_id}")
            if match_row["status"] in ("finished", "aborted"):
                raise ValueError("Không thể đi thêm nước vào ván đấu đã kết thúc.")

            fen_before = req.fen_before or match_row["current_fen"]
            board = chess.Board(fen_before)
            turn: str = "w" if board.turn == chess.WHITE else "b"
            expected_user_id = (
                match_row["white_user_id"]
                if turn == "w"
                else match_row["black_user_id"]
            )
            if req.player_user_id != expected_user_id:
                raise PermissionError(
                    f"Không đúng lượt người chơi: lượt hiện tại là '{turn}' ({expected_user_id})."
                )

            move = chess.Move.from_uci(req.uci)
            if move not in board.legal_moves:
                raise ValueError(f"Nước đi UCI không hợp lệ: {req.uci} tại FEN {fen_before}")

            moved_piece_obj = board.piece_at(move.from_square)
            piece_moved = moved_piece_obj.symbol().lower() if moved_piece_obj else "p"
            captured_piece_obj = board.piece_at(move.to_square)
            if not captured_piece_obj and board.is_en_passant(move):
                piece_captured: Optional[str] = "p"
            else:
                piece_captured = (
                    captured_piece_obj.symbol().lower() if captured_piece_obj else None
                )

            is_castling = board.is_castling(move)
            san = board.san(move)
            board.push(move)
            fen_after = board.fen()
            is_check = board.is_check()
            is_checkmate = board.is_checkmate()
            next_turn = "w" if board.turn == chess.WHITE else "b"

            last_mainline = conn.execute(
                """
                SELECT id, ply FROM "match_detail"
                WHERE match_id = ? AND is_mainline = 1
                ORDER BY ply DESC LIMIT 1
                """,
                (match_id,),
            ).fetchone()

            next_ply = (last_mainline["ply"] + 1) if last_mainline else 1
            parent_id = last_mainline["id"] if last_mainline else None
            move_number = (next_ply + 1) // 2

            from_sq = chess.square_name(move.from_square)
            to_sq = chess.square_name(move.to_square)
            promotion = (
                chess.piece_symbol(move.promotion).lower() if move.promotion else None
            )

            detail_id = str(uuid.uuid4())
            pv_json = json.dumps(req.pv_lines) if req.pv_lines is not None else None

            conn.execute(
                """
                INSERT INTO "match_detail" (
                    id, match_id, parent_detail_id, ply, move_number,
                    is_mainline, variation_index, turn, player_user_id,
                    uci, san, from_sq, to_sq, promotion,
                    piece_moved, piece_captured, is_check, is_checkmate, is_castling,
                    fen_before, fen_after, time_spent_ms, clock_after_ms, hint_used,
                    cp, mate, win_percent_white, win_loss, accuracy,
                    classification, symbol, best_move_uci, best_move_san, pv_lines_json,
                    created_at
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    1, 0, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?
                )
                """,
                (
                    detail_id,
                    match_id,
                    parent_id,
                    next_ply,
                    move_number,
                    turn,
                    req.player_user_id,
                    req.uci,
                    san,
                    from_sq,
                    to_sq,
                    promotion,
                    piece_moved,
                    piece_captured,
                    1 if is_check else 0,
                    1 if is_checkmate else 0,
                    1 if is_castling else 0,
                    fen_before,
                    fen_after,
                    req.time_spent_ms,
                    req.clock_after_ms,
                    1 if req.hint_used else 0,
                    req.cp,
                    req.mate,
                    req.win_percent_white,
                    req.win_loss,
                    req.accuracy,
                    req.classification,
                    req.symbol,
                    req.best_move_uci,
                    req.best_move_san,
                    pv_json,
                    now,
                ),
            )

            white_clock = (
                req.clock_after_ms
                if turn == "w" and req.clock_after_ms is not None
                else match_row["white_clock_ms"]
            )
            black_clock = (
                req.clock_after_ms
                if turn == "b" and req.clock_after_ms is not None
                else match_row["black_clock_ms"]
            )
            started_at = match_row["started_at"] or now

            conn.execute(
                """
                UPDATE "match"
                SET status = 'playing',
                    current_fen = ?,
                    current_turn = ?,
                    total_plies = ?,
                    white_clock_ms = ?,
                    black_clock_ms = ?,
                    last_move_at = ?,
                    started_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    fen_after,
                    next_turn,
                    next_ply,
                    white_clock,
                    black_clock,
                    now,
                    started_at,
                    now,
                    match_id,
                ),
            )

            detail_row = conn.execute(
                'SELECT * FROM "match_detail" WHERE id = ?', (detail_id,)
            ).fetchone()
            return self._row_to_match_detail(detail_row)

    def takeback_to_ply(self, match_id: str, target_ply: int) -> MatchRecord:
        """
        Đi lại nước (Soft-branch):
        - Đánh dấu mọi dòng `match_detail` có `ply > target_ply` và `is_mainline = 1`
          thành `is_mainline = 0` (giữ nguyên lịch sử trong DB).
        - Khôi phục `current_fen`, `current_turn`, `total_plies` của `match` về `target_ply`.
        """
        if target_ply < 0:
            raise ValueError("target_ply không được nhỏ hơn 0.")

        now = utc_now_iso()
        with self.connection() as conn:
            match_row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            if not match_row:
                raise KeyError(f"Không tìm thấy match id={match_id}")
            if not match_row["allow_takeback"]:
                raise PermissionError("Ván đấu này không cho phép đi lại nước (allow_takeback = 0).")

            conn.execute(
                """
                UPDATE "match_detail"
                SET is_mainline = 0,
                    variation_index = variation_index + 1
                WHERE match_id = ? AND is_mainline = 1 AND ply > ?
                """,
                (match_id, target_ply),
            )

            if target_ply == 0:
                restored_fen = match_row["initial_fen"]
            else:
                target_row = conn.execute(
                    """
                    SELECT fen_after FROM "match_detail"
                    WHERE match_id = ? AND is_mainline = 1 AND ply = ?
                    """,
                    (match_id, target_ply),
                ).fetchone()
                if not target_row:
                    raise ValueError(f"Không tìm thấy nước đi nhánh chính tại ply={target_ply}.")
                restored_fen = target_row["fen_after"]

            board = chess.Board(restored_fen)
            restored_turn = "w" if board.turn == chess.WHITE else "b"

            conn.execute(
                """
                UPDATE "match"
                SET current_fen = ?,
                    current_turn = ?,
                    total_plies = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (restored_fen, restored_turn, target_ply, now, match_id),
            )
            updated = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            return self._row_to_match(updated)

    def complete_match(
        self,
        match_id: str,
        result: str,
        termination: str,
    ) -> MatchRecord:
        """
        Kết thúc ván đấu:
        - Tự động dựng biên bản PGN hoàn chỉnh từ chuỗi `match_detail` (`is_mainline = 1`).
        - Nếu `is_rated = 1` và kết quả phân định (`1-0`, `0-1`, `1/2-1/2`), tính toán độ lệch Elo
          và cập nhật thống kê (`rating`, `peak_rating`, `wins`, `draws`, `losses`, `current_streak`...)
          cho cả 2 người chơi trong cùng một transaction.
        """
        if result not in ("1-0", "0-1", "1/2-1/2"):
            raise ValueError(f"Kết quả kết thúc ván không hợp lệ: {result}")

        now = utc_now_iso()
        with self.connection() as conn:
            match_row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            if not match_row:
                raise KeyError(f"Không tìm thấy match id={match_id}")
            if match_row["status"] == "finished":
                return self._row_to_match(match_row)

            white_row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (match_row["white_user_id"],)
            ).fetchone()
            black_row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (match_row["black_user_id"],)
            ).fetchone()
            assert white_row is not None and black_row is not None

            mainline_rows = conn.execute(
                """
                SELECT uci FROM "match_detail"
                WHERE match_id = ? AND is_mainline = 1
                ORDER BY ply ASC
                """,
                (match_id,),
            ).fetchall()

            # Dựng PGN chuẩn
            game = chess.pgn.Game()
            game.headers["Event"] = f"TheChess {match_row['mode'].upper()}"
            game.headers["Site"] = "TheChess"
            game.headers["Date"] = now[:10].replace("-", ".")
            game.headers["White"] = white_row["display_name"]
            game.headers["Black"] = black_row["display_name"]
            game.headers["Result"] = result
            if match_row["initial_fen"] != STARTING_FEN:
                game.headers["SetUp"] = "1"
                game.headers["FEN"] = match_row["initial_fen"]
                game.setup(chess.Board(match_row["initial_fen"]))

            node: chess.pgn.GameNode = game
            for r in mainline_rows:
                node = node.add_variation(chess.Move.from_uci(r["uci"]))
            pgn_text = str(game)

            winner_user_id: Optional[str] = None
            if result == "1-0":
                winner_user_id = white_row["id"]
            elif result == "0-1":
                winner_user_id = black_row["id"]

            w_before = match_row["white_rating_before"] or white_row["rating"]
            b_before = match_row["black_rating_before"] or black_row["rating"]

            if match_row["is_rated"]:
                delta_w, delta_b = compute_elo_deltas(
                    w_before,
                    b_before,
                    result,
                    white_row["games_played"],
                    black_row["games_played"],
                )
            else:
                delta_w, delta_b = 0, 0

            w_after = max(100, w_before + delta_w)
            b_after = max(100, b_before + delta_b)

            conn.execute(
                """
                UPDATE "match"
                SET status = 'finished',
                    result = ?,
                    winner_user_id = ?,
                    termination = ?,
                    pgn = ?,
                    white_rating_before = ?,
                    white_rating_after = ?,
                    white_rating_delta = ?,
                    black_rating_before = ?,
                    black_rating_after = ?,
                    black_rating_delta = ?,
                    finished_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    result,
                    winner_user_id,
                    termination,
                    pgn_text,
                    w_before,
                    w_after,
                    w_after - w_before,
                    b_before,
                    b_after,
                    b_after - b_before,
                    now,
                    now,
                    match_id,
                ),
            )

            # Cập nhật thống kê cho cả Trắng và Đen
            self._update_user_post_match_stats(
                conn, white_row, side="w", result=result, new_rating=w_after, now=now
            )
            self._update_user_post_match_stats(
                conn, black_row, side="b", result=result, new_rating=b_after, now=now
            )

            updated = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            return self._row_to_match(updated)

    @staticmethod
    def _update_user_post_match_stats(
        conn: sqlite3.Connection,
        user_row: sqlite3.Row,
        side: str,
        result: str,
        new_rating: int,
        now: str,
    ) -> None:
        won = (side == "w" and result == "1-0") or (side == "b" and result == "0-1")
        drew = result == "1/2-1/2"

        games_played = user_row["games_played"] + 1
        wins = user_row["wins"] + (1 if won else 0)
        draws = user_row["draws"] + (1 if drew else 0)
        losses = user_row["losses"] + (0 if (won or drew) else 1)
        white_wins = user_row["white_wins"] + (1 if (won and side == "w") else 0)
        black_wins = user_row["black_wins"] + (1 if (won and side == "b") else 0)

        prev_streak = user_row["current_streak"]
        if won:
            current_streak = (prev_streak + 1) if prev_streak > 0 else 1
        elif drew:
            current_streak = 0
        else:
            current_streak = (prev_streak - 1) if prev_streak < 0 else -1

        best_win_streak = max(user_row["best_win_streak"], current_streak)
        peak_rating = max(user_row["peak_rating"], new_rating)

        conn.execute(
            """
            UPDATE "user"
            SET rating = ?,
                peak_rating = ?,
                games_played = ?,
                wins = ?,
                draws = ?,
                losses = ?,
                white_wins = ?,
                black_wins = ?,
                current_streak = ?,
                best_win_streak = ?,
                last_seen_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                new_rating,
                peak_rating,
                games_played,
                wins,
                draws,
                losses,
                white_wins,
                black_wins,
                current_streak,
                best_win_streak,
                now,
                now,
                user_row["id"],
            ),
        )

    def save_match_review(
        self,
        match_id: str,
        white_accuracy: float,
        black_accuracy: float,
        review_summary: Dict[str, Any],
        ply_evaluations: List[Dict[str, Any]],
    ) -> MatchRecord:
        """
        Lưu kết quả phân tích Game Review vào `match` và cập nhật đánh giá từng nước vào `match_detail`.
        """
        now = utc_now_iso()
        with self.connection() as conn:
            match_row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            if not match_row:
                raise KeyError(f"Không tìm thấy match id={match_id}")

            conn.execute(
                """
                UPDATE "match"
                SET review_status = 'done',
                    white_accuracy = ?,
                    black_accuracy = ?,
                    review_summary_json = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    white_accuracy,
                    black_accuracy,
                    json.dumps(review_summary),
                    now,
                    match_id,
                ),
            )

            for item in ply_evaluations:
                ply = item.get("ply")
                if ply is None:
                    continue
                pv_lines = item.get("pv_lines")
                conn.execute(
                    """
                    UPDATE "match_detail"
                    SET cp = ?,
                        mate = ?,
                        win_percent_white = ?,
                        win_loss = ?,
                        accuracy = ?,
                        classification = ?,
                        symbol = ?,
                        best_move_uci = ?,
                        best_move_san = ?,
                        pv_lines_json = COALESCE(?, pv_lines_json)
                    WHERE match_id = ? AND is_mainline = 1 AND ply = ?
                    """,
                    (
                        item.get("cp"),
                        item.get("mate"),
                        item.get("win_percent_white"),
                        item.get("win_loss"),
                        item.get("accuracy"),
                        item.get("classification"),
                        item.get("symbol"),
                        item.get("best_move_uci"),
                        item.get("best_move_san"),
                        json.dumps(pv_lines) if pv_lines is not None else None,
                        match_id,
                        ply,
                    ),
                )

            # Cập nhật avg_accuracy trung bình cho 2 người chơi
            for uid, col in (
                (match_row["white_user_id"], "white_accuracy"),
                (match_row["black_user_id"], "black_accuracy"),
            ):
                avg_row = conn.execute(
                    """
                    SELECT AVG(
                        CASE
                            WHEN white_user_id = ? THEN white_accuracy
                            ELSE black_accuracy
                        END
                    ) AS avg_acc
                    FROM "match"
                    WHERE (white_user_id = ? OR black_user_id = ?)
                      AND review_status = 'done'
                    """,
                    (uid, uid, uid),
                ).fetchone()
                if avg_row and avg_row["avg_acc"] is not None:
                    conn.execute(
                        'UPDATE "user" SET avg_accuracy = ?, updated_at = ? WHERE id = ?',
                        (round(float(avg_row["avg_acc"]), 2), now, uid),
                    )

            updated = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            return self._row_to_match(updated)

    def get_match_record(self, match_id: str) -> Optional[MatchRecord]:
        """Lấy bản ghi `match` đơn lẻ (nhẹ, không join `match_detail`)."""
        with self.read_connection() as conn:
            row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            return self._row_to_match(row) if row else None

    def get_match_with_details(self, match_id: str) -> Optional[MatchWithDetailsResponse]:
        """Lấy toàn bộ thông tin `match`, 2 người chơi và danh sách `match_detail` (mainline + variations)."""
        with self.read_connection() as conn:
            match_row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            if not match_row:
                return None

            white_row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (match_row["white_user_id"],)
            ).fetchone()
            black_row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (match_row["black_user_id"],)
            ).fetchone()
            assert white_row is not None and black_row is not None

            detail_rows = conn.execute(
                """
                SELECT * FROM "match_detail"
                WHERE match_id = ?
                ORDER BY is_mainline DESC, ply ASC, created_at ASC
                """,
                (match_id,),
            ).fetchall()

            moves: List[MatchDetailRecord] = []
            variations: List[MatchDetailRecord] = []
            for r in detail_rows:
                rec = self._row_to_match_detail(r)
                if rec.is_mainline:
                    moves.append(rec)
                else:
                    variations.append(rec)

            return MatchWithDetailsResponse(
                match=self._row_to_match(match_row),
                white_player=self._row_to_user(white_row),
                black_player=self._row_to_user(black_row),
                moves=moves,
                variations=variations,
            )

    def get_user_matches(self, user_id: str, limit: int = 50) -> List[MatchRecord]:
        """Lấy danh sách lịch sử ván đấu của một `user` (mới nhất trước)."""
        with self.read_connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM "match"
                WHERE white_user_id = ? OR black_user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, user_id, limit),
            ).fetchall()
            return [self._row_to_match(r) for r in rows]

    def verify_token_and_get_user(
        self, token: str, expected_purpose: Optional[str] = None
    ) -> Optional[UserRecord]:
        """Kiểm tra chữ ký token, `token_version` và trạng thái `is_active` của user (hỗ trợ cả compact Quick-Link 19 ký tự)."""
        if not token:
            return None

        now = utc_now_iso()

        # Nhánh 1: Compact Quick-Link token (19 ký tự base64url, không chứa dấu '.')
        if "." not in token:
            if expected_purpose not in (None, "quick_login"):
                return None
            try:
                pad = "=" * ((4 - len(token) % 4) % 4)
                raw = base64.urlsafe_b64decode((token + pad).encode("ascii"))
                if len(raw) != 14:
                    return None
                uid_tag = raw[:4]
                ql_epoch = raw[4]
                exp = int.from_bytes(raw[5:9], "big", signed=True)
                sig = raw[9:14]
                if time.time() > float(exp):
                    return None
            except Exception:
                return None

            with self.connection() as conn:
                rows = conn.execute(
                    'SELECT * FROM "user" WHERE is_bot = 0 AND is_active = 1'
                ).fetchall()
                for row in rows:
                    row_tag = hashlib.sha256(row["id"].encode("utf-8")).digest()[:4]
                    if row_tag != uid_tag:
                        continue
                    if (int(row["quick_link_epoch"]) & 0xFF) != ql_epoch:
                        continue
                    expected_sig = hmac.new(
                        SECRET_KEY.encode("utf-8"),
                        b"ql:" + row["id"].encode("utf-8") + raw[:9],
                        hashlib.sha256,
                    ).digest()[:5]
                    if hmac.compare_digest(sig, expected_sig):
                        conn.execute(
                            'UPDATE "user" SET last_login_at = ?, last_seen_at = ?, updated_at = ? WHERE id = ?',
                            (now, now, now, row["id"]),
                        )
                        updated = conn.execute(
                            'SELECT * FROM "user" WHERE id = ?', (row["id"],)
                        ).fetchone()
                        return self._row_to_user(updated)
            return None

        # Nhánh 2: Token chuẩn dạng <b64_payload>.<b64_hmac>
        payload = verify_signed_token(token)
        if not payload:
            return None
        if expected_purpose and payload.get("purpose") != expected_purpose:
            return None
        user_id = payload.get("sub")
        token_version = payload.get("tv")
        if not user_id:
            return None
        with self.connection() as conn:
            row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (user_id,)
            ).fetchone()
            if not row or row["is_bot"] or not row["is_active"]:
                return None
            if token_version is not None and int(row["token_version"]) != int(
                token_version
            ):
                return None
            if expected_purpose == "quick_login":
                conn.execute(
                    'UPDATE "user" SET last_login_at = ?, last_seen_at = ?, updated_at = ? WHERE id = ?',
                    (now, now, now, user_id),
                )
            else:
                conn.execute(
                    'UPDATE "user" SET last_seen_at = ? WHERE id = ?',
                    (now, user_id),
                )
            updated = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (user_id,)
            ).fetchone()
            return self._row_to_user(updated)

    def change_own_password(
        self,
        user_id: str,
        new_password: str,
        display_name: Optional[str] = None,
    ) -> UserRecord:
        """Người dùng đổi mật khẩu (xóa cờ `must_change_password` và tăng `token_version`)."""
        now = utc_now_iso()
        pw_hash = hash_password(new_password)
        with self.connection() as conn:
            row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (user_id,)
            ).fetchone()
            if not row or row["is_bot"]:
                raise KeyError("Không tìm thấy tài khoản người dùng.")
            next_display = (
                display_name.strip()
                if display_name and display_name.strip()
                else row["display_name"]
            )
            conn.execute(
                """
                UPDATE "user"
                SET password_hash = ?,
                    display_name = ?,
                    must_change_password = 0,
                    token_version = token_version + 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (pw_hash, next_display, now, user_id),
            )
            updated = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (user_id,)
            ).fetchone()
            return self._row_to_user(updated)

    def update_user_by_admin(
        self,
        admin_user_id: str,
        target_user_id: str,
        req: UpdateUserByAdminRequest,
    ) -> UserRecord:
        """Admin chỉnh sửa hồ sơ, vai trò, Elo, trạng thái hoạt động hoặc đặt lại mật khẩu của thành viên."""
        now = utc_now_iso()
        with self.connection() as conn:
            admin_row = conn.execute(
                'SELECT role, is_active FROM "user" WHERE id = ?', (admin_user_id,)
            ).fetchone()
            if not admin_row or admin_row["role"] != "admin" or not admin_row["is_active"]:
                raise PermissionError("Chỉ Admin mới có quyền cập nhật tài khoản.")

            row = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (target_user_id,)
            ).fetchone()
            if not row:
                raise KeyError(f"Không tìm thấy user id={target_user_id}")

            display_name = (
                req.display_name.strip()
                if req.display_name is not None and req.display_name.strip()
                else row["display_name"]
            )
            email = req.email if req.email is not None else row["email"]
            bio = req.bio if req.bio is not None else row["bio"]
            role = req.role if req.role is not None else row["role"]
            rating = req.rating if req.rating is not None else row["rating"]
            peak_rating = max(int(row["peak_rating"]), int(rating))
            is_active = (
                (1 if req.is_active else 0)
                if req.is_active is not None
                else row["is_active"]
            )
            pw_hash = (
                hash_password(req.new_password)
                if req.new_password
                else row["password_hash"]
            )
            must_change = (
                (1 if req.must_change_password else 0)
                if req.must_change_password is not None
                else (1 if req.new_password else row["must_change_password"])
            )
            bump_tv = 1 if (req.new_password or req.is_active is False) else 0
            bump_ql = bump_tv  # reset mật khẩu / khóa tài khoản cũng làm chết quick link

            conn.execute(
                """
                UPDATE "user"
                SET display_name = ?,
                    email = ?,
                    bio = ?,
                    role = ?,
                    rating = ?,
                    peak_rating = ?,
                    is_active = ?,
                    password_hash = ?,
                    must_change_password = ?,
                    token_version = token_version + ?,
                    quick_link_epoch = quick_link_epoch + ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    display_name,
                    email,
                    bio,
                    role,
                    rating,
                    peak_rating,
                    is_active,
                    pw_hash,
                    must_change,
                    bump_tv,
                    bump_ql,
                    now,
                    target_user_id,
                ),
            )
            updated = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (target_user_id,)
            ).fetchone()
            return self._row_to_user(updated)

    def join_waiting_match(
        self, room_code_or_id: str, joining_user_id: str
    ) -> MatchRecord:
        """
        Tham gia một phòng đang ở trạng thái `waiting` (theo `room_code` hoặc `id`).
        Nếu người tạo phòng đặt tạm cả 2 bên là mình (chờ bạn bè vào), hệ thống gán bên còn trống cho `joining_user_id`
        và chuyển trạng thái ván sang `playing`.
        """
        code = room_code_or_id.strip().upper().lstrip("#")
        now = utc_now_iso()
        with self.connection() as conn:
            match_row = conn.execute(
                'SELECT * FROM "match" WHERE UPPER(room_code) = ? OR id = ?',
                (code, room_code_or_id.strip()),
            ).fetchone()
            if not match_row:
                raise KeyError(f"Không tìm thấy phòng đấu với mã '{room_code_or_id}'.")

            joiner = conn.execute(
                'SELECT * FROM "user" WHERE id = ?', (joining_user_id,)
            ).fetchone()
            if not joiner:
                raise KeyError("Tài khoản tham gia không hợp lệ.")

            if match_row["status"] == "waiting":
                w_id = match_row["white_user_id"]
                b_id = match_row["black_user_id"]
                w_rating = match_row["white_rating_before"]
                b_rating = match_row["black_rating_before"]

                if joining_user_id != w_id and joining_user_id != b_id:
                    # Gán vào bên Đen (hoặc bên đang trùng chủ phòng)
                    b_id = joining_user_id
                    b_rating = joiner["rating"]
                elif w_id == b_id and joining_user_id == w_id:
                    # Chính chủ phòng mở lại phòng đang chờ của mình -> giữ waiting
                    return self._row_to_match(match_row)

                conn.execute(
                    """
                    UPDATE "match"
                    SET status = 'playing',
                        white_user_id = ?,
                        black_user_id = ?,
                        white_rating_before = ?,
                        black_rating_before = ?,
                        started_at = COALESCE(started_at, ?),
                        last_move_at = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        w_id,
                        b_id,
                        w_rating,
                        b_rating,
                        now,
                        now,
                        now,
                        match_row["id"],
                    ),
                )

            updated = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_row["id"],)
            ).fetchone()
            return self._row_to_match(updated)

    def abort_match_by_admin(self, admin_user_id: str, match_id: str) -> MatchRecord:
        """Admin đóng/hủy một phòng đấu bị treo (`waiting` hoặc `playing` -> `aborted`)."""
        now = utc_now_iso()
        with self.connection() as conn:
            admin_row = conn.execute(
                'SELECT role, is_active FROM "user" WHERE id = ?', (admin_user_id,)
            ).fetchone()
            if not admin_row or admin_row["role"] != "admin" or not admin_row["is_active"]:
                raise PermissionError("Chỉ Admin mới có quyền đóng phòng đấu.")

            conn.execute(
                """
                UPDATE "match"
                SET status = 'aborted',
                    termination = 'aborted',
                    finished_at = ?,
                    updated_at = ?
                WHERE id = ? AND status IN ('waiting', 'setup', 'playing')
                """,
                (now, now, match_id),
            )
            row = conn.execute(
                'SELECT * FROM "match" WHERE id = ?', (match_id,)
            ).fetchone()
            if not row:
                raise KeyError(f"Không tìm thấy match id={match_id}")
            return self._row_to_match(row)

    def list_match_summaries(
        self,
        statuses: Sequence[str],
        user_id: Optional[str] = None,
        both_bots: bool = False,
        limit: int = 30,
    ) -> List[MatchSummaryItem]:
        """Lấy danh sách tóm tắt ván đấu kèm thông tin `white_player` và `black_player`.

        `both_bots=True`: chỉ lấy ván cả hai bên đều là bot (vs_ai bot-vs-bot,
        trận Lab/exhibition) — phục vụ filter lịch sử AI.
        """
        if not statuses:
            return []
        placeholders = ",".join("?" for _ in statuses)
        params: List[Any] = list(statuses)
        where_clause = f"m.status IN ({placeholders})"
        if user_id:
            where_clause += " AND (m.white_user_id = ? OR m.black_user_id = ?)"
            params.extend([user_id, user_id])
        if both_bots:
            where_clause += " AND w.is_bot = 1 AND b.is_bot = 1"
        params.append(limit)

        # P1-2: JOIN 1 lần lấy cả 2 kỳ thủ thay vì N+1 query từng user.
        w_select = ", ".join(
            f'w."{col}" AS "w__{col}"' for col in self._user_columns
        )
        b_select = ", ".join(
            f'b."{col}" AS "b__{col}"' for col in self._user_columns
        )

        with self.read_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT m.*, {w_select}, {b_select}
                FROM "match" m
                JOIN "user" w ON w.id = m.white_user_id
                JOIN "user" b ON b.id = m.black_user_id
                WHERE {where_clause}
                ORDER BY COALESCE(m.last_move_at, m.created_at) DESC
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()

            items: List[MatchSummaryItem] = []
            for r in rows:
                m = self._row_to_match(r)
                wp = self._row_to_user(
                    {col: r[f"w__{col}"] for col in self._user_columns}
                )
                bp = self._row_to_user(
                    {col: r[f"b__{col}"] for col in self._user_columns}
                )
                items.append(
                    MatchSummaryItem(
                        match=m,
                        white_player=wp,
                        black_player=bp,
                        is_system_exhibition=bool(wp.is_bot and bp.is_bot),
                    )
                )
            return items

    def get_system_stats(self) -> Dict[str, int]:
        """Thống kê tổng quan phục vụ Sảnh (Home) và Admin UI."""
        with self.read_connection() as conn:
            total_humans = conn.execute(
                'SELECT COUNT(*) AS c FROM "user" WHERE is_bot = 0'
            ).fetchone()["c"]
            active_humans = conn.execute(
                'SELECT COUNT(*) AS c FROM "user" WHERE is_bot = 0 AND is_active = 1'
            ).fetchone()["c"]
            total_bots = conn.execute(
                'SELECT COUNT(*) AS c FROM "user" WHERE is_bot = 1'
            ).fetchone()["c"]
            waiting_matches = conn.execute(
                'SELECT COUNT(*) AS c FROM "match" WHERE status = \'waiting\''
            ).fetchone()["c"]
            playing_matches = conn.execute(
                'SELECT COUNT(*) AS c FROM "match" WHERE status = \'playing\''
            ).fetchone()["c"]
            finished_matches = conn.execute(
                'SELECT COUNT(*) AS c FROM "match" WHERE status = \'finished\''
            ).fetchone()["c"]
            return {
                "total_humans": int(total_humans),
                "active_humans": int(active_humans),
                "total_bots": int(total_bots),
                "waiting_matches": int(waiting_matches),
                "playing_matches": int(playing_matches),
                "finished_matches": int(finished_matches),
            }

    @staticmethod
    def _estimate_board_eval(board: chess.Board) -> Tuple[int, float]:
        """Ước lượng nhanh điểm centipawn (góc nhìn Trắng) và % thắng cho trận biểu diễn AI."""
        if board.is_checkmate():
            if board.turn == chess.WHITE:
                return -10000, 0.0
            return 10000, 100.0
        if board.is_game_over():
            return 0, 50.0

        piece_vals = {
            chess.PAWN: 100,
            chess.KNIGHT: 310,
            chess.BISHOP: 330,
            chess.ROOK: 500,
            chess.QUEEN: 900,
        }
        cp = 0
        for pt, val in piece_vals.items():
            cp += val * (
                len(board.pieces(pt, chess.WHITE))
                - len(board.pieces(pt, chess.BLACK))
            )
        center_sqs = (chess.E4, chess.D4, chess.E5, chess.D5)
        for sq in center_sqs:
            p = board.piece_at(sq)
            if p:
                cp += 20 if p.color == chess.WHITE else -20
        win_pct = 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * cp)) - 1.0)
        return int(cp), round(max(0.5, min(99.5, win_pct)), 2)

    # ------------------------------------------------------------------
    # Phòng Lab: giải round-robin AI vs AI (trận đấu là match bot-vs-bot thường)
    # ------------------------------------------------------------------

    def create_lab_tournament(
        self,
        tid: str,
        name: str,
        participants: List[Dict[str, Any]],
        schedule: List[Dict[str, Any]],
        created_by_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Tạo giải Lab. `participants`/`schedule` lưu JSON; trả về bản ghi đã parse."""
        now = utc_now_iso()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO "lab_tournament" (id, name, status, participants, schedule, created_by_user_id, created_at)
                VALUES (?, ?, 'running', ?, ?, ?, ?)
                """,
                (tid, name, json.dumps(participants), json.dumps(schedule), created_by_user_id, now),
            )
        rec = self.get_lab_tournament(tid)
        assert rec is not None
        return rec

    def get_lab_tournament(self, tid: str) -> Optional[Dict[str, Any]]:
        """Đọc 1 giải Lab, parse JSON participants/schedule. None nếu không tồn tại."""
        with self.read_connection() as conn:
            row = conn.execute(
                'SELECT * FROM "lab_tournament" WHERE id = ?', (tid,)
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "status": row["status"],
            "participants": json.loads(row["participants"]),
            "schedule": json.loads(row["schedule"]),
            "created_by_user_id": row["created_by_user_id"],
            "created_at": row["created_at"],
            "finished_at": row["finished_at"],
        }

    def list_lab_tournaments(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self.read_connection() as conn:
            rows = conn.execute(
                'SELECT id FROM "lab_tournament" ORDER BY created_at DESC LIMIT ?',
                (limit,),
            ).fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            rec = self.get_lab_tournament(r["id"])
            if rec is not None:
                out.append(rec)
        return out

    def update_lab_tournament(
        self,
        tid: str,
        schedule: Optional[List[Dict[str, Any]]] = None,
        status: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Cập nhật schedule (gán match_id/kết quả từng trận) hoặc trạng thái giải."""
        with self.connection() as conn:
            if schedule is not None:
                conn.execute(
                    'UPDATE "lab_tournament" SET schedule = ? WHERE id = ?',
                    (json.dumps(schedule), tid),
                )
            if status is not None:
                finished_at = utc_now_iso() if status in ("finished", "aborted") else None
                conn.execute(
                    'UPDATE "lab_tournament" SET status = ?, finished_at = COALESCE(?, finished_at) WHERE id = ?',
                    (status, finished_at, tid),
                )
        return self.get_lab_tournament(tid)

    def find_live_bot_match(self) -> Optional[MatchSummaryItem]:
        """Trận AI vs AI đang `playing` gần nhất (cho Sảnh hiển thị tiêu điểm)."""
        active = self.list_match_summaries(statuses=["playing"], limit=20)
        for item in active:
            if item.is_system_exhibition:
                return item
        return None

    # ------------------------------------------------------------------
    # Chat theo channel topic: 'match:<id>' | 'lobby' | 'dm:<a>:<b>'
    # ------------------------------------------------------------------

    def create_chat_message(self, topic: str, sender_id: str, body: str) -> Dict[str, Any]:
        now = utc_now_iso()
        msg_id = str(uuid.uuid4())
        with self.connection() as conn:
            conn.execute(
                'INSERT INTO "chat_message" (id, topic, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
                (msg_id, topic, sender_id, body, now),
            )
        return {"id": msg_id, "topic": topic, "sender_id": sender_id, "body": body, "created_at": now}

    def list_chat_messages(
        self, topic: str, before: Optional[str] = None, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Tin mới nhất trước `before` (cursor created_at DESC), trả về cũ -> mới."""
        with self.read_connection() as conn:
            if before:
                rows = conn.execute(
                    'SELECT * FROM "chat_message" WHERE topic = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
                    (topic, before, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    'SELECT * FROM "chat_message" WHERE topic = ? ORDER BY created_at DESC LIMIT ?',
                    (topic, limit),
                ).fetchall()
        msgs = [
            {"id": r["id"], "topic": r["topic"], "sender_id": r["sender_id"], "body": r["body"], "created_at": r["created_at"]}
            for r in rows
        ]
        msgs.reverse()  # cũ -> mới để render trực tiếp
        return msgs

    def delete_chat_message(self, message_id: str) -> Optional[Dict[str, Any]]:
        """Admin xóa 1 tin. Trả về tin đã xóa (để broadcast chat_deleted) hoặc None."""
        with self.connection() as conn:
            row = conn.execute(
                'SELECT * FROM "chat_message" WHERE id = ?', (message_id,)
            ).fetchone()
            if not row:
                return None
            conn.execute('DELETE FROM "chat_message" WHERE id = ?', (message_id,))
        return {"id": row["id"], "topic": row["topic"], "sender_id": row["sender_id"], "body": row["body"], "created_at": row["created_at"]}

    def prune_lobby_chat(self, days: int = 90) -> int:
        """Dọn tin chat Sảnh cũ hơn `days` ngày (chat trận + DM giữ vĩnh viễn)."""
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=days)
        ).isoformat()
        with self.connection() as conn:
            cur = conn.execute(
                "DELETE FROM \"chat_message\" WHERE topic = 'lobby' AND created_at < ?",
                (cutoff,),
            )
            return cur.rowcount or 0

    # ------------------------------------------------------------------
    # Thông báo cá nhân (channel user:{id})
    # ------------------------------------------------------------------

    def create_notification(
        self, user_id: str, kind: str, payload: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        now = utc_now_iso()
        nid = str(uuid.uuid4())
        with self.connection() as conn:
            conn.execute(
                'INSERT INTO "notification" (id, user_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
                (nid, user_id, kind, json.dumps(payload or {}), now),
            )
        return {"id": nid, "user_id": user_id, "kind": kind, "payload": payload or {}, "created_at": now, "read_at": None}

    def list_notifications(self, user_id: str, limit: int = 30) -> List[Dict[str, Any]]:
        with self.read_connection() as conn:
            rows = conn.execute(
                'SELECT * FROM "notification" WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                (user_id, limit),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "kind": r["kind"],
                "payload": json.loads(r["payload_json"]),
                "read_at": r["read_at"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def count_unread_notifications(self, user_id: str) -> int:
        with self.read_connection() as conn:
            row = conn.execute(
                'SELECT COUNT(*) AS c FROM "notification" WHERE user_id = ? AND read_at IS NULL',
                (user_id,),
            ).fetchone()
        return int(row["c"]) if row else 0

    def mark_notifications_read(
        self,
        user_id: str,
        notification_ids: Optional[List[str]] = None,
        kind: Optional[str] = None,
    ) -> int:
        """Đánh dấu đã đọc. Không truyền ids = đánh dấu tất cả (lọc thêm `kind` nếu có)."""
        now = utc_now_iso()
        with self.connection() as conn:
            if notification_ids:
                placeholders = ",".join("?" for _ in notification_ids)
                cur = conn.execute(
                    f'UPDATE "notification" SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN ({placeholders})',
                    (now, user_id, *notification_ids),
                )
            else:
                if kind:
                    cur = conn.execute(
                        'UPDATE "notification" SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND kind = ?',
                        (now, user_id, kind),
                    )
                else:
                    cur = conn.execute(
                        'UPDATE "notification" SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
                        (now, user_id),
                    )
            return cur.rowcount or 0

