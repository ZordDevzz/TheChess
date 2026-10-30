"""
Kiểm thử toàn diện tầng Cơ sở dữ liệu Multiplayer (user, match, match_detail).
"""

import pytest
from database import DatabaseManager
from models import (
    AppendMoveRequest,
    CreateMatchRequest,
    CreateUserByAdminRequest,
)


@pytest.fixture()
def db() -> DatabaseManager:
    manager = DatabaseManager(":memory:")
    yield manager
    manager.close()


def test_seed_defaults_creates_admin_and_ai_bots(db: DatabaseManager) -> None:
    admin = db.get_user_by_username("admin")
    assert admin is not None
    assert admin.role == "admin"
    assert admin.is_bot is False
    assert admin.is_active is True

    maia_1500 = db.get_user_by_username("bot_maia_1500")
    assert maia_1500 is not None
    assert maia_1500.is_bot is True
    assert maia_1500.bot_engine == "maia"
    assert maia_1500.bot_default_elo == 1500
    assert maia_1500.rating == 1500

    stockfish = db.get_user_by_username("bot_stockfish")
    assert stockfish is not None
    assert stockfish.is_bot is True
    assert stockfish.bot_engine == "stockfish"


def test_admin_only_user_provisioning_and_auth(db: DatabaseManager) -> None:
    admin = db.get_user_by_username("admin")
    assert admin is not None

    alice = db.create_user_by_admin(
        admin.id,
        CreateUserByAdminRequest(
            username="alice",
            password="secret_password_123",
            display_name="Alice Nguyễn",
            email="alice@example.com",
            initial_rating=1600,
        ),
    )
    assert alice.username == "alice"
    assert alice.display_name == "Alice Nguyễn"
    assert alice.rating == 1600
    assert alice.peak_rating == 1600
    assert alice.must_change_password is True
    assert alice.created_by_id == admin.id

    # Người chơi thường (không phải admin) không được phép cấp tài khoản mới
    with pytest.raises(PermissionError):
        db.create_user_by_admin(
            alice.id,
            CreateUserByAdminRequest(
                username="bob",
                password="bob_password_123",
            ),
        )

    # Xác thực đăng nhập đúng & sai mật khẩu
    assert db.authenticate_user("alice", "wrong_pass") is None
    authed = db.authenticate_user("alice", "secret_password_123")
    assert authed is not None
    assert authed.id == alice.id
    assert authed.last_login_at is not None

    # Thu hồi phiên JWT qua token_version
    revoked = db.revoke_user_sessions(admin.id, alice.id, deactivate=True)
    assert revoked.token_version == alice.token_version + 1
    assert revoked.is_active is False
    assert db.authenticate_user("alice", "secret_password_123") is None


