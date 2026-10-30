"""
Phòng Lab — tổ chức trận AI vs AI và giải round-robin giữa các bot.

Module này là chủ sở hữu duy nhất của vòng đời trận AI-vs-AI (bao gồm cả trận
biểu diễn hệ thống ở Sảnh): tạo trận, chạy nước bằng engine thật (Maia Lc0 /
Stockfish) trong task nền, phát WS event từng nước, kết thúc & chấm kết quả,
tiếp tục trận dở sau khi restart server.

Interface (nhỏ — mọi phức tạp nằm bên trong):
- start() / shutdown()          : gắn vào lifespan app (resume + dọn task)
- create_match(req)             : tạo 1 trận AI vs AI và chạy nền đến hết ván
- create_tournament(req, ...)   : tạo giải round-robin, các trận chơi tuần tự
- ensure_exhibition(viewer_elo) : đảm bảo Sảnh luôn có 1 trận bot-vs-bot live
- list_matches() / list_tournaments() / get_tournament(id) : đọc danh sách

Nhịp đi nước: mỗi nước = thời gian engine suy nghĩ + phần bù trừ để tổng
trung bình 1-3s, tối thiểu `min_move_sec` (mặc định 0.5s). Override qua env
THECHESS_LAB_PACING="1.0,3.0" / THECHESS_LAB_MIN_MOVE="0.5" (test đặt =0).
"""
from __future__ import annotations

import asyncio
import os
import random
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional

import chess

from database import DatabaseManager
from engine_manager import EngineManager
from models import (
    AppendMoveRequest,
    LabCreateMatchRequest,
    LabCreateTournamentRequest,
    CreateMatchRequest,
    MatchSummaryItem,
    STARTING_FEN,
)

# Kiểu callback phát WS event cho người đang xem (main.py inject match_ws_manager).
BroadcastFn = Callable[[str, str], Awaitable[None]]

MAIA_BOT_ELOS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
#: Số nước tối đa mỗi trận Lab (chống ván vô hạn giữa 2 engine ngang sức).
MAX_PLIES = 300


def _env_floats(name: str, default: List[float]) -> List[float]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return [max(0.0, float(x)) for x in raw.split(",")]
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.environ.get(name, "").strip() or default))
    except ValueError:
        return default


