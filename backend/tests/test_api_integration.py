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
        json={"result": "1-0", "termination": "resignation"},
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

    # Bob (Đen) đầu hàng -> alice (Trắng) thắng
    resp = client.post(
        f"/api/matches/{match_id}/finish",
        json={"result": "0-1", "termination": "resignation"},
        headers=bob["headers"],
    )
    assert resp.status_code == 200, resp.text
    match = resp.json()["match"]
    assert match["status"] == "finished"
    assert match["result"] == "0-1"
    assert match["winner_user_id"] == bob["id"]
    assert match["termination"] == "resignation"
    assert match["white_rating_delta"] is not None
    assert match["black_rating_delta"] is not None
    assert match["white_rating_delta"] < 0
    assert match["black_rating_delta"] > 0
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
