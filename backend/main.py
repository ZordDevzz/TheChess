"""
FastAPI Backend cho TheChess:
- Giao tiếp với Stockfish 17 & Maia Chess (1100-1900)
- Phân tích thế cờ thời gian thực (MultiPV, WDL, Eval Bar)
- Phân loại từng nước đi ngay khi đánh (Best / Excellent / Good / Inaccuracy / Mistake / Blunder)
- Game Review toàn trận (chạy nền kiểu job, có tiến độ) & Kiểm tra hợp lệ FEN cho Board Editor
"""
import asyncio
import json
import os
import socket
import subprocess
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import chess
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from analyzer import classify_move
from database import (
    DatabaseManager,
    create_quick_login_token,
    create_session_token,
)
from engine_manager import engine_manager
from lab_manager import LabManager
from models import (
    AppendMoveRequest,
    AuthResponse,
    ChangePasswordRequest,
    CreateMatchRequest,
    CreateUserByAdminRequest,
    FinishMatchRequest,
    JoinMatchRequest,
    LabCreateMatchRequest,
    LabCreateTournamentRequest,
    LoginRequest,
    MatchRecord,
    MatchSummaryItem,
    MatchWithDetailsResponse,
    QuickLoginRequest,
    SaveMatchReviewRequest,
    TakebackMatchRequest,
    UpdateUserByAdminRequest,
    UserRecord,
)

db_manager = DatabaseManager()


async def _match_ws_broadcast(match_id: str, event: str) -> None:
    """Adapter: LabManager phát sự kiện qua hub (kèm gợn lobby cho Sảnh/Lab)."""
    await _broadcast_match_event(match_id, event)


lab_manager = LabManager(engine_manager, db_manager, _match_ws_broadcast)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await lab_manager.start()
    yield
    await lab_manager.shutdown()
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
    before_win_percent_white: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    best_move_uci: Optional[str] = None
    best_move_san: Optional[str] = None


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


@app.get("/health")
async def health() -> Dict[str, str]:
    """Healthcheck nhẹ cho orchestrator/monitor bên ngoài (không đụng engine pool)."""
    return {"status": "ok"}


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
    if req.before_win_percent_white is not None:
        before_win_w = req.before_win_percent_white
        best_uci = req.best_move_uci
        best_san = req.best_move_san
        if best_uci and not best_san:
            try:
                best_san = board.san(chess.Move.from_uci(best_uci))
            except ValueError:
                best_san = None
    else:
        before_analysis = await engine_manager.analyze_position(
            fen=req.fen_before, depth=req.depth, multipv=1, time_limit=0.35
        )
        before_win_w = before_analysis["win_percent_white"]
        best_line = before_analysis["lines"][0] if before_analysis["lines"] else None
        best_uci = best_line["move_uci"] if best_line else None
        best_san = best_line["move_san"] if best_line else None

    board.push(move)
    fen_after = board.fen()
    after_analysis = await engine_manager.analyze_position(
        fen=fen_after, depth=req.depth, multipv=3, time_limit=0.45
    )

    cls_data = classify_move(
        win_pct_before_white=before_win_w,
        win_pct_after_white=after_analysis["win_percent_white"],
        mover_is_white=mover_is_white,
        played_uci=req.move_uci,
        best_uci=best_uci,
    )

    return {
        "move_uci": req.move_uci,
        "best_move_uci": best_uci,
        "best_move_san": best_san,
        "before_win_percent_white": before_win_w,
        "after_analysis": after_analysis,
        **cls_data,
    }


# ---------------------------------------------------------------------------
# Game Review chạy nền: POST trả về job_id ngay lập tức, client poll GET để lấy tiến độ/kết quả.
# Nhờ vậy review ván dài không khóa HTTP request và không chặn các API khác.
# ---------------------------------------------------------------------------
REVIEW_JOBS: Dict[str, Dict[str, Any]] = {}
MAX_REVIEW_JOBS = 20
MAX_CONCURRENT_REVIEWS = 2


def _cleanup_old_jobs() -> None:
    excess = len(REVIEW_JOBS) - MAX_REVIEW_JOBS
    if excess <= 0:
        return
    # Xóa các job đã hoàn tất / lỗi cũ nhất trước
    finished = [
        (job_id, job)
        for job_id, job in REVIEW_JOBS.items()
        if job["status"] in ("done", "error", "cancelled")
    ]
    for job_id, _ in finished[:excess]:
        REVIEW_JOBS.pop(job_id, None)


