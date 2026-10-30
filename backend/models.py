"""
TheChess Multiplayer — Domain & Database Models (user, match, match_detail).
Định nghĩa các mô hình dữ liệu chuẩn (Pydantic v2) ánh xạ trực tiếp với 3 bảng cốt lõi:
- user: Tài khoản người chơi (do Admin cấp), Admin, và các AI Engine Bot (Maia / Stockfish).
- match: Thông tin ván đấu, phòng chờ (room_code), đồng hồ Fischer, biến động Elo và tóm tắt Review.
- match_detail: Từng nửa nước đi (ply) theo quan hệ 1-N, hỗ trợ soft-branching (is_mainline) và đánh giá Engine.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

UserRole = Literal["admin", "player"]
BotEngineType = Literal["maia", "stockfish"]
MatchMode = Literal["training", "vs_ai", "online"]
MatchStatus = Literal["waiting", "setup", "playing", "finished", "aborted"]
AnalysisLevelType = Literal["off", "eval_only", "full"]
TimeControlType = Literal["untimed", "bullet", "blitz", "rapid", "classical", "custom"]
MatchResultType = Literal["1-0", "0-1", "1/2-1/2", "*"]
ReviewStatusType = Literal["none", "queued", "running", "done", "error"]
MoveClassificationType = Literal[
    "Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder"
]


class UserRecord(BaseModel):
    """Bản ghi đầy đủ của bảng `user`."""

    id: str
    username: str
    email: Optional[str] = None
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: UserRole = "player"
    is_active: bool = True
    must_change_password: bool = True
    token_version: int = 1
    quick_link_epoch: int = 1
    created_by_id: Optional[str] = None

    # Phân biệt tài khoản Bot AI (Maia / Stockfish) và người thật
    is_bot: bool = False
    bot_engine: Optional[BotEngineType] = None
    bot_default_elo: Optional[int] = None

    # Chỉ số Elo & Thống kê thi đấu chuyên sâu
    rating: int = 1500
    peak_rating: int = 1500
    rating_deviation: float = 350.0
    games_played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    white_wins: int = 0
    black_wins: int = 0
    current_streak: int = 0
    best_win_streak: int = 0
    avg_accuracy: Optional[float] = None

    # Tùy chọn giao diện cá nhân
    preferred_board_theme: str = "classic_wood"
    preferred_piece_set: str = "cburnett"

    last_login_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    created_at: str
    updated_at: str


class CreateUserByAdminRequest(BaseModel):
    """Dữ liệu đầu vào khi Admin cấp tài khoản mới cho người chơi."""

    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=128)
    email: Optional[str] = Field(default=None, max_length=128)
    bio: Optional[str] = Field(default=None, max_length=500)
    role: UserRole = "player"
    initial_rating: int = Field(default=1500, ge=100, le=3500)
    must_change_password: bool = True


class MatchRecord(BaseModel):
    """Bản ghi đầy đủ của bảng `match`."""

    id: str
    room_code: Optional[str] = None
    mode: MatchMode = "vs_ai"
    status: MatchStatus = "waiting"
    is_rated: bool = True

    white_user_id: str
    black_user_id: str
    white_rating_before: Optional[int] = None
    white_rating_after: Optional[int] = None
    white_rating_delta: Optional[int] = None
    black_rating_before: Optional[int] = None
    black_rating_after: Optional[int] = None
    black_rating_delta: Optional[int] = None
    ai_elo_override: Optional[int] = None

    analysis_level: AnalysisLevelType = "off"
    allow_takeback: bool = False
    allow_hints: bool = False

    time_control_type: TimeControlType = "untimed"
    initial_time_ms: Optional[int] = None
    increment_ms: int = 0
    white_clock_ms: Optional[int] = None
    black_clock_ms: Optional[int] = None
    last_move_at: Optional[str] = None
    white_connected: bool = True
    black_connected: bool = True

    preset_id: Optional[str] = None
    initial_fen: str = STARTING_FEN
    current_fen: str = STARTING_FEN
    current_turn: Literal["w", "b"] = "w"
    total_plies: int = 0

    result: MatchResultType = "*"
    winner_user_id: Optional[str] = None
    termination: Optional[str] = None
    pgn: Optional[str] = None

    review_status: ReviewStatusType = "none"
    white_accuracy: Optional[float] = None
    black_accuracy: Optional[float] = None
    review_summary: Optional[Dict[str, Any]] = None

    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    updated_at: str


class CreateMatchRequest(BaseModel):
    """Dữ liệu tạo ván đấu mới (PvP hoặc vs AI)."""

    mode: MatchMode = "vs_ai"
    status: MatchStatus = "setup"
    is_rated: bool = True
    white_user_id: str
    black_user_id: str
    ai_elo_override: Optional[int] = None
    analysis_level: AnalysisLevelType = "off"
    allow_takeback: bool = False
    allow_hints: bool = False
    time_control_type: TimeControlType = "untimed"
    initial_time_ms: Optional[int] = None
    increment_ms: int = 0
    preset_id: Optional[str] = None
    initial_fen: str = STARTING_FEN
    generate_room_code: bool = True


class MatchDetailRecord(BaseModel):
    """Bản ghi chi tiết từng nước đi (`ply`) trong bảng `match_detail`."""

    id: str
    match_id: str
    parent_detail_id: Optional[str] = None
    ply: int = Field(..., ge=1)
    move_number: int = Field(..., ge=1)
    is_mainline: bool = True
    variation_index: int = 0

    turn: Literal["w", "b"]
    player_user_id: str
    uci: str
    san: str
    from_sq: str
    to_sq: str
    promotion: Optional[str] = None
    piece_moved: str = "p"
    piece_captured: Optional[str] = None
    is_check: bool = False
    is_checkmate: bool = False
    is_castling: bool = False

    fen_before: str
    fen_after: str
    time_spent_ms: Optional[int] = None
    clock_after_ms: Optional[int] = None
    hint_used: bool = False

    # Đánh giá của Engine / Game Review cho nước đi này
    cp: Optional[int] = None
    mate: Optional[int] = None
    win_percent_white: Optional[float] = None
    win_loss: Optional[float] = None
    accuracy: Optional[float] = None
    classification: Optional[MoveClassificationType] = None
    symbol: Optional[str] = None
    best_move_uci: Optional[str] = None
    best_move_san: Optional[str] = None
    pv_lines: Optional[List[Dict[str, Any]]] = None

    created_at: str


class AppendMoveRequest(BaseModel):
    """Dữ liệu ghi nhận một nước đi mới vào `match_detail`."""

    player_user_id: str
    uci: str
    fen_before: Optional[str] = None
    time_spent_ms: Optional[int] = None
    clock_after_ms: Optional[int] = None
    hint_used: bool = False
    cp: Optional[int] = None
    mate: Optional[int] = None
    win_percent_white: Optional[float] = None
    win_loss: Optional[float] = None
    accuracy: Optional[float] = None
    classification: Optional[MoveClassificationType] = None
    symbol: Optional[str] = None
    best_move_uci: Optional[str] = None
    best_move_san: Optional[str] = None
    pv_lines: Optional[List[Dict[str, Any]]] = None


class MatchWithDetailsResponse(BaseModel):
    """Phản hồi đầy đủ gồm thông tin `match`, 2 người chơi `white`/`black` và danh sách `match_detail`."""

    match: MatchRecord
    white_player: UserRecord
    black_player: UserRecord
    moves: List[MatchDetailRecord]
    variations: List[MatchDetailRecord] = Field(default_factory=list)


class MatchSummaryItem(BaseModel):
    """Thông tin tóm tắt ván đấu kèm thông tin 2 kỳ thủ để hiển thị trên Sảnh (Home) và Admin."""

    match: MatchRecord
    white_player: UserRecord
    black_player: UserRecord
    is_system_exhibition: bool = False


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class QuickLoginRequest(BaseModel):
    login_token: str = Field(..., min_length=10)


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=128)


class AuthResponse(BaseModel):
    token: str
    user: UserRecord


class UpdateUserByAdminRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=128)
    email: Optional[str] = Field(default=None, max_length=128)
    bio: Optional[str] = Field(default=None, max_length=500)
    role: Optional[UserRole] = None
    rating: Optional[int] = Field(default=None, ge=100, le=3500)
    is_active: Optional[bool] = None
    new_password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    must_change_password: Optional[bool] = None


class JoinMatchRequest(BaseModel):
    room_code_or_id: str = Field(..., min_length=1, max_length=64)


class TakebackMatchRequest(BaseModel):
    target_ply: int = Field(..., ge=0)


class FinishMatchRequest(BaseModel):
    result: Literal["1-0", "0-1", "1/2-1/2"]
    termination: str = Field(default="resign", max_length=32)


class SaveMatchReviewRequest(BaseModel):
    white_accuracy: float = Field(..., ge=0.0, le=100.0)
    black_accuracy: float = Field(..., ge=0.0, le=100.0)
    review_summary: Dict[str, Any] = Field(default_factory=dict)
    ply_evaluations: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Phòng Lab (Lab): tổ chức trận AI vs AI & giải round-robin
# (trận Lab dùng mode='vs_ai' với cả 2 bên là bot — không cần mode riêng,
#  cờ `is_system_exhibition` đã nhận diện trận bot-vs-bot)
# ---------------------------------------------------------------------------

class LabCreateMatchRequest(BaseModel):
    """Tạo 1 trận AI vs AI. Mỗi bên là 1 bot từ danh sách bot hệ thống."""
    white_bot_id: str = Field(..., min_length=3, max_length=64)
    black_bot_id: str = Field(..., min_length=3, max_length=64)
    time_control_type: TimeControlType = "untimed"
    initial_time_ms: Optional[int] = Field(default=None, ge=10_000)
    increment_ms: int = Field(default=0, ge=0, le=60_000)
    initial_fen: str = Field(default=STARTING_FEN, min_length=20, max_length=120)


class LabCreateTournamentRequest(BaseModel):
    """Tạo giải round-robin giữa >= 2 bot (mỗi cặp đấu 1 lượt)."""
    name: str = Field(..., min_length=1, max_length=64)
    # Roster hiện có 10 bot (Maia 1100-1900 + Stockfish) — để dư room mở rộng.
    bot_ids: List[str] = Field(..., min_length=2, max_length=12)

