"""
Quản lý pool engine UCI bất đồng bộ (asyncio) tới Stockfish và Lc0 / Maia Chess.
Hỗ trợ:
- Phân tích thế cờ (MultiPV 1-5, WDL, CP, Mate, chuỗi PV SAN/UCI)
- Chơi với AI:
  + Stockfish (tùy chỉnh Elo 1320-3190, Skill Level 0-20, Depth/Time)
  + Maia Chess 1100-1900 (chạy qua Lc0 + weights maia-xxxx.pb.gz, hoặc mô phỏng phân phối nước đi người thật nếu chưa có binary lc0)
- Game Review (chấm điểm toàn bộ ván đấu, có callback tiến độ)
- Pool nhiều instance Stockfish để nhiều request chạy song song không khóa nhau
"""
import asyncio
import math
import os
import random
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Tuple

import chess
import chess.engine

from analyzer import classify_move, extract_score_white

ENGINES_DIR = Path(__file__).resolve().parent.parent / "engines"
WEIGHTS_DIR = ENGINES_DIR / "weights"

# Số instance Stockfish tối đa trong pool (cấu hình qua biến môi trường)
MAX_POOL_SIZE = max(1, int(os.environ.get("THECHESS_ENGINE_POOL", "3")))


def find_stockfish_binary() -> Optional[str]:
    local_sf = ENGINES_DIR / "stockfish"
    if local_sf.exists() and os.access(local_sf, os.X_OK):
        return str(local_sf)
    sys_sf = shutil.which("stockfish")
    return sys_sf


def find_lc0_binary() -> Optional[str]:
    local_lc0 = ENGINES_DIR / "lc0"
    if local_lc0.exists() and os.access(local_lc0, os.X_OK):
        return str(local_lc0)
    sys_lc0 = shutil.which("lc0")
    return sys_lc0


def list_maia_weights() -> List[int]:
    if not WEIGHTS_DIR.exists():
        return []
    elos = []
    for f in sorted(WEIGHTS_DIR.glob("maia-*.pb.gz")):
        try:
            elo = int(f.name.replace("maia-", "").replace(".pb.gz", ""))
            elos.append(elo)
        except ValueError:
            pass
    return elos


class _EngineSlot:
    """Một instance engine đang sống, kèm transport để kiểm tra trạng thái."""

    def __init__(self, transport: asyncio.SubprocessTransport, engine: chess.engine.UciProtocol):
        self.transport = transport
        self.engine = engine

    @property
    def usable(self) -> bool:
        return self.transport is not None and not self.transport.is_closing()


ProgressCallback = Callable[[int, int], None]