def _enforce_concurrent_review_limit() -> None:
    running = [
        (job_id, job)
        for job_id, job in REVIEW_JOBS.items()
        if job["status"] == "running"
    ]
    while len(running) >= MAX_CONCURRENT_REVIEWS:
        oldest_id, oldest_job = running.pop(0)
        task = oldest_job.get("task")
        if task and not task.done():
            task.cancel()
        oldest_job["status"] = "cancelled"
        oldest_job["error"] = "Đã hủy do có yêu cầu Game Review mới."


@app.post("/api/review-game")
async def review_game(req: GameReviewRequest) -> Dict[str, Any]:
    try:
        chess.Board(req.initial_fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"FEN khởi đầu không hợp lệ: {e}")
    if not req.moves_uci:
        raise HTTPException(status_code=400, detail="Danh sách nước đi trống, không thể review.")

    _enforce_concurrent_review_limit()
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
        # Progress stream qua WS topic review:{id} — client refetch GET job khi nhận.
        try:
            asyncio.get_running_loop().create_task(
                _publish_review_event(
                    job_id, {"type": "review_progress", "done": done, "total": total}
                )
            )
        except RuntimeError:
            pass  # ngoài loop (test sync) — client vẫn còn poll fallback

    try:
        result = await engine_manager.review_game(
            initial_fen=req.initial_fen,
            moves_uci=req.moves_uci,
            depth=req.depth,
            progress_cb=_report,
        )
        job["result"] = result
        job["status"] = "done"
        await _publish_review_event(job_id, {"type": "review_done"})
    except asyncio.CancelledError:
        job["status"] = "cancelled"
        job["error"] = job.get("error") or "Job review đã bị hủy."
        await _publish_review_event(job_id, {"type": "review_done"})
    except Exception as e:  # noqa: BLE001 - báo lỗi nguyên văn về cho client
        job["error"] = str(e)
        job["status"] = "error"
        await _publish_review_event(job_id, {"type": "review_done"})


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
    elif job["status"] in ("error", "cancelled"):
        resp["error"] = job["error"]
    return resp


@app.delete("/api/review-game/{job_id}")
async def cancel_review_job(job_id: str) -> Dict[str, Any]:
    job = REVIEW_JOBS.get(job_id)
    if job is None:
        return {"job_id": job_id, "status": "not_found"}
    task = job.get("task")
    if task and not task.done():
        task.cancel()
    job["status"] = "cancelled"
    job["error"] = "Đã hủy theo yêu cầu từ người dùng."
    return {"job_id": job_id, "status": "cancelled"}


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


# ==============================================================================
# AUTHENTICATION, LOBBY, MULTIPLAYER MATCHES & ADMIN API
# ==============================================================================


