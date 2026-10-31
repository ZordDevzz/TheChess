"""
P1-3: API Integration Tests — полный multiplayer flow + regression cho các bản vá
Broken Access Control (IDOR) trên /api/matches/{id}/move|takeback|finish.

Các luật bảo mật được regression-test:
1. Move: caller phải là kỳ thủ của ván; `player_user_id` phải là chính caller,
   NGOẠI LỆ được đi thay cho bot AI đang tham gia ván (vs_ai proxy).
   Mạo danh người thật khác -> 403.
2. Takeback: người ngoài cuộc -> 403; kỳ thủ của ván có allow_takeback=false -> 403.
3. Finish: người ngoài cuộc -> 403; kỳ thủ -> 200.
4. Admin bypass mọi kiểm tra participant.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.usefixtures("players")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def create_match(client, headers, **overrides) -> dict:
    payload = {
        "mode": "online",
        "status": "waiting",
        "white_user_id": None,
        "black_user_id": None,
        "time_control_type": "rapid",
        "initial_time_ms": 300_000,
        "increment_ms": 2_000,
        "generate_room_code": True,
    }
    payload.update(overrides)
    resp = client.post("/api/matches", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def make_playing_match(client, players, **overrides) -> dict:
    """Trận online alice (Trắng) vs bob (Đen) đang `playing`."""
    return create_match(
        client,
        players["alice"]["headers"],
        status="playing",
        white_user_id=players["alice"]["id"],
        black_user_id=players["bob"]["id"],
        generate_room_code=False,
        **overrides,
    )


def send_move(client, headers, match_id: str, player_user_id: str, uci: str):
    return client.post(
        f"/api/matches/{match_id}/move",
        json={"player_user_id": player_user_id, "uci": uci},
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def test_admin_login_success(client):
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "integration-test-admin-pass"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"]
    assert data["user"]["role"] == "admin"
    assert data["user"]["username"] == "admin"


def test_admin_login_wrong_password_401(client):
    resp = client.post(
        "/api/auth/login", json={"username": "admin", "password": "wrong-password"}
    )
    assert resp.status_code == 401


def test_auth_me_without_token_401(client):
    assert client.get("/api/auth/me").status_code == 401


def test_auth_me_with_garbage_token_401(client):
    resp = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert resp.status_code == 401


def test_auth_me_returns_current_user(client, players):
    resp = client.get("/api/auth/me", headers=players["alice"]["headers"])
    assert resp.status_code == 200
    assert resp.json()["username"] == "alice"


def test_unauthenticated_requests_401(client):
    assert client.get("/api/lobby").status_code == 401
    assert client.post("/api/matches", json={}).status_code == 401
    assert (
        client.post(
            "/api/matches/whatever/move", json={"player_user_id": "x", "uci": "e2e4"}
        ).status_code
        == 401
    )


# ---------------------------------------------------------------------------
# Admin endpoints & phân quyền
# ---------------------------------------------------------------------------
def test_player_forbidden_on_admin_endpoints(client, players):
    for method, path in (
        ("get", "/api/admin/overview"),
        ("post", "/api/admin/users"),
        ("post", "/api/admin/users/some-id/quick-link"),
        ("post", "/api/admin/matches/some-id/abort"),
    ):
        if method == "post":
            resp = client.post(path, json={}, headers=players["alice"]["headers"])
        else:
            resp = client.get(path, headers=players["alice"]["headers"])
        assert resp.status_code == 403, f"{method.upper()} {path} -> {resp.status_code}"


def test_admin_create_user_returns_quick_login_token(client, admin):
    resp = client.post(
        "/api/admin/users",
        json={
            "username": "dave",
            "password": "dave-pass-123",
            "display_name": "Dave",
        },
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user"]["username"] == "dave"
    assert data["user"]["role"] == "player"
    assert data["quick_login_token"]
    # Đăng nhập bằng mật khẩu ban đầu phải thành công
    login = client.post(
        "/api/auth/login", json={"username": "dave", "password": "dave-pass-123"}
    )
    assert login.status_code == 200


def test_admin_overview_lists_players(client, admin, players):
    resp = client.get("/api/admin/overview", headers=admin["headers"])
    assert resp.status_code == 200
    usernames = {u["username"] for u in resp.json()["users"]}
    assert {"admin", "alice", "bob", "carol"} <= usernames


# ---------------------------------------------------------------------------
# Quick-Link
# ---------------------------------------------------------------------------
def test_quick_link_then_quick_login_flow(client, admin, players):
    resp = client.post(
        f"/api/admin/users/{players['bob']['id']}/quick-link",
        headers=admin["headers"],
    )
    assert resp.status_code == 200
    quick_token = resp.json()["quick_login_token"]

    login = client.post("/api/auth/quick-login", json={"login_token": quick_token})
    assert login.status_code == 200, login.text
    session_token = login.json()["token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {session_token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "bob"


def test_quick_link_with_settings_must_change_password_and_reset(client, admin, players):
    user_id = players["bob"]["id"]

    # 1. Tạo link đầu tiên với must_change_password=True
    resp1 = client.post(
        f"/api/admin/users/{user_id}/quick-link",
        headers=admin["headers"],
        json={"must_change_password": True, "ttl_days": 7},
    )
    assert resp1.status_code == 200
    token1 = resp1.json()["quick_login_token"]
    assert resp1.json()["user"]["must_change_password"] is True

    # 2. Tạo link thứ 2 với reset_previous_links=True và must_change_password=False
    resp2 = client.post(
        f"/api/admin/users/{user_id}/quick-link",
        headers=admin["headers"],
        json={"must_change_password": False, "reset_previous_links": True, "ttl_days": 1},
    )
    assert resp2.status_code == 200
    token2 = resp2.json()["quick_login_token"]
    assert resp2.json()["user"]["must_change_password"] is False

    # Token 1 phải bị vô hiệu hóa vì reset_previous_links đã tăng epoch
    login1 = client.post("/api/auth/quick-login", json={"login_token": token1})
    assert login1.status_code == 401

    # Token 2 phải hoạt động bình thường
    login2 = client.post("/api/auth/quick-login", json={"login_token": token2})
    assert login2.status_code == 200
    assert login2.json()["user"]["must_change_password"] is False


def test_quick_login_rejects_session_token(client, players):
    # Session token không được dùng làm quick-login token (sai `purpose`)
    resp = client.post(
        "/api/auth/quick-login", json={"login_token": players["alice"]["token"]}
    )
    assert resp.status_code == 401


def test_quick_login_rejects_garbage_token(client):
    resp = client.post("/api/auth/quick-login", json={"login_token": "x" * 20})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Full online match flow
# ---------------------------------------------------------------------------
def test_waiting_match_create_join_and_moves(client, players):
    alice, bob = players["alice"], players["bob"]

    created = create_match(
        client,
        alice["headers"],
        white_user_id=alice["id"],
        black_user_id=alice["id"],  # chờ bạn bè vào
    )
    match = created["match"]
    assert match["status"] == "waiting"
    assert match["room_code"]
    assert created["black_player"]["id"] == alice["id"]

    # Bob tham gia bằng room code -> playing, đen là bob
    joined = client.post(
        "/api/matches/join",
        json={"room_code_or_id": match["room_code"]},
        headers=bob["headers"],
    )
    assert joined.status_code == 200, joined.text
    assert joined.json()["match"]["status"] == "playing"
    assert joined.json()["black_player"]["id"] == bob["id"]

    match_id = match["id"]

    # Alice đi e2e4
    r1 = send_move(client, alice["headers"], match_id, alice["id"], "e2e4")
    assert r1.status_code == 200, r1.text
    m1 = r1.json()["match"]
    assert m1["total_plies"] == 1
    assert m1["current_turn"] == "b"
    assert r1.json()["moves"][0]["san"] == "e4"

    # Bob đáp e7e5
    r2 = send_move(client, bob["headers"], match_id, bob["id"], "e7e5")
    assert r2.status_code == 200, r2.text
    assert r2.json()["match"]["total_plies"] == 2

    # GET chi tiết ván
    detail = client.get(f"/api/matches/{match_id}", headers=alice["headers"])
    assert detail.status_code == 200
    assert len(detail.json()["moves"]) == 2


def test_join_nonexistent_room_404(client, players):
    resp = client.post(
        "/api/matches/join",
        json={"room_code_or_id": "ZZZZZZ"},
        headers=players["bob"]["headers"],
    )
    assert resp.status_code == 404


def test_lobby_lists_matches_and_bots(client, players):
    alice, bob = players["alice"], players["bob"]
    created = create_match(
        client,
        alice["headers"],
        white_user_id=alice["id"],
        black_user_id=alice["id"],
    )

    lobby = client.get(
        "/api/lobby", params={"step_exhibition": "false"}, headers=bob["headers"]
    )
    assert lobby.status_code == 200
    data = lobby.json()
    waiting_ids = {w["match"]["id"] for w in data["waiting_matches"]}
    assert created["match"]["id"] in waiting_ids
    assert data["bots"], "Phải seed sẵn các bot AI"


def test_lobby_live_matches_sorting_stability_on_moves(client, players):
    """Khi có ván đi nước mới, danh sách live_matches và featured_match không bị nhảy thứ tự."""
    alice, bob, carol = players["alice"], players["bob"], players["carol"]

    # Tạo 2 trận đang chơi
    m1 = create_match(
        client,
        alice["headers"],
        mode="online",
        status="playing",
        white_user_id=alice["id"],
        black_user_id=bob["id"],
    )["match"]

    m2 = create_match(
        client,
        bob["headers"],
        mode="online",
        status="playing",
        white_user_id=bob["id"],
        black_user_id=alice["id"],
    )["match"]

    # Người xem độc lập (carol) xem sảnh
    lobby1 = client.get(
        "/api/lobby", params={"step_exhibition": "false"}, headers=carol["headers"]
    ).json()

    live_ids_1 = [item["match"]["id"] for item in lobby1["live_matches"]]
    featured_id_1 = lobby1["featured_match"]["match"]["id"]
    assert len(live_ids_1) >= 2

    # Match ở vị trí thứ 2 đi 1 nước (cập nhật last_move_at)
    second_match_id = live_ids_1[1]
    second_is_m1 = second_match_id == m1["id"]
    mover = alice if second_is_m1 else bob
    send_move(client, mover["headers"], second_match_id, mover["id"], "e2e4")

    # Fetch lại sảnh
    lobby2 = client.get(
        "/api/lobby", params={"step_exhibition": "false"}, headers=carol["headers"]
    ).json()
    live_ids_2 = [item["match"]["id"] for item in lobby2["live_matches"]]
    featured_id_2 = lobby2["featured_match"]["match"]["id"]

    # Thứ tự các bàn live và featured_match phải GIỮ NGUYÊN HOÀN TOÀN
    assert live_ids_2 == live_ids_1
    assert featured_id_2 == featured_id_1


def test_lobby_waiting_matches_prioritize_direct_challenge(client, players):
    """Phòng chờ thách đấu trực tiếp tới tôi được xếp ưu tiên hàng đầu."""
    alice, bob, carol = players["alice"], players["bob"], players["carol"]

    # Alice tạo phòng chờ công khai (chờ bất kỳ ai)
    public_room = create_match(
        client,
        alice["headers"],
        status="waiting",
        white_user_id=alice["id"],
        black_user_id=alice["id"],
    )["match"]

    # Carol tạo phòng thách đấu trực tiếp tới Bob
    challenge_to_bob = create_match(
        client,
        carol["headers"],
        status="waiting",
        white_user_id=carol["id"],
        black_user_id=bob["id"],
    )["match"]

    # Bob vào sảnh: phòng challenge_to_bob phải đứng trước public_room
    lobby_bob = client.get(
        "/api/lobby", params={"step_exhibition": "false"}, headers=bob["headers"]
    ).json()

    waiting_ids = [w["match"]["id"] for w in lobby_bob["waiting_matches"]]
    assert challenge_to_bob["id"] in waiting_ids
    assert public_room["id"] in waiting_ids
    assert waiting_ids.index(challenge_to_bob["id"]) < waiting_ids.index(public_room["id"])


# ---------------------------------------------------------------------------
# IDOR / Broken Access Control regressions
# ---------------------------------------------------------------------------
def test_move_impersonating_other_human_403(client, players):
    """Bob mạo danh alice (người thật) khi tới lượt alice -> 403."""
    alice, bob = players["alice"], players["bob"]
    match = make_playing_match(client, players)

    resp = send_move(client, bob["headers"], match["match"]["id"], alice["id"], "e2e4")
    assert resp.status_code == 403

    # Ván không bị ảnh hưởng
    detail = client.get(f"/api/matches/{match['match']['id']}", headers=alice["headers"])
    assert detail.json()["match"]["total_plies"] == 0


def test_move_wrong_side_player_403(client, players):
    """Bob tự khai player_user_id=bob nhưng đang là lượt Trắng của alice -> 403."""
    alice, bob = players["alice"], players["bob"]
    match = make_playing_match(client, players)

    resp = send_move(client, bob["headers"], match["match"]["id"], bob["id"], "e2e4")
    assert resp.status_code == 403


def test_outsider_move_403(client, players):
    match = make_playing_match(client, players)
    resp = send_move(
        client,
        players["carol"]["headers"],
        match["match"]["id"],
        players["alice"]["id"],
        "e2e4",
    )
    assert resp.status_code == 403


def test_outsider_takeback_403(client, players):
    match = make_playing_match(client, players, allow_takeback=True)
    resp = client.post(
        f"/api/matches/{match['match']['id']}/takeback",
        json={"target_ply": 0},
        headers=players["carol"]["headers"],
    )
    assert resp.status_code == 403


def test_outsider_finish_403(client, players):
    match = make_playing_match(client, players)
    resp = client.post(
        f"/api/matches/{match['match']['id']}/finish",
        json={"action": "resign"},
        headers=players["carol"]["headers"],
    )
    assert resp.status_code == 403
    # Ván vẫn đang chơi
    detail = client.get(
        f"/api/matches/{match['match']['id']}", headers=players["alice"]["headers"]
    )
    assert detail.json()["match"]["status"] == "playing"


# ---------------------------------------------------------------------------
# Takeback
# ---------------------------------------------------------------------------
def test_takeback_allowed_resets_mainline(client, players):
    alice, bob = players["alice"], players["bob"]
    created = make_playing_match(client, players, allow_takeback=True)
    match_id = created["match"]["id"]

    assert send_move(client, alice["headers"], match_id, alice["id"], "e2e4").status_code == 200
    assert send_move(client, bob["headers"], match_id, bob["id"], "e7e5").status_code == 200

    resp = client.post(
        f"/api/matches/{match_id}/takeback",
        json={"target_ply": 0},
        headers=alice["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["match"]["total_plies"] == 0
    assert data["match"]["current_turn"] == "w"
    assert data["match"]["current_fen"] == created["match"]["initial_fen"]
    assert data["moves"] == []
    assert len(data["variations"]) == 2  # soft-branch giữ lại lịch sử

    # Sau takeback, alice có thể đi lại nước khác
    again = send_move(client, alice["headers"], match_id, alice["id"], "d2d4")
    assert again.status_code == 200
    assert again.json()["match"]["total_plies"] == 1


def test_takeback_forbidden_when_disallowed(client, players):
    created = make_playing_match(client, players, allow_takeback=False)
    match_id = created["match"]["id"]
    assert send_move(client, players["alice"]["headers"], match_id, players["alice"]["id"], "e2e4").status_code == 200

    resp = client.post(
        f"/api/matches/{match_id}/takeback",
        json={"target_ply": 0},
        headers=players["alice"]["headers"],
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Finish & Elo
# ---------------------------------------------------------------------------
def test_participant_finish_resignation_updates_ratings(client, players):
    alice, bob = players["alice"], players["bob"]
    created = make_playing_match(client, players)  # is_rated mặc định True
    match_id = created["match"]["id"]
    assert send_move(client, alice["headers"], match_id, alice["id"], "e2e4").status_code == 200

    # Bob (Đen) đầu hàng -> SERVER tính result 1-0, alice (Trắng) thắng.
    # Regression: trước đây client tự khai result và server tin mù (bob thua
    # mà vẫn khai "0-1" thắng được).
    resp = client.post(
        f"/api/matches/{match_id}/finish",
        json={"action": "resign"},
        headers=bob["headers"],
    )
    assert resp.status_code == 200, resp.text
    match = resp.json()["match"]
    assert match["status"] == "finished"
    assert match["result"] == "1-0"
    assert match["winner_user_id"] == alice["id"]
    assert match["termination"] == "Đầu hàng"
    assert match["white_rating_delta"] is not None
    assert match["black_rating_delta"] is not None
    assert match["white_rating_delta"] > 0
    assert match["black_rating_delta"] < 0
    assert match["pgn"]

    # Elo của user cũng được cập nhật
    profile = client.get(
        f"/api/users/{bob['id']}/profile", headers=bob["headers"]
    )
    assert profile.status_code == 200
    assert profile.json()["user"]["rating"] == match["black_rating_after"]

    # Không thể đi nước trên ván đã kết thúc
    late = send_move(client, alice["headers"], match_id, alice["id"], "e7e5")
    assert late.status_code == 400


def test_admin_finish_bypasses_participation(client, admin, players):
    """Admin không tham gia ván nhưng vẫn được kết thúc ván (admin bypass)."""
    created = make_playing_match(client, players)
    resp = client.post(
        f"/api/matches/{created['match']['id']}/finish",
        json={"result": "1/2-1/2", "termination": "admin_decision"},
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["match"]["status"] == "finished"


def test_admin_abort_match(client, admin, players):
    created = create_match(
        client,
        players["alice"]["headers"],
        white_user_id=players["alice"]["id"],
        black_user_id=players["alice"]["id"],
    )
    match_id = created["match"]["id"]

    # Kỳ thủ thường không được abort qua admin endpoint
    denied = client.post(
        f"/api/admin/matches/{match_id}/abort", headers=players["alice"]["headers"]
    )
    assert denied.status_code == 403

    ok = client.post(f"/api/admin/matches/{match_id}/abort", headers=admin["headers"])
    assert ok.status_code == 200
    assert ok.json()["status"] == "aborted"


# ---------------------------------------------------------------------------
# vs_ai proxy: được đi thay nước cho bot tham gia ván
# ---------------------------------------------------------------------------
def test_vs_ai_proxy_move_for_bot_participant(client, players):
    alice = players["alice"]
    lobby = client.get(
        "/api/lobby", params={"step_exhibition": "false"}, headers=alice["headers"]
    )
    bot = next(b for b in lobby.json()["bots"] if b["bot_engine"] == "maia")

    created = create_match(
        client,
        alice["headers"],
        mode="vs_ai",
        status="playing",
        white_user_id=alice["id"],
        black_user_id=bot["id"],
        generate_room_code=False,
    )
    match_id = created["match"]["id"]

    # Người đi nước của chính mình
    r1 = send_move(client, alice["headers"], match_id, alice["id"], "e2e4")
    assert r1.status_code == 200
    assert r1.json()["match"]["total_plies"] == 1

    # Cùng người đó đi thay bot (bot là participant, is_bot=True) -> được phép
    r2 = send_move(client, alice["headers"], match_id, bot["id"], "e7e5")
    assert r2.status_code == 200, r2.text
    assert r2.json()["match"]["total_plies"] == 2
    assert r2.json()["moves"][1]["player_user_id"] == bot["id"]


def test_vs_ai_cannot_proxy_for_non_participant_bot(client, players):
    """Bot KHÔNG tham gia ván không thể bị mạo danh (phải là participant)."""
    alice = players["alice"]
    lobby = client.get(
        "/api/lobby", params={"step_exhibition": "false"}, headers=alice["headers"]
    )
    in_match = next(b for b in lobby.json()["bots"] if b["bot_engine"] == "maia")
    outsider = next(
        b
        for b in lobby.json()["bots"]
        if b["id"] != in_match["id"] and b["bot_engine"] == "maia"
    )

    created = create_match(
        client,
        alice["headers"],
        mode="vs_ai",
        status="playing",
        white_user_id=alice["id"],
        black_user_id=in_match["id"],
        generate_room_code=False,
    )
    resp = send_move(
        client, alice["headers"], created["match"]["id"], outsider["id"], "e2e4"
    )
    assert resp.status_code == 403


def test_create_match_accepts_bot_username_as_user_id(client, players):
    """Regression: frontend truyền username bot (`bot_maia_1500`) làm user_id phía AI.

    Trước đây create_match chỉ tra theo id (UUID) -> KeyError -> 400 BadRequest
    khi tạo trận vs máy từ trang chủ.
    """
    alice = players["alice"]
    created = create_match(
        client,
        alice["headers"],
        mode="vs_ai",
        status="playing",
        white_user_id=alice["id"],
        black_user_id="bot_maia_1500",
        generate_room_code=False,
    )
    assert created["black_player"]["username"] == "bot_maia_1500"
    # Id trong match phải được chuẩn hóa thành UUID thật của bot
    assert created["match"]["black_user_id"] != "bot_maia_1500"
    assert len(created["match"]["black_user_id"]) == 36


# ---------------------------------------------------------------------------
# Quick-Link lifecycle: link phải sống đủ 14 ngày trừ khi Admin thu hồi/reset
# ---------------------------------------------------------------------------


def _make_quick_link(client, admin, user_id: str) -> str:
    resp = client.post(
        f"/api/admin/users/{user_id}/quick-link", headers=admin["headers"]
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["quick_login_token"]


def test_quick_link_survives_own_password_change(client, admin):
    """Bug cũ: đổi mật khẩu (bắt buộc lần đăng nhập đầu) giết luôn quick link."""
    resp = client.post(
        "/api/admin/users",
        json={
            "username": "quinn",
            "password": "quinn-pass-123",
            "display_name": "Quinn",
        },
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text
    uid = resp.json()["user"]["id"]

    ql = _make_quick_link(client, admin, uid)
    r1 = client.post("/api/auth/quick-login", json={"login_token": ql})
    assert r1.status_code == 200, r1.text
    session_headers = {"Authorization": f"Bearer {r1.json()['token']}"}

    # Luồng bắt buộc đổi mật khẩu ở lần đăng nhập đầu
    r2 = client.post(
        "/api/auth/change-password",
        headers=session_headers,
        json={"new_password": "quinn-new-pass-456"},
    )
    assert r2.status_code == 200, r2.text

    # Link cũ PHẢI còn dùng được sau khi user tự đổi mật khẩu
    r3 = client.post("/api/auth/quick-login", json={"login_token": ql})
    assert r3.status_code == 200, r3.text


def test_quick_link_revoked_by_admin_revoke(client, admin):
    """Dùng user riêng: revoke bump token_version — không giết token alice
    của fixture `players` (session-scoped, dùng chung cho các test sau)."""
    resp = client.post(
        "/api/admin/users",
        json={
            "username": "sam",
            "password": "sam-pass-123",
            "display_name": "Sam",
        },
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text
    uid = resp.json()["user"]["id"]
    ql = _make_quick_link(client, admin, uid)
    assert (
        client.post("/api/auth/quick-login", json={"login_token": ql}).status_code
        == 200
    )
    resp = client.post(
        f"/api/admin/users/{uid}/revoke", headers=admin["headers"]
    )
    assert resp.status_code == 200, resp.text
    again = client.post("/api/auth/quick-login", json={"login_token": ql})
    assert again.status_code == 401


def test_quick_link_revoked_by_admin_password_reset(client, admin):
    resp = client.post(
        "/api/admin/users",
        json={
            "username": "rita",
            "password": "rita-pass-123",
            "display_name": "Rita",
        },
        headers=admin["headers"],
    )
    uid = resp.json()["user"]["id"]
    ql = _make_quick_link(client, admin, uid)
    assert (
        client.post("/api/auth/quick-login", json={"login_token": ql}).status_code
        == 200
    )
    reset = client.patch(
        f"/api/admin/users/{uid}",
        json={"new_password": "rita-reset-789"},
        headers=admin["headers"],
    )
    assert reset.status_code == 200, reset.text
    again = client.post("/api/auth/quick-login", json={"login_token": ql})
    assert again.status_code == 401


# ---------------------------------------------------------------------------
# Realtime hub /api/ws: subscribe theo topic + nhận event từ mutation REST
# ---------------------------------------------------------------------------
def _ws_recv_until(ws, predicate, limit: int = 50) -> dict:
    """Đọc frame tới khi khớp predicate — bỏ qua frame nền (lobby_updated...)
    từ trận exhibition Lab chạy nền trong suite."""
    for _ in range(limit):
        frame = ws.receive_json()
        if predicate(frame):
            return frame
    raise AssertionError("Không nhận được frame mong đợi trong budget")


def test_ws_hub_subscribe_and_receive_events(client, players):
    alice = players["alice"]
    created = make_playing_match(client, players)
    match_id = created["match"]["id"]

    with client.websocket_connect(f"/api/ws?token={alice['token']}") as ws:
        # Subscribe hợp lệ -> ack
        ws.send_json({"action": "subscribe", "topic": "lobby"})
        ack = _ws_recv_until(
            ws, lambda f: f.get("type") == "subscribed" and f.get("topic") == "lobby"
        )
        assert ack == {"type": "subscribed", "topic": "lobby"}

        # Topic tùy ý bị chặn
        ws.send_json({"action": "subscribe", "topic": "hack:whatever"})
        resp = _ws_recv_until(ws, lambda f: f.get("type") == "error")
        assert resp["type"] == "error"

        # Heartbeat qua chính WS (không cần HTTP health check)
        ws.send_text("ping")
        assert _ws_recv_until(ws, lambda f: f.get("type") == "pong")["type"] == "pong"

        # Rời topic lobby để không nhận event nền từ trận exhibition khác.
        # (Server không ack unsubscribe — không đợi frame trả lời.)
        ws.send_json({"action": "unsubscribe", "topic": "lobby"})

        # Subscribe topic trận -> nhận match_updated khi có nước đi qua REST
        ws.send_json({"action": "subscribe", "topic": f"match:{match_id}"})
        assert (
            _ws_recv_until(
                ws,
                lambda f: f.get("type") == "subscribed"
                and f.get("topic") == f"match:{match_id}",
            )["type"]
            == "subscribed"
        )

        r = client.post(
            f"/api/matches/{match_id}/move",
            json={"player_user_id": alice["id"], "uci": "e2e4"},
            headers=alice["headers"],
        )
        assert r.status_code == 200, r.text

        evt = _ws_recv_until(ws, lambda f: f.get("topic") == f"match:{match_id}")
        assert evt["type"] == "match_updated"


def test_ws_hub_rejects_bad_token(client):
    import pytest as _pytest

    with _pytest.raises(Exception):
        with client.websocket_connect("/api/ws?token=khong-hop-le"):
            pass


def test_change_password_requires_current_password(client, admin):
    """Người dùng bình thường (must_change_password=0) bắt buộc phải nhập đúng
    current_password khi đổi mật khẩu."""
    resp = client.post(
        "/api/admin/users",
        json={
            "username": "pwd_test_user",
            "password": "init-pass-1234",
            "display_name": "Pwd User",
        },
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text

    # Lần 1: must_change_password=1 -> đổi thành công không cần current_password
    login1 = client.post(
        "/api/auth/login",
        json={"username": "pwd_test_user", "password": "init-pass-1234"},
    )
    assert login1.status_code == 200, login1.text
    headers1 = {"Authorization": f"Bearer {login1.json()['token']}"}

    r_first_change = client.post(
        "/api/auth/change-password",
        json={"new_password": "first-real-pass-5678"},
        headers=headers1,
    )
    assert r_first_change.status_code == 200, r_first_change.text
    headers2 = {"Authorization": f"Bearer {r_first_change.json()['token']}"}

    # Lần 2: Giờ must_change_password=0. Thử đổi không kèm current_password -> 400
    r_no_curr = client.post(
        "/api/auth/change-password",
        json={"new_password": "another-pass-9999"},
        headers=headers2,
    )
    assert r_no_curr.status_code == 400
    assert "mật khẩu hiện tại" in r_no_curr.text.lower()

    # Thử kèm current_password SAI -> 400
    r_wrong_curr = client.post(
        "/api/auth/change-password",
        json={
            "current_password": "wrong-password",
            "new_password": "another-pass-9999",
        },
        headers=headers2,
    )
    assert r_wrong_curr.status_code == 400
    assert "không chính xác" in r_wrong_curr.text.lower()

    # Thử kèm current_password ĐÚNG -> 200
    r_correct = client.post(
        "/api/auth/change-password",
        json={
            "current_password": "first-real-pass-5678",
            "new_password": "final-pass-123456",
        },
        headers=headers2,
    )
    assert r_correct.status_code == 200, r_correct.text


def test_save_match_review_idor_protection(client, players, admin):
    """Khán giả / người lạ (stranger) không được phép ghi đè kết quả Game Review
    của trận đấu do người khác chơi (chống Broken Access Control)."""
    alice = players["alice"]
    bob = players["bob"]
    carol = players["carol"]

    # Tạo trận giữa Alice và Bob
    r_match = client.post(
        "/api/matches",
        json={
            "mode": "online",
            "status": "playing",
            "white_user_id": alice["id"],
            "black_user_id": bob["id"],
        },
        headers=alice["headers"],
    )
    assert r_match.status_code == 200, r_match.text
    match_id = r_match.json()["match"]["id"]

    payload = {
        "white_accuracy": 99.9,
        "black_accuracy": 12.3,
        "review_summary": {"best": 10},
        "ply_evaluations": [],
    }

    # Carol (người ngoài cuộc / khán giả) cố gắng lưu review trận của Alice & Bob -> 403 Forbidden!
    r_carol_save = client.post(
        f"/api/matches/{match_id}/save-review",
        json=payload,
        headers=carol["headers"],
    )
    assert r_carol_save.status_code == 403, r_carol_save.text
    assert "chỉ kỳ thủ" in r_carol_save.text.lower() or "quyền" in r_carol_save.text.lower()

    # Alice (kỳ thủ trong trận) lưu review -> 200 OK!
    r_alice_save = client.post(
        f"/api/matches/{match_id}/save-review",
        json=payload,
        headers=alice["headers"],
    )
    assert r_alice_save.status_code == 200, r_alice_save.text
    assert r_alice_save.json()["white_accuracy"] == 99.9