def test_match_lifecycle_moves_takeback_and_elo_update(db: DatabaseManager) -> None:
    admin = db.get_user_by_username("admin")
    assert admin is not None

    alice = db.create_user_by_admin(
        admin.id,
        CreateUserByAdminRequest(
            username="alice",
            password="alice_password",
            display_name="Alice",
            initial_rating=1500,
        ),
    )
    bob = db.create_user_by_admin(
        admin.id,
        CreateUserByAdminRequest(
            username="bob",
            password="bob_password",
            display_name="Bob",
            initial_rating=1500,
        ),
    )

    match = db.create_match(
        CreateMatchRequest(
            mode="online",
            status="playing",
            is_rated=True,
            white_user_id=alice.id,
            black_user_id=bob.id,
            allow_takeback=True,
            allow_hints=False,
            time_control_type="blitz",
            initial_time_ms=180_000,
            increment_ms=2_000,
        )
    )
    assert match.room_code is not None
    assert len(match.room_code) == 6
    assert match.white_rating_before == 1500
    assert match.black_rating_before == 1500
    assert match.white_clock_ms == 180_000
    assert match.black_clock_ms == 180_000

    # 1. e4
    m1 = db.append_move(
        match.id,
        AppendMoveRequest(
            player_user_id=alice.id,
            uci="e2e4",
            time_spent_ms=1500,
            clock_after_ms=180_500,
        ),
    )
    assert m1.ply == 1
    assert m1.move_number == 1
    assert m1.san == "e4"
    assert m1.parent_detail_id is None
    assert m1.is_mainline is True

    # 1... e5
    m2 = db.append_move(
        match.id,
        AppendMoveRequest(
            player_user_id=bob.id,
            uci="e7e5",
            time_spent_ms=2000,
            clock_after_ms=180_000,
        ),
    )
    assert m2.ply == 2
    assert m2.move_number == 1
    assert m2.san == "e5"
    assert m2.parent_detail_id == m1.id

    # Thử đi sai lượt (Bob cố đi tiếp khi đang là lượt Trắng của Alice)
    with pytest.raises(PermissionError):
        db.append_move(
            match.id,
            AppendMoveRequest(
                player_user_id=bob.id,
                uci="g8f6",
            ),
        )

    # 2. Nf3 (sau đó Alice xin takeback về ply 1 để đổi sang 1... c5 -> 2. Bc4)
    m3_old = db.append_move(
        match.id,
        AppendMoveRequest(
            player_user_id=alice.id,
            uci="g1f3",
        ),
    )
    assert m3_old.ply == 3

    # Takeback về ply 2 (rút lại nước 2. Nf3)
    after_tb = db.takeback_to_ply(match.id, target_ply=2)
    assert after_tb.total_plies == 2
    assert after_tb.current_turn == "w"

    # Alice đi nước mới tại ply 3: 2. Bc4 (Partial Unique Index cho phép vì m3_old đã thành is_mainline=0)
    m3_new = db.append_move(
        match.id,
        AppendMoveRequest(
            player_user_id=alice.id,
            uci="f1c4",
        ),
    )
    assert m3_new.ply == 3
    assert m3_new.san == "Bc4"
    assert m3_new.parent_detail_id == m2.id

    # Kiểm tra cả nhánh chính (moves) và nhánh đã takeback (variations) đều được giữ lại
    full_view = db.get_match_with_details(match.id)
    assert full_view is not None
    assert [m.san for m in full_view.moves] == ["e4", "e5", "Bc4"]
    assert [v.san for v in full_view.variations] == ["Nf3"]

    # Kết thúc ván đấu (Trắng thắng do Đen đầu hàng)
    finished = db.complete_match(match.id, result="1-0", termination="resign")
    assert finished.status == "finished"
    assert finished.winner_user_id == alice.id
    assert finished.white_rating_delta is not None and finished.white_rating_delta > 0
    assert finished.black_rating_delta is not None and finished.black_rating_delta < 0
    assert finished.pgn is not None and "1. e4 e5 2. Bc4" in finished.pgn

    # Kiểm tra thống kê trên bảng user đã được cập nhật
    alice_after = db.get_user_by_id(alice.id)
    bob_after = db.get_user_by_id(bob.id)
    assert alice_after is not None and bob_after is not None
    assert alice_after.games_played == 1
    assert alice_after.wins == 1
    assert alice_after.white_wins == 1
    assert alice_after.current_streak == 1
    assert alice_after.rating == finished.white_rating_after
    assert bob_after.games_played == 1
    assert bob_after.losses == 1
    assert bob_after.current_streak == -1