# ------------------------------------------------------------------------------
# P2-1 → Realtime hub: server broadcast + client subscribe theo topic.
# 1 kết nối WS duy nhất (/api/ws) cho toàn app: match:{id} | lobby | review:{id}.
# Server push event nhẹ (notify), client refetch REST — nguồn truth vẫn HTTP.
# Endpoint cũ /api/ws/matches/{id} giữ làm tương thích (auto-subscribe match:{id}).
# ------------------------------------------------------------------------------
class TopicHub:
    """
    Fan-out event theo topic (in-memory, gắn với 1 process — đủ cho 20-50 user;
    khi cần multi-worker, thay chỗ publish bằng Redis pub/sub adapter).
    """

    def __init__(self) -> None:
        self._topics: Dict[str, Any] = {}

    async def register(self, websocket: WebSocket) -> None:
        await websocket.accept()

    def subscribe(self, topic: str, websocket: WebSocket) -> None:
        self._topics.setdefault(topic, set()).add(websocket)

    def unsubscribe(self, topic: str, websocket: WebSocket) -> None:
        subs = self._topics.get(topic)
        if subs is None:
            return
        subs.discard(websocket)
        if not subs:
            self._topics.pop(topic, None)

    def disconnect(self, websocket: WebSocket) -> None:
        for topic in list(self._topics):
            self.unsubscribe(topic, websocket)

    async def publish(self, topic: str, payload: Dict[str, Any]) -> None:
        for websocket in list(self._topics.get(topic, ())):
            try:
                await websocket.send_json(payload)
            except Exception:
                self.unsubscribe(topic, websocket)

    # --- Tương thích ngược với MatchConnectionManager cũ ---
    async def connect(self, match_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.subscribe(f"match:{match_id}", websocket)

    def disconnect_match(self, match_id: str, websocket: WebSocket) -> None:
        self.unsubscribe(f"match:{match_id}", websocket)

    async def broadcast(self, match_id: str, payload: Dict[str, Any]) -> None:
        await self.publish(f"match:{match_id}", payload)


#: Topic được phép subscribe — chặn topic tùy tiện làm phình bộ nhớ hub.
_ALLOWED_TOPIC_PREFIXES = ("match:", "review:")
_ALLOWED_TOPICS = {"lobby"}


def _topic_allowed(topic: str) -> bool:
    return topic in _ALLOWED_TOPICS or any(
        topic.startswith(p) and len(topic) > len(p) for p in _ALLOWED_TOPIC_PREFIXES
    )


topic_hub = TopicHub()


async def _broadcast_match_event(match_id: str, event: str) -> None:
    """Phát sự kiện nhẹ cho topic trận + gợn sóng sang topic lobby (Sảnh refetch)."""
    try:
        await topic_hub.publish(
            f"match:{match_id}",
            {"topic": f"match:{match_id}", "type": event, "match_id": match_id},
        )
    except Exception:  # noqa: BLE001 - broadcast không được làm hỏng request chính
        pass
    await _publish_lobby_event(reason="move" if event == "match_updated" else event)


_lobby_last_publish = 0.0


async def _publish_lobby_event(reason: str) -> None:
    """
    Báo topic `lobby` có thay đổi (Sảnh/Phòng Lab refetch danh sách).
    Event nước đi bị throttle 1s (Lab chạy nền đi nước liên tục); event quan trọng
    (tạo/kết thúc/abort trận) luôn phát để không bao giờ bị bỏ lỡ.
    """
    global _lobby_last_publish
    now = time.monotonic()
    if reason == "move" and now - _lobby_last_publish < 1.0:
        return
    _lobby_last_publish = now
    try:
        await topic_hub.publish(
            "lobby", {"topic": "lobby", "type": "lobby_updated", "reason": reason}
        )
    except Exception:  # noqa: BLE001
        pass


async def _publish_review_event(job_id: str, payload: Dict[str, Any]) -> None:
    try:
        await topic_hub.publish(
            f"review:{job_id}", {"topic": f"review:{job_id}", **payload}
        )
    except Exception:  # noqa: BLE001
        pass


@app.websocket("/api/ws")
async def ws_app_channel(
    websocket: WebSocket,
    token: Optional[str] = None,
) -> None:
    """
    Kênh realtime duy nhất của app (server broadcast + client subscribe).
    Client gửi `?token=<session token>` để xác thực, sau đó giao tiếp:
      - "ping"                                    → {"type":"pong"} (heartbeat)
      - {"action":"subscribe","topic":"match:x"}  → topic hợp lệ: match:<id> | lobby | review:<id>
      - {"action":"unsubscribe","topic":"..."}
    Server push {"topic":..., "type":"lobby_updated" | "match_updated" | ..., ...};
    client nhận event thì refetch REST tương ứng (notify + refetch).
    """
    if not token:
        await websocket.close(code=4401)
        return
    user = db_manager.verify_token_and_get_user(token, expected_purpose="session")
    if not user:
        await websocket.close(code=4401)
        return

    await topic_hub.register(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            try:
                data = json.loads(message)
                action = data.get("action")
                topic = data.get("topic", "")
                if not isinstance(topic, str) or not _topic_allowed(topic):
                    await websocket.send_json(
                        {"type": "error", "detail": f"Topic không hợp lệ: {topic}"}
                    )
                    continue
                if action == "subscribe":
                    topic_hub.subscribe(topic, websocket)
                    await websocket.send_json({"type": "subscribed", "topic": topic})
                elif action == "unsubscribe":
                    topic_hub.unsubscribe(topic, websocket)
            except (ValueError, TypeError):
                # Frame không phải JSON hợp lệ — bỏ qua, giữ kết nối sống
                continue
    except WebSocketDisconnect:
        pass
    finally:
        topic_hub.disconnect(websocket)


@app.websocket("/api/ws/matches/{match_id}")
async def ws_match_channel(
    websocket: WebSocket,
    match_id: str,
    token: Optional[str] = None,
) -> None:
    """
    [Tương thích ngược] Kênh realtime của 1 ván đấu — tự subscribe topic
    `match:{match_id}` trên hub chung. Client mới dùng /api/ws + subscribe.
    """
    if not token:
        await websocket.close(code=4401)
        return
    user = db_manager.verify_token_and_get_user(token, expected_purpose="session")
    if not user:
        await websocket.close(code=4401)
        return
    if not db_manager.get_match_record(match_id):
        await websocket.close(code=4404)
        return

    await topic_hub.connect(match_id, websocket)
    try:
        while True:
            # Chỉ nhận heartbeat từ client; mọi dữ liệu authority đều đi qua REST API.
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        topic_hub.disconnect_match(match_id, websocket)


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> UserRecord:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập hoặc thiếu Bearer token.")
    user = db_manager.verify_token_and_get_user(token, expected_purpose="session")
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Phiên đăng nhập không hợp lệ, đã hết hạn hoặc đã bị thu hồi.",
        )
    return user


def _require_match_participant(match_id: str, user: UserRecord) -> None:
    """
    Kiểm tra Broken Access Control (chống IDOR):
    chỉ kỳ thủ đang tham gia ván đấu (hoặc Admin) mới được thao tác sửa đổi ván.
    """
    match = db_manager.get_match_record(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Không tìm thấy trận đấu.")
    if user.role == "admin":
        return
    if user.id not in (match.white_user_id, match.black_user_id):
        raise HTTPException(
            status_code=403,
            detail="Chỉ kỳ thủ đang tham gia ván đấu hoặc Admin mới được thực hiện thao tác này.",
        )


def get_current_admin(user: UserRecord = Depends(get_current_user)) -> UserRecord:
    if user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ tài khoản Quản trị viên (Admin) mới có quyền truy cập chức năng này.",
        )
    return user


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest) -> AuthResponse:
    user = db_manager.authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.",
        )
    token = create_session_token(user)
    return AuthResponse(token=token, user=user)