class EngineManager:
    """
    Quản lý pool Stockfish: mỗi request mượn 1 instance (lease), trả về sau khi xong.
    Nhờ đó phân tích / AI đi cờ / review có thể chạy song song thay vì xếp hàng 1 global lock.
    """

    def __init__(self, pool_size: int = MAX_POOL_SIZE) -> None:
        self._pool_size = max(1, pool_size)
        self._free: "asyncio.Queue[_EngineSlot]" = asyncio.Queue()
        self._all: List[_EngineSlot] = []
        self._spawn_lock = asyncio.Lock()

        # Cache engine Lc0 theo Elo Maia (tránh spawn tiến trình mới mỗi nước)
        self._lc0_cache: Dict[int, _EngineSlot] = {}
        self._lc0_locks: Dict[int, asyncio.Lock] = {}

    async def _spawn(self) -> _EngineSlot:
        sf_path = find_stockfish_binary()
        if not sf_path:
            raise RuntimeError(
                "Không tìm thấy binary Stockfish. Hãy chạy engines/setup_engines.py trước."
            )
        transport, engine = await chess.engine.popen_uci(sf_path)
        await engine.configure({"Threads": 2, "Hash": 64})
        slot = _EngineSlot(transport, engine)
        self._all.append(slot)
        return slot

    async def _acquire(self) -> _EngineSlot:
        # Ưu tiên instance rảnh sẵn có
        try:
            slot = self._free.get_nowait()
            if slot.usable:
                return slot
        except asyncio.QueueEmpty:
            pass

        async with self._spawn_lock:
            # Kiểm tra lại: có thể coroutine khác vừa trả instance
            try:
                slot = self._free.get_nowait()
                if slot.usable:
                    return slot
            except asyncio.QueueEmpty:
                pass
            # Dọn instance chết rồi mới quyết định spawn
            alive = [s for s in self._all if s.usable]
            self._all = alive
            if len(self._all) < self._pool_size:
                return await self._spawn()

        # Pool đã đầy -> chờ instance rảnh
        slot = await self._free.get()
        if not slot.usable:
            return await self._acquire()
        return slot

    def _release(self, slot: _EngineSlot) -> None:
        if slot.usable:
            self._free.put_nowait(slot)

    @asynccontextmanager
    async def lease(self) -> AsyncIterator[chess.engine.UciProtocol]:
        slot = await self._acquire()
        try:
            yield slot.engine
        finally:
            self._release(slot)

    async def _get_lc0(self, elo: int) -> Optional[chess.engine.UciProtocol]:
        """Lấy (hoặc tạo) engine Lc0 dùng cho weight Maia tương ứng, tái sử dụng giữa các nước."""
        cached = self._lc0_cache.get(elo)
        if cached is not None and cached.usable:
            return cached.engine

        lc0_bin = find_lc0_binary()
        weight_path = WEIGHTS_DIR / f"maia-{elo}.pb.gz"
        if not lc0_bin or not weight_path.exists():
            return None

        transport, engine = await chess.engine.popen_uci([lc0_bin, f"--weights={weight_path}"])
        slot = _EngineSlot(transport, engine)
        self._lc0_cache[elo] = slot
        return engine

    async def shutdown(self) -> None:
        for slot in self._all:
            try:
                await slot.engine.quit()
            except Exception:
                pass
        self._all = []
        while not self._free.empty():
            try:
                self._free.get_nowait()
            except asyncio.QueueEmpty:
                break
        for slot in self._lc0_cache.values():
            try:
                await slot.engine.quit()
            except Exception:
                pass
        self._lc0_cache = {}

    def get_status(self) -> Dict[str, Any]:
        sf_bin = find_stockfish_binary()
        lc0_bin = find_lc0_binary()
        maia_elos = list_maia_weights()
        return {
            "stockfish_ready": sf_bin is not None,
            "stockfish_path": sf_bin,
            "lc0_binary_ready": lc0_bin is not None,
            "lc0_path": lc0_bin,
            "maia_weights_available": maia_elos,
            "engine_pool_size": self._pool_size,
            "engines": [
                {
                    "id": "maia",
                    "name": "Maia Chess (Human-like AI)",
                    "description": "Model huấn luyện từ hàng triệu ván cờ người thật trên Lichess (Elo 1100 - 1900).",
                    "elos": maia_elos if maia_elos else [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900],
                    "mode": "lc0_native" if lc0_bin else "human_policy_sampling",
                },
                {
                    "id": "stockfish",
                    "name": "Stockfish 17 NNUE",
                    "description": "Engine cờ vua mạnh nhất thế giới. Hỗ trợ giới hạn Elo (1320 - 3190) hoặc Full Strength.",
                    "min_elo": 1320,
                    "max_elo": 3190,
                },
            ],
        }

    async def analyze_position(
        self,
        fen: str,
        depth: int = 16,
        multipv: int = 3,
        time_limit: Optional[float] = None,
    ) -> Dict[str, Any]:
        board = chess.Board(fen)
        if board.is_game_over():
            outcome = board.outcome()
            win_w = 50.0
            cp = 0
            mate = None
            if outcome and outcome.winner is True:
                win_w = 100.0
                cp = 10000
                mate = 0
            elif outcome and outcome.winner is False:
                win_w = 0.0
                cp = -10000
                mate = 0
            return {
                "fen": fen,
                "turn": "w" if board.turn == chess.WHITE else "b",
                "is_game_over": True,
                "result": board.result(),
                "cp": cp,
                "mate": mate,
                "win_percent_white": win_w,
                "lines": [],
            }

        async with self.lease() as engine:
            limit = chess.engine.Limit(
                depth=max(6, min(25, depth)),
                time=time_limit if time_limit else 1.2,
            )
            infos = await engine.analyse(
                board,
                limit,
                multipv=max(1, min(5, multipv)),
                options={"UCI_LimitStrength": False},
            )

        if isinstance(infos, dict):
            infos = [infos]

        lines: List[Dict[str, Any]] = []
        for idx, info in enumerate(infos, start=1):
            pv = info.get("pv", [])
            if not pv:
                continue
            first_move: chess.Move = pv[0]
            score_obj = info.get("score")
            score_data = (
                extract_score_white(score_obj)
                if score_obj is not None
                else {"cp": 0, "mate": None, "win_percent_white": 50.0}
            )

            # Chuyển chuỗi PV sang ký hiệu SAN dễ đọc
            temp_board = board.copy()
            pv_san: List[str] = []
            pv_uci: List[str] = []
            for m in pv[:6]:
                if m in temp_board.legal_moves:
                    pv_san.append(temp_board.san(m))
                    pv_uci.append(m.uci())
                    temp_board.push(m)
                else:
                    break

            wdl_info = None
            if "wdl" in info:
                w_wdl = info["wdl"].white()
                wdl_info = {
                    "win": round(w_wdl.wins / 10.0, 1),
                    "draw": round(w_wdl.draws / 10.0, 1),
                    "loss": round(w_wdl.losses / 10.0, 1),
                }

            lines.append(
                {
                    "rank": idx,
                    "depth": info.get("depth", depth),
                    "move_uci": first_move.uci(),
                    "move_san": board.san(first_move),
                    "from_square": chess.square_name(first_move.from_square),
                    "to_square": chess.square_name(first_move.to_square),
                    "cp": score_data["cp"],
                    "mate": score_data["mate"],
                    "win_percent_white": score_data["win_percent_white"],
                    "pv_san": pv_san,
                    "pv_uci": pv_uci,
                    "wdl": wdl_info,
                }
            )

        top = lines[0] if lines else {"cp": 0, "mate": None, "win_percent_white": 50.0}
        return {
            "fen": fen,
            "turn": "w" if board.turn == chess.WHITE else "b",
            "is_game_over": False,
            "cp": top["cp"],
            "mate": top["mate"],
            "win_percent_white": top["win_percent_white"],
            "lines": lines,
        }

    async def get_ai_move(
        self,
        fen: str,
        engine_type: str = "maia",
        elo: int = 1500,
        skill_level: Optional[int] = None,
        move_time: float = 0.6,
    ) -> Dict[str, Any]:
        board = chess.Board(fen)
        if board.is_game_over():
            raise ValueError("Ván cờ đã kết thúc, AI không thể đi tiếp.")

        nearest_maia_elo = min(
            [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900],
            key=lambda x: abs(x - elo),
        )

        # Trường hợp 1: Chạy Maia qua Lc0 binary + weight (engine được cache & tái sử dụng)
        if engine_type == "maia":
            lc0_engine = await self._get_lc0(nearest_maia_elo)
            if lc0_engine is not None:
                lock = self._lc0_locks.setdefault(nearest_maia_elo, asyncio.Lock())
                async with lock:
                    res = await lc0_engine.play(board, chess.engine.Limit(nodes=1))
                chosen_move = res.move
                if chosen_move is not None:
                    san = board.san(chosen_move)
                    board.push(chosen_move)
                    return {
                        "move_uci": chosen_move.uci(),
                        "move_san": san,
                        "from_square": chess.square_name(chosen_move.from_square),
                        "to_square": chess.square_name(chosen_move.to_square),
                        "fen_after": board.fen(),
                        "engine_used": f"Maia {nearest_maia_elo} (Lc0 Neural Net)",
                    }

        # Trường hợp 2: Chế độ Maia (Human-like Policy Sampling) khi dùng qua core engine
        if engine_type == "maia":
            async with self.lease() as engine:
                # Lấy 5 nước đi ứng viên ở độ sâu nông (giống tầm nhìn chiến thuật của người chơi mức Elo đó)
                shallow_depth = max(4, min(10, int((nearest_maia_elo - 800) / 140)))
                infos = await engine.analyse(
                    board,
                    chess.engine.Limit(depth=shallow_depth, time=0.35),
                    multipv=min(5, board.legal_moves.count()),
                    options={"UCI_LimitStrength": False},
                )
            if isinstance(infos, dict):
                infos = [infos]

            candidates = []
            mover_is_white = board.turn == chess.WHITE
            for info in infos:
                pv = info.get("pv", [])
                if not pv:
                    continue
                m = pv[0]
                sc = extract_score_white(info["score"])
                win_for_mover = (
                    sc["win_percent_white"]
                    if mover_is_white
                    else (100.0 - sc["win_percent_white"])
                )
                candidates.append((m, win_for_mover))

            if candidates:
                # Nhiệt độ (temperature) phụ thuộc vào mức Elo Maia (1100 -> ngẫu nhiên hơn, 1900 -> sắc bén hơn)
                temp = max(2.5, (2150 - nearest_maia_elo) / 95.0)
                max_w = max(w for _, w in candidates)
                weights = [math.exp((w - max_w) / temp) for _, w in candidates]
                chosen_move = random.choices([m for m, _ in candidates], weights=weights, k=1)[0]
            else:
                chosen_move = random.choice(list(board.legal_moves))

            san = board.san(chosen_move)
            board.push(chosen_move)
            return {
                "move_uci": chosen_move.uci(),
                "move_san": san,
                "from_square": chess.square_name(chosen_move.from_square),
                "to_square": chess.square_name(chosen_move.to_square),
                "fen_after": board.fen(),
                "engine_used": f"Maia {nearest_maia_elo} (Human-like Profile)",
            }

        # Trường hợp 3: Stockfish (Giới hạn Elo 1320 - 3190 hoặc Full Strength)
        async with self.lease() as engine:
            opts: Dict[str, Any] = {}
            if skill_level is not None:
                opts["UCI_LimitStrength"] = False
                opts["Skill Level"] = max(0, min(20, skill_level))
                engine_label = f"Stockfish (Skill {opts['Skill Level']})"
            elif elo < 3190:
                clamped_elo = max(1320, min(3190, elo))
                opts["UCI_LimitStrength"] = True
                opts["UCI_Elo"] = clamped_elo
                engine_label = f"Stockfish ({clamped_elo} Elo)"
            else:
                opts["UCI_LimitStrength"] = False
                opts["Skill Level"] = 20
                engine_label = "Stockfish (Maximum Strength)"

            res = await engine.play(
                board,
                chess.engine.Limit(time=max(0.1, min(5.0, move_time))),
                options=opts,
            )
            chosen_move = res.move
            if chosen_move is None:
                raise RuntimeError("Stockfish không trả về nước đi hợp lệ.")
            san = board.san(chosen_move)
            board.push(chosen_move)
            return {
                "move_uci": chosen_move.uci(),
                "move_san": san,
                "from_square": chess.square_name(chosen_move.from_square),
                "to_square": chess.square_name(chosen_move.to_square),
                "fen_after": board.fen(),
                "engine_used": engine_label,
            }

    async def review_game(
        self,
        initial_fen: str,
        moves_uci: List[str],
        depth: int = 12,
        progress_cb: Optional[ProgressCallback] = None,
    ) -> Dict[str, Any]:
        board = chess.Board(initial_fen)
        evaluated_positions: List[Dict[str, Any]] = []

        # Review mượn riêng 1 instance trong suốt quá trình,
        # pool còn lại vẫn phục vụ analyze / ai-move bình thường.
        async with self.lease() as engine:
            # Đánh giá thế cờ ban đầu
            init_info = await engine.analyse(
                board,
                chess.engine.Limit(depth=depth, time=0.25),
                multipv=1,
                options={"UCI_LimitStrength": False},
            )
            if isinstance(init_info, list):
                init_info = init_info[0]
            init_score = extract_score_white(init_info["score"])
            init_best = init_info.get("pv", [None])[0]
            evaluated_positions.append(
                {
                    "ply": 0,
                    "fen": board.fen(),
                    "cp": init_score["cp"],
                    "mate": init_score["mate"],
                    "win_percent_white": init_score["win_percent_white"],
                    "best_move_uci": init_best.uci() if init_best else None,
                    "best_move_san": board.san(init_best) if init_best else None,
                }
            )

            move_reviews: List[Dict[str, Any]] = []
            white_accuracies: List[float] = []
            black_accuracies: List[float] = []
            counts = {
                "w": {"Best": 0, "Excellent": 0, "Good": 0, "Inaccuracy": 0, "Mistake": 0, "Blunder": 0},
                "b": {"Best": 0, "Excellent": 0, "Good": 0, "Inaccuracy": 0, "Mistake": 0, "Blunder": 0},
            }

            total = len(moves_uci)
            for ply_idx, uci_str in enumerate(moves_uci, start=1):
                mover_is_white = board.turn == chess.WHITE
                side_key = "w" if mover_is_white else "b"
                move_obj = chess.Move.from_uci(uci_str)
                if move_obj not in board.legal_moves:
                    raise ValueError(
                        f"Nước thứ {ply_idx} ('{uci_str}') không hợp lệ trên bàn cờ, không thể review tiếp."
                    )

                san_str = board.san(move_obj)
                prev_eval = evaluated_positions[-1]
                best_uci_before = prev_eval["best_move_uci"]
                best_san_before = prev_eval["best_move_san"]

                board.push(move_obj)

                if board.is_game_over():
                    outcome = board.outcome()
                    if outcome and outcome.winner is True:
                        cur_score = {"cp": 10000, "mate": 0, "win_percent_white": 100.0}
                    elif outcome and outcome.winner is False:
                        cur_score = {"cp": -10000, "mate": 0, "win_percent_white": 0.0}
                    else:
                        cur_score = {"cp": 0, "mate": None, "win_percent_white": 50.0}
                    next_best_uci = None
                    next_best_san = None
                else:
                    info = await engine.analyse(
                        board,
                        chess.engine.Limit(depth=depth, time=0.25),
                        multipv=1,
                        options={"UCI_LimitStrength": False},
                    )
                    if isinstance(info, list):
                        info = info[0]
                    cur_score = extract_score_white(info["score"])
                    nxt = info.get("pv", [None])[0]
                    next_best_uci = nxt.uci() if nxt else None
                    next_best_san = board.san(nxt) if nxt else None

                cls_info = classify_move(
                    win_pct_before_white=prev_eval["win_percent_white"],
                    win_pct_after_white=cur_score["win_percent_white"],
                    mover_is_white=mover_is_white,
                    played_uci=uci_str,
                    best_uci=best_uci_before,
                )

                counts[side_key][cls_info["classification"]] += 1
                if mover_is_white:
                    white_accuracies.append(cls_info["accuracy"])
                else:
                    black_accuracies.append(cls_info["accuracy"])

                move_entry = {
                    "ply": ply_idx,
                    "move_number": (ply_idx + 1) // 2,
                    "turn": side_key,
                    "move_uci": uci_str,
                    "move_san": san_str,
                    "fen_after": board.fen(),
                    "cp": cur_score["cp"],
                    "mate": cur_score["mate"],
                    "win_percent_white": cur_score["win_percent_white"],
                    "best_move_uci": best_uci_before,
                    "best_move_san": best_san_before,
                    **cls_info,
                }
                move_reviews.append(move_entry)
                evaluated_positions.append(
                    {
                        "ply": ply_idx,
                        "fen": board.fen(),
                        "cp": cur_score["cp"],
                        "mate": cur_score["mate"],
                        "win_percent_white": cur_score["win_percent_white"],
                        "best_move_uci": next_best_uci,
                        "best_move_san": next_best_san,
                    }
                )

                if progress_cb is not None:
                    try:
                        progress_cb(ply_idx, total)
                    except Exception:
                        pass

        avg_w_acc = round(sum(white_accuracies) / len(white_accuracies), 1) if white_accuracies else 100.0
        avg_b_acc = round(sum(black_accuracies) / len(black_accuracies), 1) if black_accuracies else 100.0

        return {
            "initial_fen": initial_fen,
            "white_accuracy": avg_w_acc,
            "black_accuracy": avg_b_acc,
            "counts": counts,
            "moves": move_reviews,
        }


engine_manager = EngineManager()
