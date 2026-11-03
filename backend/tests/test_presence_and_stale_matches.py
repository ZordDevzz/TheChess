from __future__ import annotations

from datetime import datetime, timezone, timedelta
import pytest
from main import db_manager, topic_hub


def create_match_helper(client, headers, **overrides) -> dict:
    payload = {
        "mode": "online",
        "status": "playing",
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


def test_ws_updates_user_connection_state(client, players):
    alice = players["alice"]
    bob = players["bob"]

    match_data = create_match_helper(
        client,
        alice["headers"],
        white_user_id=alice["id"],
        black_user_id=bob["id"],
        status="playing",
    )
    match_id = match_data["match"]["id"]

    # Ban đầu trong DB white_connected = 1, black_connected = 1
    m = db_manager.get_match_record(match_id)
    assert m.white_connected is True

    # Giả lập Alice kết nối WS rồi ngắt kết nối
    with client.websocket_connect(f"/api/ws?token={alice['token']}"):
        assert topic_hub.is_user_connected(alice["id"]) is True
        m = db_manager.get_match_record(match_id)
        assert m.white_connected is True

    # Sau khi Alice disconnect:
    assert topic_hub.is_user_connected(alice["id"]) is False
    m = db_manager.get_match_record(match_id)
    assert m.white_connected is False


def test_sweep_stale_timed_out_match(client, players):
    alice = players["alice"]
    bob = players["bob"]

    match_data = create_match_helper(
        client,
        alice["headers"],
        white_user_id=alice["id"],
        black_user_id=bob["id"],
        status="playing",
        time_control_type="blitz",
        initial_time_ms=10_000,  # 10s
    )
    match_id = match_data["match"]["id"]

    # Đi 2 nước để total_plies > 1
    client.post(
        f"/api/matches/{match_id}/move",
        json={"uci": "e2e4", "san": "e4", "turn": "w", "player_user_id": alice["id"]},
        headers=alice["headers"],
    )
    client.post(
        f"/api/matches/{match_id}/move",
        json={"uci": "e7e5", "san": "e5", "turn": "b", "player_user_id": bob["id"]},
        headers=bob["headers"],
    )

    # Giả lập thời gian đã trôi qua 20s (quá 10s)
    future_time = datetime.now(timezone.utc) + timedelta(seconds=20)
    finished, aborted = db_manager.sweep_stale_matches(now_dt=future_time)

    assert any(m.id == match_id for m in finished)
    m = db_manager.get_match_record(match_id)
    assert m.status == "finished"
    assert m.termination == "Hết thời gian"


def test_sweep_stale_early_abandonment_aborts(client, players):
    alice = players["alice"]
    bob = players["bob"]

    match_data = create_match_helper(
        client,
        alice["headers"],
        white_user_id=alice["id"],
        black_user_id=bob["id"],
        status="playing",
    )
    match_id = match_data["match"]["id"]

    # White mất kết nối và chưa đi nước nào (total_plies == 0)
    db_manager.set_user_connection_state(alice["id"], connected=False)

    future_time = datetime.now(timezone.utc) + timedelta(seconds=70)
    finished, aborted = db_manager.sweep_stale_matches(now_dt=future_time)

    assert any(m.id == match_id for m in aborted)
    m = db_manager.get_match_record(match_id)
    assert m.status == "aborted"
    assert "Hủy ván" in (m.termination or "")


def test_sweep_abandoned_waiting_room(client, players):
    alice = players["alice"]

    created = client.post(
        "/api/matches",
        json={
            "mode": "online",
            "status": "waiting",
            "white_user_id": alice["id"],
            "black_user_id": alice["id"],
            "generate_room_code": True,
        },
        headers=alice["headers"],
    ).json()
    match_id = created["match"]["id"]

    # Alice disconnect và phòng chờ quá 300s
    db_manager.set_user_connection_state(alice["id"], connected=False)
    future_time = datetime.now(timezone.utc) + timedelta(seconds=350)
    finished, aborted = db_manager.sweep_stale_matches(now_dt=future_time)

    assert any(m.id == match_id for m in aborted)
    m = db_manager.get_match_record(match_id)
    assert m.status == "aborted"


def test_lobby_excludes_inactive_match_from_featured(client, players):
    alice = players["alice"]
    bob = players["bob"]
    carol = players["carol"]

    # Tạo ván Alice vs Bob
    match_data = create_match_helper(
        client,
        alice["headers"],
        white_user_id=alice["id"],
        black_user_id=bob["id"],
        status="playing",
    )
    match_id = match_data["match"]["id"]

    # Cả Alice và Bob đều disconnect
    db_manager.set_user_connection_state(alice["id"], connected=False)
    db_manager.set_user_connection_state(bob["id"], connected=False)

    # Đặt last_seen_at của cả hai về 10 phút trước
    old_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    with db_manager.connection() as conn:
        conn.execute('UPDATE "user" SET last_seen_at = ? WHERE id IN (?, ?)', (old_time, alice["id"], bob["id"]))
        conn.execute('UPDATE "match" SET started_at = ?, created_at = ? WHERE id = ?', (old_time, old_time, match_id))

    # Carol xem Sảnh
    lobby = client.get("/api/lobby", headers=carol["headers"]).json()
    featured = lobby.get("featured_match")

    # Trận Alice vs Bob bất động và cả hai offline -> Không được chọn làm featured stream!
    if featured:
        assert featured["match"]["id"] != match_id