def test_save_match_review_updates_match_details_and_user_accuracy(
    db: DatabaseManager,
) -> None:
    admin = db.get_user_by_username("admin")
    maia = db.get_user_by_username("bot_maia_1500")
    assert admin is not None and maia is not None

    match = db.create_match(
        CreateMatchRequest(
            mode="vs_ai",
            status="playing",
            is_rated=False,
            white_user_id=admin.id,
            black_user_id=maia.id,
        )
    )
    db.append_move(match.id, AppendMoveRequest(player_user_id=admin.id, uci="e2e4"))
    db.append_move(match.id, AppendMoveRequest(player_user_id=maia.id, uci="e7e5"))
    db.complete_match(match.id, result="1/2-1/2", termination="agreement")

    reviewed = db.save_match_review(
        match_id=match.id,
        white_accuracy=94.5,
        black_accuracy=89.2,
        review_summary={
            "white": {"Best": 1, "Blunder": 0},
            "black": {"Best": 1, "Blunder": 0},
        },
        ply_evaluations=[
            {
                "ply": 1,
                "cp": 28,
                "win_percent_white": 52.5,
                "win_loss": 0.0,
                "accuracy": 94.5,
                "classification": "Best",
                "symbol": "!",
                "best_move_uci": "e2e4",
                "best_move_san": "e4",
            },
            {
                "ply": 2,
                "cp": 25,
                "win_percent_white": 52.2,
                "win_loss": 0.3,
                "accuracy": 89.2,
                "classification": "Best",
                "symbol": "!",
                "best_move_uci": "e7e5",
                "best_move_san": "e5",
            },
        ],
    )
    assert reviewed.review_status == "done"
    assert reviewed.white_accuracy == 94.5
    assert reviewed.black_accuracy == 89.2

    details = db.get_match_with_details(match.id)
    assert details is not None
    assert details.moves[0].classification == "Best"
    assert details.moves[0].cp == 28
    assert details.white_player.avg_accuracy == 94.5
    assert details.black_player.avg_accuracy == 89.2


def test_quick_login_token_waiting_room_join_and_exhibition_stream(
    db: DatabaseManager,
) -> None:
    from database import create_quick_login_token, create_session_token

    admin = db.get_user_by_username("admin")
    assert admin is not None

    user_a = db.create_user_by_admin(
        admin.id,
        CreateUserByAdminRequest(
            username="khoa",
            password="khoa_password",
            display_name="Khoa",
            initial_rating=1480,
        ),
    )
    user_b = db.create_user_by_admin(
        admin.id,
        CreateUserByAdminRequest(
            username="minh",
            password="minh_password",
            display_name="Minh",
            initial_rating=1540,
        ),
    )

    # Quick-Link token đăng nhập 1 chạm (rút gọn 19 ký tự)
    q_token = create_quick_login_token(user_a)
    assert len(q_token) == 19
    verified_a = db.verify_token_and_get_user(q_token, expected_purpose="quick_login")
    assert verified_a is not None
    assert verified_a.id == user_a.id

    # Khi đổi mật khẩu mới -> token_version tăng -> quick_login cũ bị vô hiệu hóa
    updated_a = db.change_own_password(user_a.id, "new_khoa_pass_99", "Khoa Trần")
    assert updated_a.must_change_password is False
    assert updated_a.display_name == "Khoa Trần"
    assert db.verify_token_and_get_user(q_token, expected_purpose="quick_login") is None

    s_token = create_session_token(updated_a)
    assert db.verify_token_and_get_user(s_token, expected_purpose="session") is not None

    # Tạo phòng chờ (waiting) và người thứ 2 vào qua room_code
    waiting_match = db.create_match(
        CreateMatchRequest(
            mode="online",
            status="waiting",
            is_rated=True,
            white_user_id=user_a.id,
            black_user_id=user_a.id,
            time_control_type="blitz",
            initial_time_ms=180_000,
            increment_ms=2_000,
        )
    )
    assert waiting_match.status == "waiting"
    assert waiting_match.room_code is not None

    joined = db.join_waiting_match(waiting_match.room_code, user_b.id)
    assert joined.status == "playing"
    assert joined.white_user_id == user_a.id
    assert joined.black_user_id == user_b.id

    # Admin hủy phòng đang chạy
    aborted = db.abort_match_by_admin(admin.id, joined.id)
    assert aborted.status == "aborted"

    # Khi không còn trận nào đang playing -> Sảnh tự tạo và đi tiếp trận AI vs AI biểu diễn
    ex_1 = db.ensure_or_step_exhibition_match(viewer_elo=1480)
    assert ex_1.is_system_exhibition is True
    assert ex_1.match.total_plies >= 2

    db.step_exhibition_match_if_needed(ex_1.match.id, min_interval_sec=0.0)
    details_after_step = db.get_match_with_details(ex_1.match.id)
    assert details_after_step is not None
    assert details_after_step.match.total_plies == ex_1.match.total_plies + 1
    assert details_after_step.moves[-1].win_percent_white is not None

