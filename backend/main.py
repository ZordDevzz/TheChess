"""
FastAPI Backend cho TheChess:
- Giao tiếp với Stockfish 17 & Maia Chess (1100-1900)
- Phân tích thế cờ thời gian thực (MultiPV, WDL, Eval Bar)
- Phân loại từng nước đi ngay khi đánh (Best / Excellent / Good / Inaccuracy / Mistake / Blunder)
- Game Review toàn trận (chạy nền kiểu job, có tiến độ) & Kiểm tra hợp lệ FEN cho Board Editor
"""
import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import chess
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from analyzer import classify_move
from engine_manager import engine_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine_manager.shutdown()


app = FastAPI(
    title="TheChess AI & Analysis Engine API",
    version="1.1.0",
    lifespan=lifespan,
)

# CORS: chỉ cho phép các origin tường minh (api không dùng cookie nên không cần credentials).
# Override qua biến môi trường: THECHESS_ALLOWED_ORIGINS="https://a.com,https://b.com"
_DEFAULT_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:8000,http://127.0.0.1:8000"
)
_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("THECHESS_ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    fen: str = Field(default=chess.STARTING_FEN)
    depth: int = Field(default=15, ge=6, le=24)
    multipv: int = Field(default=3, ge=1, le=5)
    time_limit: Optional[float] = Field(default=0.8, ge=0.1, le=5.0)


class AIMoveRequest(BaseModel):
    fen: str
    engine_type: str = Field(default="maia", description="'maia' hoặc 'stockfish'")
    elo: int = Field(default=1500, ge=1000, le=3200)
    skill_level: Optional[int] = Field(default=None, ge=0, le=20)
    move_time: float = Field(default=0.5, ge=0.1, le=5.0)


class ClassifyMoveRequest(BaseModel):
    fen_before: str
    move_uci: str
    depth: int = Field(default=12, ge=6, le=20)


class GameReviewRequest(BaseModel):
    initial_fen: str = Field(default=chess.STARTING_FEN)
    moves_uci: List[str] = Field(max_length=500)
    depth: int = Field(default=11, ge=6, le=18)


class ValidateFenRequest(BaseModel):
    fen: str


PRESET_POSITIONS = [
    {
        "id": "standard",
        "name": "Bàn cờ tiêu chuẩn (Starting Position)",
        "category": "Standard",
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "description": "Thế cờ xuất phát tiêu chuẩn.",
    },
    {
        "id": "italian",
        "name": "Khai cuộc Ý (Giuoco Piano)",
        "category": "Opening",
        "fen": "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "description": "Khai cuộc cổ điển tập trung kiểm soát trung tâm và tấn công điểm yếu f7.",
    },
    {
        "id": "sicilian_najdorf",
        "name": "Phòng thủ Sicilian - Biến Najdorf",
        "category": "Opening",
        "fen": "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6",
        "description": "Biến khai cuộc sắc bén và giàu tính đối kháng nhất của Đen trước 1.e4.",
    },
    {
        "id": "queens_gambit",
        "name": "Gambit Hậu (Queen's Gambit Declined)",
        "category": "Opening",
        "fen": "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3",
        "description": "Khai cuộc chiến lược kinh điển cho quân Trắng.",
    },
    {
        "id": "lucena",
        "name": "Cờ tàn Xe: Thế cờ Lucena (Cầu chiến thắng)",
        "category": "Endgame",
        "fen": "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1",
        "description": "Bài học cờ tàn quan trọng nhất: Kỹ thuật 'Xây cầu' (Building a Bridge) để phong cấp tốt.",
    },
    {
        "id": "philidor",
        "name": "Cờ tàn Xe: Thế cờ phòng thủ Philidor",
        "category": "Endgame",
        "fen": "3k4/8/3KP3/8/8/8/8/r4R2 b - - 0 1",
        "description": "Kỹ thuật phòng thủ cầm hòa kinh điển ở hàng ngang số 6 dành cho bên yếu thế.",
    },
    {
        "id": "queen_odds",
        "name": "Chấp Hậu (Trắng chấp Hậu đấu AI)",
        "category": "Handicap",
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1",
        "description": "Thử thách chấp Hậu hoặc để AI chấp Hậu khi luyện tập.",
    },
    {
        "id": "tactic_greek_gift",
        "name": "Đòn phối hợp: Hiến tế Tượng Hy Lạp (Greek Gift)",
        "category": "Tactics",
        "fen": "r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7",
        "description": "Thế trận điển hình chuẩn bị đòn thí Tượng vào h7 để công kích Vua nhập thành.",
    },
]


@app.get("/api/status")
async def get_status() -> Dict[str, Any]:
    status = engine_manager.get_status()
    status["presets"] = PRESET_POSITIONS
    return status


@app.post("/api/analyze")
async def analyze_position(req: AnalyzeRequest) -> Dict[str, Any]:
    try:
        chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"FEN không hợp lệ: {e}")

    try:
        return await engine_manager.analyze_position(
            fen=req.fen,
            depth=req.depth,
            multipv=req.multipv,
            time_limit=req.time_limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai-move")
async def ai_move(req: AIMoveRequest) -> Dict[str, Any]:
    try:
        chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"FEN không hợp lệ: {e}")

    try:
        return await engine_manager.get_ai_move(
            fen=req.fen,
            engine_type=req.engine_type,
            elo=req.elo,
            skill_level=req.skill_level,
            move_time=req.move_time,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/classify-move")
async def classify_single_move(req: ClassifyMoveRequest) -> Dict[str, Any]:
    try:
        board = chess.Board(req.fen_before)
        move = chess.Move.from_uci(req.move_uci)
        if move not in board.legal_moves:
            raise ValueError("Nước đi không hợp lệ trên bàn cờ hiện tại.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    mover_is_white = board.turn == chess.WHITE
    before_analysis = await engine_manager.analyze_position(
        fen=req.fen_before, depth=req.depth, multipv=1, time_limit=0.35
    )
    best_line = before_analysis["lines"][0] if before_analysis["lines"] else None
    best_uci = best_line["move_uci"] if best_line else None
    best_san = best_line["move_san"] if best_line else None

    board.push(move)
    fen_after = board.fen()
    after_analysis = await engine_manager.analyze_position(
        fen=fen_after, depth=req.depth, multipv=3, time_limit=0.45
    )

    cls_data = classify_move(
        win_pct_before_white=before_analysis["win_percent_white"],
        win_pct_after_white=after_analysis["win_percent_white"],
        mover_is_white=mover_is_white,
        played_uci=req.move_uci,
        best_uci=best_uci,
    )

    return {
        "move_uci": req.move_uci,
        "best_move_uci": best_uci,
        "best_move_san": best_san,
        "before_win_percent_white": before_analysis["win_percent_white"],
        "after_analysis": after_analysis,
        **cls_data,
    }


# ---------------------------------------------------------------------------
# Game Review chạy nền: POST trả về job_id ngay lập tức, client poll GET để lấy tiến độ/kết quả.
# Nhờ vậy review ván dài không khóa HTTP request và không chặn các API khác.
# ---------------------------------------------------------------------------
REVIEW_JOBS: Dict[str, Dict[str, Any]] = {}
MAX_REVIEW_JOBS = 20


def _cleanup_old_jobs() -> None:
    if len(REVIEW_JOBS) <= MAX_REVIEW_JOBS:
        return
    # Xóa các job xong lỗi / cũ nhất сначала
    finished = [
        (job_id, job)
        for job_id, job in REVIEW_JOBS.items()
        if job["status"] in ("done", "error")
    ]
    for job_id, _ in finished[: len(finished) - MAX_REVIEW_JOBS]:
        REVIEW_JOBS.pop(job_id, None)


@app.post("/api/review-game")
async def review_game(req: GameReviewRequest) -> Dict[str, Any]:
    try:
        chess.Board(req.initial_fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"FEN khởi đầu không hợp lệ: {e}")
    if not req.moves_uci:
        raise HTTPException(status_code=400, detail="Danh sách nước đi trống, không thể review.")

    job_id = uuid.uuid4().hex[:12]
    job: Dict[str, Any] = {
        "status": "running",
        "progress": {"done": 0, "total": len(req.moves_uci)},
        "result": None,
        "error": None,
        "task": None,
    }
    REVIEW_JOBS[job_id] = job
    _cleanup_old_jobs()
    job["task"] = asyncio.create_task(_run_review_job(job_id, req))
    return {"job_id": job_id, "status": "running", "progress": job["progress"]}


async def _run_review_job(job_id: str, req: GameReviewRequest) -> None:
    job = REVIEW_JOBS[job_id]

    def _report(done: int, total: int) -> None:
        job["progress"] = {"done": done, "total": total}

    try:
        result = await engine_manager.review_game(
            initial_fen=req.initial_fen,
            moves_uci=req.moves_uci,
            depth=req.depth,
            progress_cb=_report,
        )
        job["result"] = result
        job["status"] = "done"
    except Exception as e:  # noqa: BLE001 - báo lỗi nguyên văn về cho client
        job["error"] = str(e)
        job["status"] = "error"


@app.get("/api/review-game/{job_id}")
async def get_review_job(job_id: str) -> Dict[str, Any]:
    job = REVIEW_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job review (có thể đã bị dọn).")
    resp: Dict[str, Any] = {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
    }
    if job["status"] == "done":
        resp["result"] = job["result"]
    elif job["status"] == "error":
        resp["error"] = job["error"]
    return resp


@app.post("/api/validate-fen")
async def validate_fen(req: ValidateFenRequest) -> Dict[str, Any]:
    try:
        board = chess.Board(req.fen)
    except ValueError as e:
        return {"valid": False, "errors": [f"Cú pháp FEN không hợp lệ: {e}"]}

    status = board.status()
    if status == chess.STATUS_VALID:
        return {
            "valid": True,
            "errors": [],
            "turn": "w" if board.turn == chess.WHITE else "b",
            "is_check": board.is_check(),
            "legal_moves_count": board.legal_moves.count(),
        }

    errors: List[str] = []
    if status & chess.STATUS_NO_WHITE_KING:
        errors.append("Thiếu Vua Trắng trên bàn cờ.")
    if status & chess.STATUS_NO_BLACK_KING:
        errors.append("Thiếu Vua Đen trên bàn cờ.")
    if status & chess.STATUS_TOO_MANY_KINGS:
        errors.append("Quá nhiều Vua trên bàn cờ (mỗi bên chỉ được có 1 Vua).")
    if status & chess.STATUS_PAWNS_ON_BACKRANK:
        errors.append("Quân Tốt không được nằm ở hàng ngang số 1 hoặc số 8.")
    if status & chess.STATUS_OPPOSITE_CHECK:
        errors.append("Bên không tới lượt đi đang bị chiếu (thế cờ bất hợp lệ).")
    if status & chess.STATUS_TOO_MANY_WHITE_PAWNS:
        errors.append("Quá nhiều Tốt Trắng (> 8 quân).")
    if status & chess.STATUS_TOO_MANY_BLACK_PAWNS:
        errors.append("Quá nhiều Tốt Đen (> 8 quân).")
    if status & chess.STATUS_BAD_CASTLING_RIGHTS:
        errors.append("Quyền nhập thành không khớp với vị trí hiện tại của Vua/Xe.")
    if not errors:
        errors.append(f"Thế cờ không hợp lệ (Mã trạng thái: {status}).")

    return {"valid": False, "errors": errors}


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

