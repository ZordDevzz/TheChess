import math

import chess
import pytest
from chess.engine import Cp, Mate, PovScore

from analyzer import classify_move, cp_to_win_percent, extract_score_white


class TestCpToWinPercent:
    def test_zero_cp_is_even(self):
        assert cp_to_win_percent(0) == 50.0

    def test_positive_cp_favors_white(self):
        assert cp_to_win_percent(100) > 50.0

    def test_negative_cp_favors_black(self):
        assert cp_to_win_percent(-100) < 50.0

    def test_monotonic_increasing(self):
        values = [cp_to_win_percent(cp) for cp in range(-1000, 1001, 100)]
        assert values == sorted(values)

    def test_mate_positive_is_white_win(self):
        assert cp_to_win_percent(None, mate=3) == 100.0

    def test_mate_negative_is_black_win(self):
        assert cp_to_win_percent(None, mate=-2) == 0.0

    def test_none_returns_even(self):
        assert cp_to_win_percent(None) == 50.0

    def test_extreme_cp_clamped_to_bounds(self):
        assert cp_to_win_percent(99999) == 100.0
        assert cp_to_win_percent(-99999) == 0.0

    def test_output_range(self):
        for cp in [-4000, -500, 0, 500, 4000]:
            assert 0.0 <= cp_to_win_percent(cp) <= 100.0

    def test_lichess_reference_value(self):
        # Công thức Lichess: +100cp ≈ 53.7% cho Trắng
        expected = 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * 100)) - 1.0)
        assert cp_to_win_percent(100) == pytest.approx(expected, abs=0.01)


class TestExtractScoreWhite:
    def test_cp_from_white_pov(self):
        score = PovScore(Cp(150), chess.WHITE)
        data = extract_score_white(score)
        assert data["cp"] == 150
        assert data["mate"] is None
        assert data["win_percent_white"] > 50.0

    def test_cp_from_black_pov_flips_sign(self):
        score = PovScore(Cp(-150), chess.BLACK)
        data = extract_score_white(score)
        # Đen yếu hơn 150 (theo góc nhìn Đen) == Trắng +150
        assert data["cp"] == 150
        assert data["win_percent_white"] > 50.0

    def test_mate_for_white(self):
        score = PovScore(Mate(3), chess.WHITE)
        data = extract_score_white(score)
        assert data["mate"] == 3
        assert data["win_percent_white"] == 100.0

    def test_mate_for_black(self):
        score = PovScore(Mate(-4), chess.WHITE)
        data = extract_score_white(score)
        assert data["mate"] == -4
        assert data["win_percent_white"] == 0.0


class TestClassifyMove:
    def test_matching_best_move_is_best(self):
        res = classify_move(
            win_pct_before_white=60.0,
            win_pct_after_white=40.0,
            mover_is_white=True,
            played_uci="e2e4",
            best_uci="e2e4",
        )
        assert res["classification"] == "Best"
        assert res["symbol"] == "★"

    @pytest.mark.parametrize(
        "loss,label,symbol",
        [
            (1.0, "Best", "★"),
            (4.0, "Excellent", "!"),
            (7.0, "Good", "✓"),
            (12.0, "Inaccuracy", "?!"),
            (20.0, "Mistake", "?"),
            (30.0, "Blunder", "??"),
        ],
    )
    def test_white_loss_bands(self, loss, label, symbol):
        res = classify_move(
            win_pct_before_white=60.0,
            win_pct_after_white=60.0 - loss,
            mover_is_white=True,
            played_uci="a1a2",
            best_uci="h7h8q",
        )
        assert res["classification"] == label
        assert res["symbol"] == symbol
        assert res["win_loss"] == pytest.approx(loss, abs=0.01)

    def test_black_mover_uses_black_perspective(self):
        # Trắng tăng từ 40 -> 50 nghĩa là Đen mất 10% cơ hội thắng -> Inaccuracy
        res = classify_move(
            win_pct_before_white=40.0,
            win_pct_after_white=50.0,
            mover_is_white=False,
            played_uci="a7a6",
            best_uci="h2h4",
        )
        assert res["classification"] == "Inaccuracy"
        assert res["win_loss"] == pytest.approx(10.0, abs=0.01)

    def test_no_loss_when_position_improves(self):
        res = classify_move(
            win_pct_before_white=60.0,
            win_pct_after_white=70.0,
            mover_is_white=True,
            played_uci="d1d2",
            best_uci=None,
        )
        assert res["win_loss"] == 0.0
        assert res["classification"] == "Best"

    def test_accuracy_bounds(self):
        for loss in [0, 5, 10, 20, 40, 80, 100]:
            res = classify_move(
                win_pct_before_white=80.0,
                win_pct_after_white=80.0 - loss,
                mover_is_white=True,
                played_uci="b1c3",
                best_uci=None,
            )
            assert 0.0 <= res["accuracy"] <= 100.0

    def test_accuracy_reference_value(self):
        # Công thức Lichess: loss=0 -> ~100%, loss=20 -> ~40.4%
        res0 = classify_move(60.0, 60.0, True, "a1a2", None)
        assert res0["accuracy"] == pytest.approx(100.0, abs=0.2)
        res20 = classify_move(60.0, 40.0, True, "a1a2", None)
        expected = 103.1668 * math.exp(-0.04354 * 20.0) - 3.1669
        assert res20["accuracy"] == pytest.approx(expected, abs=0.15)

    def test_result_fields_present(self):
        res = classify_move(60.0, 50.0, True, "e2e4", "d1h5")
        for key in ("classification", "symbol", "color", "win_loss", "accuracy"):
            assert key in res
