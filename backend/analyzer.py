"""
Bộ phân tích thế cờ, tính xác suất thắng (Win Probability), phân loại nước đi
(Best, Excellent, Good, Inaccuracy, Mistake, Blunder) và chấm điểm độ chính xác (Accuracy %).
"""
import math
from typing import Any, Dict, List, Optional
import chess
import chess.engine


def cp_to_win_percent(cp: Optional[int], mate: Optional[int] = None) -> float:
    """
    Chuyển đổi điểm Centipawn / Mate (theo góc nhìn bên Trắng) sang % cơ hội thắng của Trắng (0 - 100).
    Sử dụng công thức chuẩn của Lichess.
    """
    if mate is not None:
        if mate > 0:
            return 100.0
        elif mate < 0:
            return 0.0
        return 50.0
    if cp is None:
        return 50.0
    clamped_cp = max(-4000, min(4000, cp))
    multiplier = -0.00368208
    win_prob = 50.0 + 50.0 * (2.0 / (1.0 + math.exp(multiplier * clamped_cp)) - 1.0)
    return round(max(0.0, min(100.0, win_prob)), 2)


def extract_score_white(score_obj: chess.engine.PovScore) -> Dict[str, Any]:
    """
    Trích xuất cp, mate và win_percent theo góc nhìn của Trắng.
    """
    white_score = score_obj.white()
    mate = white_score.mate()
    cp = white_score.score(mate_score=10000)
    win_pct = cp_to_win_percent(cp, mate)
    return {
        "cp": cp,
        "mate": mate,
        "win_percent_white": win_pct,
    }


def classify_move(
    win_pct_before_white: float,
    win_pct_after_white: float,
    mover_is_white: bool,
    played_uci: str,
    best_uci: Optional[str],
) -> Dict[str, Any]:
    """
    Phân loại chất lượng nước đi dựa trên độ sụt giảm tỷ lệ thắng của bên vừa đi.
    """
    if mover_is_white:
        win_loss = max(0.0, win_pct_before_white - win_pct_after_white)
    else:
        win_loss = max(0.0, (100.0 - win_pct_before_white) - (100.0 - win_pct_after_white))

    # Công thức tính Accuracy từng nước đi của Lichess
    raw_acc = 103.1668 * math.exp(-0.04354 * win_loss) - 3.1669
    accuracy = round(max(0.0, min(100.0, raw_acc)), 1)

    if best_uci and played_uci == best_uci:
        label = "Best"
        symbol = "★"
        color = "#22c55e"
    elif win_loss <= 1.5:
        label = "Best"
        symbol = "★"
        color = "#22c55e"
    elif win_loss <= 4.5:
        label = "Excellent"
        symbol = "!"
        color = "#10b981"
    elif win_loss <= 8.0:
        label = "Good"
        symbol = "✓"
        color = "#3b82f6"
    elif win_loss <= 14.0:
        label = "Inaccuracy"
        symbol = "?!"
        color = "#eab308"
    elif win_loss <= 24.0:
        label = "Mistake"
        symbol = "?"
        color = "#f97316"
    else:
        label = "Blunder"
        symbol = "??"
        color = "#ef4444"

    return {
        "classification": label,
        "symbol": symbol,
        "color": color,
        "win_loss": round(win_loss, 2),
        "accuracy": accuracy,
    }