@app.post("/api/auth/quick-login", response_model=AuthResponse)
async def quick_login(req: QuickLoginRequest) -> AuthResponse:
    user = db_manager.verify_token_and_get_user(
        req.login_token.strip(), expected_purpose="quick_login"
    )
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Quick-Link đăng nhập không hợp lệ, đã hết hạn hoặc đã bị thu hồi.",
        )
    session_token = create_session_token(user)
    return AuthResponse(token=session_token, user=user)


@app.get("/api/auth/me", response_model=UserRecord)
async def auth_me(user: UserRecord = Depends(get_current_user)) -> UserRecord:
    return user


@app.post("/api/auth/change-password", response_model=AuthResponse)
async def change_password(
    req: ChangePasswordRequest,
    user: UserRecord = Depends(get_current_user),
) -> AuthResponse:
    updated = db_manager.change_own_password(
        user.id, req.new_password, req.display_name
    )
    new_token = create_session_token(updated)
    return AuthResponse(token=new_token, user=updated)


@app.get("/api/lobby")
async def get_lobby(
    step_exhibition: bool = True,
    user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Trả về dữ liệu Sảnh chính (Home Screen):
    - `waiting_matches`: Các phòng đang chờ bạn bè vào đấu (`waiting`).
    - `live_matches`: Danh sách các trận đang diễn ra (`playing`).
    - `featured_match`: Trận tiêu điểm đang stream trực tiếp (ưu tiên trận của người chơi;
      nếu không có trận nào của người chơi đang diễn ra thì tự động tạo/đi tiếp trận AI vs AI gần Elo người xem).
    - `my_history`: Lịch sử các ván đã kết thúc của người dùng hiện tại.
    - `ai_history`: Lịch sử các ván AI (cả hai bên bot) đã kết thúc.
    - `club_history`: Lịch sử các ván đã kết thúc của toàn câu lạc bộ.
    - `bots`: Danh sách các tài khoản Bot AI để tạo trận.
    - `stats`: Chỉ số tổng quan của hệ thống.
    """
    waiting = db_manager.list_match_summaries(statuses=["waiting"], limit=20)
    live = db_manager.list_match_summaries(statuses=["playing"], limit=20)

    human_live = [m for m in live if not m.is_system_exhibition]
    featured: Optional[MatchSummaryItem] = None

    if human_live:
        # Ưu tiên trận mà chính user đang tham gia, nếu không thì lấy trận mới nhất của người chơi
        my_live = [
            m
            for m in human_live
            if m.match.white_user_id == user.id or m.match.black_user_id == user.id
        ]
        featured = my_live[0] if my_live else human_live[0]
    else:
        # Trận biểu diễn AI vs AI do LabManager chạy nền bằng engine thật
        # (`step_exhibition=false` chỉ đọc, không tạo trận mới — dùng trong test).
        if step_exhibition:
            featured = await lab_manager.ensure_exhibition(viewer_elo=user.rating)
            live = db_manager.list_match_summaries(statuses=["playing"], limit=20)
        elif live:
            featured = live[0]

    my_history = db_manager.list_match_summaries(
        statuses=["finished"], user_id=user.id, limit=25
    )
    # Lịch sử toàn sảnh (ưu tiên các trận có ít nhất 1 người thật)
    all_finished = db_manager.list_match_summaries(statuses=["finished"], limit=40)
    club_history = [m for m in all_finished if not m.is_system_exhibition][:25]
    # Lịch sử riêng cho các ván AI (cả hai bên bot: vs_ai bot-vs-bot + Lab)
    ai_history = db_manager.list_match_summaries(
        statuses=["finished"], both_bots=True, limit=25
    )

    all_users = db_manager.list_users(include_bots=True)
    bots = [u for u in all_users if u.is_bot]
    human_players = [u for u in all_users if not u.is_bot and u.is_active]

    # Phân loại presence + sort ỔN ĐỊNH cho danh sách Kỳ thủ trên Sảnh.
    # Trước đây sort theo last_seen_at — trường này bị cập nhật ở MỌI request
    # (verify token) nên thứ tự nhảy liên tục mỗi lần lobby refetch.
    # Giờ: Đang đấu > Phòng chờ > Trực tuyến (5 phút) > Ngoại tuyến,
    # trong nhóm xếp theo Elo giảm dần (tie-break username) — không phụ thuộc
    # trường nào volatile.
    playing_ids = {
        uid
        for m in human_live
        for uid in (m.match.white_user_id, m.match.black_user_id)
        if uid
    }
    waiting_ids = {
        uid
        for w in waiting
        for uid in (w.match.white_user_id, w.match.black_user_id)
        if uid
    }
    now_ts = time.time()

    def _presence_rank(u) -> int:  # 0 = hoạt động nhất
        if u.id in playing_ids:
            return 0
        if u.id in waiting_ids:
            return 1
        if u.last_seen_at:
            try:
                seen = datetime.fromisoformat(u.last_seen_at).timestamp()
                if now_ts - seen <= 5 * 60:
                    return 2
            except ValueError:
                pass
        return 3

    human_players.sort(key=lambda u: (_presence_rank(u), -u.rating, u.username))

    return {
        "waiting_matches": waiting,
        "live_matches": live,
        "featured_match": featured,
        "my_history": my_history,
        "ai_history": ai_history,
        "club_history": club_history,
        "online_players": human_players,
        "bots": bots,
        "stats": db_manager.get_system_stats(),
    }


@app.get("/api/users/{target_user_id}/profile")
async def get_user_profile_endpoint(
    target_user_id: str,
    user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    target = db_manager.get_user_by_id(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ thủ.")
    recent_matches = db_manager.list_match_summaries(
        statuses=["playing", "waiting", "finished"],
        user_id=target_user_id,
        limit=15,
    )
    return {
        "user": target,
        "recent_matches": recent_matches,
    }


@app.post("/api/matches", response_model=MatchWithDetailsResponse)
async def create_match_endpoint(
    req: CreateMatchRequest,
    user: UserRecord = Depends(get_current_user),
) -> MatchWithDetailsResponse:
    try:
        created = db_manager.create_match(req)
        details = db_manager.get_match_with_details(created.id)
        assert details is not None
        await _publish_lobby_event(reason="match_created")
        return details
    except (KeyError, ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/matches/join", response_model=MatchWithDetailsResponse)
async def join_match_endpoint(
    req: JoinMatchRequest,
    user: UserRecord = Depends(get_current_user),
) -> MatchWithDetailsResponse:
    try:
        joined = db_manager.join_waiting_match(req.room_code_or_id, user.id)
        details = db_manager.get_match_with_details(joined.id)
        assert details is not None
        await _broadcast_match_event(joined.id, "match_updated")
        return details
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Phòng Lab: tổ chức trận AI vs AI & giải round-robin (LabManager chạy nền)
# ---------------------------------------------------------------------------


@app.post("/api/lab/matches")
async def create_lab_match_endpoint(
    req: LabCreateMatchRequest,
    user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        return await lab_manager.create_match(req)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/lab/matches")
async def list_lab_matches_endpoint(
    user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    return lab_manager.list_matches()


@app.post("/api/lab/tournaments")
async def create_lab_tournament_endpoint(
    req: LabCreateTournamentRequest,
    user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        created = await lab_manager.create_tournament(req, creator_user_id=user.id)
        await _publish_lobby_event(reason="lab_tournament_created")
        return created
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/lab/tournaments")
async def list_lab_tournaments_endpoint(
    user: UserRecord = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    return lab_manager.list_tournaments()


@app.get("/api/lab/tournaments/{tournament_id}")
async def get_lab_tournament_endpoint(
    tournament_id: str,
    user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        return lab_manager.get_tournament(tournament_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/matches/{match_id}", response_model=MatchWithDetailsResponse)
async def get_match_endpoint(
    match_id: str,
    user: UserRecord = Depends(get_current_user),
) -> MatchWithDetailsResponse:
    # Trận AI vs AI (Lab/exhibition) được LabManager đẩy nước trong task nền và
    # broadcast WS riêng — GET chỉ thuần đọc.
    details = db_manager.get_match_with_details(match_id)
    if not details:
        raise HTTPException(status_code=404, detail="Không tìm thấy trận đấu.")
    return details


@app.post("/api/matches/{match_id}/move", response_model=MatchWithDetailsResponse)
async def append_match_move_endpoint(
    match_id: str,
    req: AppendMoveRequest,
    user: UserRecord = Depends(get_current_user),
) -> MatchWithDetailsResponse:
    _require_match_participant(match_id, user)
    if req.player_user_id != user.id:
        # Chỉ được phép đi nước thay cho bên Bot AI trong ván đấu này (bot không tự gọi API).
        proxy = db_manager.get_user_by_id(req.player_user_id)
        match = db_manager.get_match_record(match_id)
        if match is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy trận đấu.")
        is_match_bot = proxy is not None and proxy.is_bot and proxy.id in (
            match.white_user_id,
            match.black_user_id,
        )
        if user.role != "admin" and not is_match_bot:
            raise HTTPException(
                status_code=403,
                detail="Không được mạo danh kỳ thủ khác để đi nước.",
            )
    try:
        detail = db_manager.append_move(match_id, req)
        board = chess.Board(detail.fen_after)
        if board.is_game_over():
            res = board.result()
            if res in ("1-0", "0-1", "1/2-1/2"):
                term = (
                    "checkmate"
                    if board.is_checkmate()
                    else "stalemate"
                    if board.is_stalemate()
                    else "insufficient"
                    if board.is_insufficient_material()
                    else "threefold"
                    if board.is_repetition(3)
                    else "draw"
                )
                db_manager.complete_match(match_id, result=res, termination=term)
        details = db_manager.get_match_with_details(match_id)
        assert details is not None
        await _broadcast_match_event(match_id, "match_updated")
        return details
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/matches/{match_id}/takeback", response_model=MatchWithDetailsResponse)
async def takeback_match_endpoint(
    match_id: str,
    req: TakebackMatchRequest,
    user: UserRecord = Depends(get_current_user),
) -> MatchWithDetailsResponse:
    _require_match_participant(match_id, user)
    try:
        db_manager.takeback_to_ply(match_id, req.target_ply)
        details = db_manager.get_match_with_details(match_id)
        assert details is not None
        await _broadcast_match_event(match_id, "match_updated")
        return details
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/matches/{match_id}/finish", response_model=MatchWithDetailsResponse)
async def finish_match_endpoint(
    match_id: str,
    req: FinishMatchRequest,
    user: UserRecord = Depends(get_current_user),
) -> MatchWithDetailsResponse:
    _require_match_participant(match_id, user)
    try:
        db_manager.complete_match(match_id, result=req.result, termination=req.termination)
        details = db_manager.get_match_with_details(match_id)
        assert details is not None
        await _broadcast_match_event(match_id, "match_finished")
        return details
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/matches/{match_id}/save-review", response_model=MatchRecord)
async def save_match_review_endpoint(
    match_id: str,
    req: SaveMatchReviewRequest,
    user: UserRecord = Depends(get_current_user),
) -> MatchRecord:
    try:
        return db_manager.save_match_review(
            match_id=match_id,
            white_accuracy=req.white_accuracy,
            black_accuracy=req.black_accuracy,
            review_summary=req.review_summary,
            ply_evaluations=req.ply_evaluations,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ------------------------------------------------------------------------------
# ADMIN ENDPOINTS (Yêu cầu role == 'admin')
# ------------------------------------------------------------------------------


def get_lan_ip() -> str:
    """
    Tự động phát hiện địa chỉ IPv4 LAN thực của máy chủ (ưu tiên 192.168.x.x / 10.x.x.x)
    để tạo đường dẫn Quick-Link chia sẻ cho các máy khác trong mạng nội bộ.
    Có thể ghi đè qua biến môi trường `THECHESS_LAN_IP`.
    """
    env_ip = os.environ.get("THECHESS_LAN_IP", "").strip()
    if env_ip:
        return env_ip

    candidates: List[str] = []

    # Cách 1: Kiểm tra qua bảng định tuyến UDP socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                candidates.append(ip)
    except Exception:
        pass

    # Cách 2: Lấy danh sách IPv4 qua `hostname -I` trên Linux
    try:
        out = subprocess.check_output(["hostname", "-I"], text=True, timeout=1.0)
        for token in out.split():
            if "." in token and not token.startswith("127."):
                if token not in candidates:
                    candidates.append(token)
    except Exception:
        pass

    # Ưu tiên dải mạng LAN vật lý phổ biến (192.168.* hoặc 10.*), tránh cầu ảo docker0 (172.17.*)
    for ip in candidates:
        if ip.startswith("192.168.") or ip.startswith("10."):
            return ip
    for ip in candidates:
        if not ip.startswith("172.17."):
            return ip
    return candidates[0] if candidates else "127.0.0.1"


@app.get("/api/admin/overview")
async def admin_overview(
    admin: UserRecord = Depends(get_current_admin),
) -> Dict[str, Any]:
    users = db_manager.list_users(include_bots=True)
    active_matches = db_manager.list_match_summaries(
        statuses=["waiting", "setup", "playing"], limit=50
    )
    return {
        "stats": db_manager.get_system_stats(),
        "users": users,
        "active_matches": active_matches,
        "lan_ip": get_lan_ip(),
    }


@app.post("/api/admin/users")
async def admin_create_user(
    req: CreateUserByAdminRequest,
    admin: UserRecord = Depends(get_current_admin),
) -> Dict[str, Any]:
    try:
        created = db_manager.create_user_by_admin(admin.id, req)
        quick_token = create_quick_login_token(created)
        return {
            "user": created,
            "quick_login_token": quick_token,
            "initial_password": req.password,
            "lan_ip": get_lan_ip(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không tạo được tài khoản: {e}")


@app.patch("/api/admin/users/{target_user_id}", response_model=UserRecord)
async def admin_update_user(
    target_user_id: str,
    req: UpdateUserByAdminRequest,
    admin: UserRecord = Depends(get_current_admin),
) -> UserRecord:
    try:
        return db_manager.update_user_by_admin(admin.id, target_user_id, req)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/users/{target_user_id}/quick-link")
async def admin_generate_quick_link(
    target_user_id: str,
    admin: UserRecord = Depends(get_current_admin),
) -> Dict[str, Any]:
    target = db_manager.get_user_by_id(target_user_id)
    if not target or target.is_bot:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản người thật.")
    quick_token = create_quick_login_token(target)
    return {
        "user": target,
        "quick_login_token": quick_token,
        "lan_ip": get_lan_ip(),
    }


@app.post("/api/admin/users/{target_user_id}/revoke", response_model=UserRecord)
async def admin_revoke_user(
    target_user_id: str,
    deactivate: bool = False,
    admin: UserRecord = Depends(get_current_admin),
) -> UserRecord:
    try:
        return db_manager.revoke_user_sessions(
            admin.id, target_user_id, deactivate=deactivate
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/admin/matches/{match_id}/abort", response_model=MatchRecord)
async def admin_abort_match(
    match_id: str,
    admin: UserRecord = Depends(get_current_admin),
) -> MatchRecord:
    try:
        aborted = db_manager.abort_match_by_admin(admin.id, match_id)
        await _broadcast_match_event(match_id, "match_finished")
        await _publish_lobby_event(reason="match_aborted")
        return aborted
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