def build_round_robin(bot_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Lịch đấu vòng tròn 1 lượt (thuật toán circle-method).

    Với số người lẻ, mỗi vòng có 1 người được nghỉ (bye). Trả về danh sách
    slot: {round, white_bot_id, black_bot_id, match_id, result} — xen kẽ màu
    qua các vòng để phân công Trắng/Đen công bằng.
    """
    players: List[Optional[str]] = list(bot_ids)
    if len(players) % 2 == 1:
        players.append(None)
    n = len(players)
    schedule: List[Dict[str, Any]] = []
    for r in range(n - 1):
        for i in range(n // 2):
            a = players[i]
            b = players[n - 1 - i]
            if a is None or b is None:
                continue
            w, bl = (a, b) if (r + i) % 2 == 0 else (b, a)
            schedule.append(
                {
                    "round": r + 1,
                    "white_bot_id": w,
                    "black_bot_id": bl,
                    "match_id": None,
                    "result": None,
                }
            )
        # Xoay vòng: giữ vị trí 0, dịch phần còn lại sang phải 1 bước.
        players = [players[0], players[-1]] + players[1:-1]
    return schedule


def compute_standings(
    participants: List[Dict[str, Any]], schedule: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Bảng xếp hạng giải từ kết quả các slot trong schedule (thắng 1, hòa 0.5).
    `result` theo góc nhìn Trắng ('1-0' | '0-1' | '1/2-1/2'); slot chưa đấu
    (result None) bỏ qua. Sắp xếp theo điểm giảm dần.
    """
    table: Dict[str, Dict[str, Any]] = {
        p["bot_id"]: {
            "bot_id": p["bot_id"],
            "label": p["label"],
            "games": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "points": 0.0,
        }
        for p in participants
    }
    for slot in schedule:
        result = slot.get("result")
        if result not in ("1-0", "0-1", "1/2-1/2"):
            continue
        w = table.get(slot["white_bot_id"])
        b = table.get(slot["black_bot_id"])
        if not w or not b:
            continue
        w["games"] += 1
        b["games"] += 1
        if result == "1-0":
            w["wins"] += 1
            b["losses"] += 1
            w["points"] += 1.0
        elif result == "0-1":
            b["wins"] += 1
            w["losses"] += 1
            b["points"] += 1.0
        else:
            w["draws"] += 1
            b["draws"] += 1
            w["points"] += 0.5
            b["points"] += 0.5
    return sorted(table.values(), key=lambda r: (-r["points"], -r["wins"], r["label"]))


class LabManager:
    """Điều phối trận AI vs AI: engine thật + DB + WS broadcast + resume."""

    def __init__(
        self,
        engine_mgr: EngineManager,
        db: DatabaseManager,
        broadcast: BroadcastFn,
    ) -> None:
        self._engine = engine_mgr
        self._db = db
        self._broadcast = broadcast
        self._pacing = _env_floats("THECHESS_LAB_PACING", [1.0, 3.0])
        self._min_move_sec = _env_float("THECHESS_LAB_MIN_MOVE", 0.5)
        # Task nền theo match_id / tournament_id — chống spawn trùng.
        self._tasks: Dict[str, asyncio.Task] = {}

    # ------------------------------------------------------------------
    # Vòng đời app
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Resume mọi trận AI-vs-AI dở dang + giải đang chạy (sau restart server)."""
        live = self._db.list_match_summaries(statuses=["playing"], limit=50)
        for item in live:
            if item.is_system_exhibition:
                self._spawn(item.match.id, self._run_match(item.match.id))
        for t in self._db.list_lab_tournaments():
            if t["status"] == "running":
                self._spawn(t["id"], self._run_tournament(t["id"]))

    async def shutdown(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        self._tasks.clear()

    def _spawn(self, key: str, coro) -> None:
        existing = self._tasks.get(key)
        if existing is not None and not existing.done():
            return
        self._tasks[key] = asyncio.get_running_loop().create_task(coro)

    # ------------------------------------------------------------------
    # Tạo trận / tạo giải
    # ------------------------------------------------------------------

    async def create_match(self, req: LabCreateMatchRequest) -> Dict[str, Any]:
        """Tạo 1 trận AI vs AI (unrated) và chạy nền đến khi kết thúc."""
        match = self._db.create_match(
            CreateMatchRequest(
                mode="vs_ai",
                status="playing",
                is_rated=False,
                white_user_id=self._require_bot(req.white_bot_id).id,
                black_user_id=self._require_bot(req.black_bot_id).id,
                time_control_type=req.time_control_type,
                initial_time_ms=req.initial_time_ms,
                increment_ms=req.increment_ms,
                initial_fen=req.initial_fen,
                generate_room_code=False,
            )
        )
        self._spawn(match.id, self._run_match(match.id))
        details = self._db.get_match_with_details(match.id)
        assert details is not None
        return details.model_dump()

    async def create_tournament(
        self, req: LabCreateTournamentRequest, creator_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Tạo giải round-robin giữa các bot đã chọn. Các trận được tạo & chơi
        TUẦN TỰ theo lịch (1 trận live tại 1 thời điểm — nhẹ cho engine pool).
        """
        if len(set(req.bot_ids)) < 2:
            raise ValueError("Giải cần ít nhất 2 bot khác nhau.")

        participants: List[Dict[str, Any]] = []
        for bot_id in dict.fromkeys(req.bot_ids):  # giữ thứ tự, bỏ trùng
            bot = self._require_bot(bot_id)
            participants.append(
                {
                    "bot_id": bot.id,
                    "username": bot.username,
                    "label": bot.display_name or bot.username,
                    "engine": bot.bot_engine,
                    "elo": bot.bot_default_elo,
                }
            )
        schedule = build_round_robin([p["bot_id"] for p in participants])

        rec = self._db.create_lab_tournament(
            tid=str(uuid.uuid4()),
            name=req.name,
            participants=participants,
            schedule=schedule,
            created_by_user_id=creator_user_id,
        )
        self._spawn(rec["id"], self._run_tournament(rec["id"]))
        return self.get_tournament(rec["id"])

    async def ensure_exhibition(self, viewer_elo: int = 1500) -> Optional[MatchSummaryItem]:
        """
        Sảnh luôn có ít nhất 1 trận bot-vs-bot đang live (không còn ai đang đấu).
        Trận cũ đã có thì dùng lại — runner nền tự đi tiếp nước.
        """
        existing = self._db.find_live_bot_match()
        if existing is not None:
            return existing

        nearest_w = min(MAIA_BOT_ELOS, key=lambda e: abs(e - viewer_elo))
        candidates_b = [e for e in MAIA_BOT_ELOS if e != nearest_w]
        nearest_b = min(candidates_b, key=lambda e: abs(e - (viewer_elo + 100)))
        w_bot = self._db.get_user_by_username(f"bot_maia_{nearest_w}")
        b_bot = self._db.get_user_by_username(f"bot_maia_{nearest_b}")
        assert w_bot is not None and b_bot is not None

        self._db.create_match(
            CreateMatchRequest(
                mode="vs_ai",
                status="playing",
                is_rated=False,
                white_user_id=w_bot.id,
                black_user_id=b_bot.id,
                time_control_type="rapid",
                initial_time_ms=600_000,
                increment_ms=5_000,
                initial_fen=STARTING_FEN,
                generate_room_code=True,
            )
        )
        self._spawn_last_live_bot_match()
        refreshed = self._db.find_live_bot_match()
        return refreshed

    def _spawn_last_live_bot_match(self) -> None:
        item = self._db.find_live_bot_match()
        if item is not None:
            self._spawn(item.match.id, self._run_match(item.match.id))

    def _require_bot(self, bot_id_or_username: str):
        bot = self._db.get_user_by_id(bot_id_or_username) or self._db.get_user_by_username(
            bot_id_or_username
        )
        if bot is None or not bot.is_bot:
            raise KeyError(f"'{bot_id_or_username}' không phải tài khoản Bot AI.")
        return bot

    # ------------------------------------------------------------------
    # Đọc danh sách
    # ------------------------------------------------------------------

    def list_matches(self, limit: int = 30) -> Dict[str, Any]:
        """Trận AI vs AI: đang live + đã kết thúc gần đây (cho màn Lab)."""
        live = [
            item
            for item in self._db.list_match_summaries(statuses=["playing"], limit=limit)
            if item.is_system_exhibition
        ]
        recent = [
            item
            for item in self._db.list_match_summaries(statuses=["finished"], limit=limit)
            if item.is_system_exhibition
        ]
        return {
            "live": [self._summary_out(i) for i in live],
            "recent": [self._summary_out(i) for i in recent],
        }

    @staticmethod
    def _summary_out(item: MatchSummaryItem) -> Dict[str, Any]:
        return {
            "match": item.match.model_dump(),
            "white_player": item.white_player.model_dump(),
            "black_player": item.black_player.model_dump(),
        }

    def list_tournaments(self, limit: int = 20) -> List[Dict[str, Any]]:
        return [self._tournament_out(t) for t in self._db.list_lab_tournaments(limit)]

    def get_tournament(self, tid: str) -> Dict[str, Any]:
        rec = self._db.get_lab_tournament(tid)
        if rec is None:
            raise KeyError(f"Không tìm thấy giải Lab id={tid}")
        return self._tournament_out(rec)

    def _tournament_out(self, rec: Dict[str, Any]) -> Dict[str, Any]:
        # Đồng bộ kết quả đã đấu vào schedule rồi tính standings.
        schedule = []
        for slot in rec["schedule"]:
            slot = dict(slot)
            if slot.get("match_id"):
                m = self._db.get_match_record(slot["match_id"])
                if m is not None:
                    slot["status"] = m.status
                    if m.status == "finished" and m.result in ("1-0", "0-1", "1/2-1/2"):
                        slot["result"] = m.result
            schedule.append(slot)
        return {
            "id": rec["id"],
            "name": rec["name"],
            "status": rec["status"],
            "participants": rec["participants"],
            "schedule": schedule,
            "standings": compute_standings(rec["participants"], schedule),
            "created_at": rec["created_at"],
            "finished_at": rec["finished_at"],
        }

    # ------------------------------------------------------------------
    # Runner nền
    # ------------------------------------------------------------------

    async def _run_match(self, match_id: str) -> None:
        """Chơi ván đến hết: mỗi nước 1 lượt engine thật + pacing, broadcast WS."""
        try:
            while True:
                m = self._db.get_match_record(match_id)
                if m is None or m.status != "playing":
                    return

                board = chess.Board(m.current_fen)
                if board.is_game_over():
                    self._finish_board(match_id, board)
                    return
                if m.total_plies >= MAX_PLIES:
                    self._db.complete_match(match_id, result="1/2-1/2", termination="ply_limit")
                    await self._emit(match_id, "match_finished")
                    return

                mover = (
                    self._db.get_user_by_id(m.white_user_id)
                    if board.turn == chess.WHITE
                    else self._db.get_user_by_id(m.black_user_id)
                )
                if mover is None or not mover.is_bot:
                    return  # người ở bên nào đó đã tự đi tiếp (trận vs AI) — dừng can thiệp

                t0 = time.monotonic()
                try:
                    res = await self._engine.get_ai_move(
                        m.current_fen,
                        mover.bot_engine or "maia",
                        mover.bot_default_elo or 1500,
                    )
                except ValueError:
                    # Ván đã kết thúc ở thế cờ này (engine từ chối) — chấm & thoát.
                    self._finish_board(match_id, board)
                    return
                elapsed = time.monotonic() - t0

                move = chess.Move.from_uci(res["move_uci"])
                mover_is_white = board.turn == chess.WHITE
                board.push(move)
                est_cp, est_win = self._db._estimate_board_eval(board)

                spent_ms = max(50, int(elapsed * 1000))
                clock_after: Optional[int] = None
                if m.time_control_type != "untimed":
                    prev = (
                        m.white_clock_ms if mover_is_white else m.black_clock_ms
                    ) or (m.initial_time_ms or 600_000)
                    clock_after = prev - spent_ms + m.increment_ms
                    if clock_after <= 0:
                        # Hết thời gian — bên còn lại thắng.
                        winner_result = "0-1" if mover_is_white else "1-0"
                        self._db.complete_match(
                            match_id, result=winner_result, termination="timeout"
                        )
                        await self._emit(match_id, "match_finished")
                        return

                self._db.append_move(
                    match_id,
                    AppendMoveRequest(
                        player_user_id=mover.id,
                        uci=res["move_uci"],
                        time_spent_ms=spent_ms,
                        clock_after_ms=clock_after,
                        cp=est_cp,
                        win_percent_white=est_win,
                    ),
                )

                if board.is_game_over():
                    self._finish_board(match_id, board)
                    await self._emit(match_id, "match_finished")
                    return

                await self._emit(match_id, "match_updated")
                # Nhịp: bù sao cho tổng mỗi nước ~ pacing (1-3s), tối thiểu min_move_sec.
                await asyncio.sleep(
                    max(self._min_move_sec, random.uniform(*self._pacing) - elapsed)
                )
        finally:
            self._tasks.pop(match_id, None)

    async def _run_tournament(self, tid: str) -> None:
        """Chơi tuần tự từng slot trong lịch; xong đánh dấu giải finished."""
        try:
            rec = self._db.get_lab_tournament(tid)
            if rec is None or rec["status"] != "running":
                return
            schedule = rec["schedule"]
            changed = False
            for slot in schedule:
                if slot.get("result") is not None:
                    continue
                if slot.get("match_id"):
                    m = self._db.get_match_record(slot["match_id"])
                    if m is not None and m.status == "finished":
                        slot["result"] = m.result
                        changed = True
                        continue
                else:
                    match = self._db.create_match(
                        CreateMatchRequest(
                            mode="vs_ai",
                            status="playing",
                            is_rated=False,
                            white_user_id=slot["white_bot_id"],
                            black_user_id=slot["black_bot_id"],
                            time_control_type="rapid",
                            initial_time_ms=600_000,
                            increment_ms=5_000,
                            initial_fen=STARTING_FEN,
                            generate_room_code=False,
                        )
                    )
                    slot["match_id"] = match.id
                    changed = True
                    self._db.update_lab_tournament(tid, schedule=schedule)

                await self._run_match(slot["match_id"])
                m = self._db.get_match_record(slot["match_id"])
                if m is None or m.status != "finished":
                    return  # match bị admin abort giữa chừng -> dừng giải
                slot["result"] = m.result
                changed = True
                self._db.update_lab_tournament(tid, schedule=schedule)
            if changed:
                self._db.update_lab_tournament(tid, status="finished")
        finally:
            self._tasks.pop(tid, None)

    def _finish_board(self, match_id: str, board: chess.Board) -> None:
        res = board.result()
        if res not in ("1-0", "0-1", "1/2-1/2"):
            res = "1/2-1/2"
        termination = "checkmate" if board.is_checkmate() else "draw"
        self._db.complete_match(match_id, result=res, termination=termination)

    async def _emit(self, match_id: str, event: str) -> None:
        try:
            await self._broadcast(match_id, event)
        except Exception:  # noqa: BLE001 - broadcast không được làm hỏng runner
            pass
