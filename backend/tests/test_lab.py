"""
Kiểm thử Phòng Lab: lịch round-robin, bảng xếp hạng, và LabManager chạy trận
AI vs AI bằng engine giả (scripted Fool's Mate) — không phụ thuộc binary thật.
"""

import asyncio

import chess
import pytest

from database import DatabaseManager
from lab_manager import LabManager, build_round_robin, compute_standings
from models import LabCreateMatchRequest, LabCreateTournamentRequest, STARTING_FEN

# ---------------------------------------------------------------------------
# Lịch round-robin (thuần, không cần DB)
# ---------------------------------------------------------------------------


def test_build_round_robin_even_participants() -> None:
    schedule = build_round_robin(["A", "B", "C", "D"])
    # 4 người -> 4*3/2 = 6 trận, chia 3 vòng
    assert len(schedule) == 6
    assert len({s["round"] for s in schedule}) == 3
    pairs = {frozenset((s["white_bot_id"], s["black_bot_id"])) for s in schedule}
    assert len(pairs) == 6  # mỗi cặp chỉ gặp nhau đúng 1 lần
    for s in schedule:
        assert s["match_id"] is None and s["result"] is None


def test_build_round_robin_odd_participants_has_bye() -> None:
    schedule = build_round_robin(["A", "B", "C"])
    # 3 người -> 3 trận, mỗi vòng 1 người nghỉ
    assert len(schedule) == 3
    games_per = {p: 0 for p in "ABC"}
    for s in schedule:
        games_per[s["white_bot_id"]] += 1
        games_per[s["black_bot_id"]] += 1
    assert games_per == {"A": 2, "B": 2, "C": 2}


def test_compute_standings_points_and_order() -> None:
    participants = [
        {"bot_id": "A", "label": "Bot A"},
        {"bot_id": "B", "label": "Bot B"},
        {"bot_id": "C", "label": "Bot C"},
    ]
    schedule = [
        {"round": 1, "white_bot_id": "A", "black_bot_id": "B", "match_id": "m1", "result": "1-0"},
        {"round": 1, "white_bot_id": "A", "black_bot_id": "C", "match_id": "m2", "result": "1/2-1/2"},
        {"round": 2, "white_bot_id": "B", "black_bot_id": "C", "match_id": "m3", "result": "0-1"},
    ]
    standings = compute_standings(participants, schedule)
    # A: thắng B, hòa C = 1.5đ. C: thắng B, hòa A = 1.5đ (A trên nhờ label).
    # B: thua cả 2 = 0đ.
    assert standings[0]["bot_id"] == "A" and standings[0]["points"] == 1.5
    assert standings[1]["bot_id"] == "C" and standings[1]["points"] == 1.5
    assert standings[2]["bot_id"] == "B" and standings[2]["points"] == 0.0
    assert standings[0]["wins"] == 1 and standings[0]["draws"] == 1
    assert standings[2]["losses"] == 2


# ---------------------------------------------------------------------------
# LabManager + engine giả (scripted Fool's Mate: 1.f3 e5 2.g4 Qh4#)
# ---------------------------------------------------------------------------

_FOOLS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"]


def _script_fens() -> dict:
    board = chess.Board()
    script = {}
    for uci in _FOOLS_MATE:
        script[board.fen()] = uci
        board.push(chess.Move.from_uci(uci))
    return script


class FakeEngine:
    """Adapter engine: trả đúng nước theo kịch bản Fool's Mate (Đen thắng 0-1)."""

    def __init__(self) -> None:
        self._script = _script_fens()

    async def get_ai_move(self, fen: str, engine: str, elo: int):
        uci = self._script.get(fen)
        if uci is None:  # ngoài kịch bản: đi nước hợp lệ đầu tiên
            uci = next(iter(chess.Board(fen).legal_moves)).uci()
        board = chess.Board(fen)
        move = chess.Move.from_uci(uci)
        san = board.san(move)
        board.push(move)
        return {"move_uci": uci, "move_san": san, "fen_after": board.fen()}


class BroadcastRecorder:
    def __init__(self) -> None:
        self.events: list = []

    async def __call__(self, match_id: str, event: str) -> None:
        self.events.append((match_id, event))


@pytest.fixture()
def lab() -> tuple[LabManager, DatabaseManager, BroadcastRecorder]:
    db = DatabaseManager(":memory:")
    recorder = BroadcastRecorder()
    manager = LabManager(FakeEngine(), db, recorder)
    manager._pacing = [0.0, 0.0]
    manager._min_move_sec = 0.0
    yield manager, db, recorder
    db.close()


def test_create_lab_match_runs_to_checkmate(lab) -> None:
    manager, db, recorder = lab
    w_bot = db.get_user_by_username("bot_maia_1500")
    b_bot = db.get_user_by_username("bot_maia_1600")
    assert w_bot and b_bot

    async def create_and_wait() -> dict:
        details = await manager.create_match(
            LabCreateMatchRequest(white_bot_id=w_bot.id, black_bot_id=b_bot.id)
        )
        task = manager._tasks.get(details["match"]["id"])
        if task is not None:
            await task
        return details

    details = asyncio.run(create_and_wait())
    match_id = details["match"]["id"]
    assert details["match"]["status"] == "playing"
    assert details["white_player"]["is_bot"] is True

    finished = db.get_match_with_details(match_id)
    assert finished is not None
    assert finished.match.status == "finished"
    assert finished.match.result == "0-1"  # Đen chiếu hết sau 2.g4?? Qh4#
    assert finished.match.total_plies == 4
    # Mỗi nước đều broadcast; kết thúc có event match_finished
    assert ("match_updated") in [e for _, e in recorder.events]
    assert (match_id, "match_finished") in recorder.events
    # Nước có đánh giá thô để EvalGraph hiển thị
    assert finished.moves[-1].win_percent_white is not None


def test_create_lab_match_rejects_human_id(lab) -> None:
    manager, db, _ = lab
    human = db.create_user_by_admin(
        db.get_user_by_username("admin").id,
        __import__("models").CreateUserByAdminRequest(
            username="khoa", password="khoa_pass_1", display_name="Khoa"
        ),
    )
    with pytest.raises(KeyError):
        asyncio.run(
            manager.create_match(
                LabCreateMatchRequest(
                    white_bot_id=human.id,
                    black_bot_id="bot_maia_1500",
                )
            )
        )


def test_tournament_runs_all_matches_and_ranks(lab) -> None:
    manager, db, _ = lab
    bots = [
        db.get_user_by_username(f"bot_maia_{elo}") for elo in (1500, 1600, 1700)
    ]
    assert all(bots)

    async def create_and_wait() -> dict:
        created = await manager.create_tournament(
            LabCreateTournamentRequest(
                name="Maia Cup",
                bot_ids=[b.id for b in bots],
            )
        )
        task = manager._tasks.get(created["id"])
        if task is not None:
            await task
        return created

    created = asyncio.run(create_and_wait())
    tid = created["id"]
    assert created["status"] == "running"
    assert len(created["schedule"]) == 3  # 3 người vòng tròn

    detail = manager.get_tournament(tid)
    assert detail["status"] == "finished"
    # Mọi slot đều đã có match_id (task đã chạy xong)
    assert all(s["match_id"] for s in detail["schedule"])
    # Mọi trận đều kết thúc bằng Fool's Mate -> bên Đen thắng hết
    assert all(s["result"] == "0-1" for s in detail["schedule"])
    standings = detail["standings"]
    assert len(standings) == 3
    total_points = sum(r["points"] for r in standings)
    assert total_points == 3.0  # 3 trận phân định thắng/thua


def test_ensure_exhibition_creates_then_reuses(lab) -> None:
    manager, db, _ = lab
    first = asyncio.run(manager.ensure_exhibition(viewer_elo=1480))
    assert first is not None and first.is_system_exhibition is True

    second = asyncio.run(manager.ensure_exhibition(viewer_elo=1480))
    assert second is not None and second.match.id == first.match.id  # dùng lại, không tạo trùng

    # Dọn task nền để fixture close DB sạch
    asyncio.run(manager.shutdown())
