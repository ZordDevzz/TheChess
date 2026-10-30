"""
Chat & Notifications — integration tests cho module channels thống nhất.

Phủ:
1. Chat Sảnh (lobby): gửi/nhận, rate limit 5 tin/10s, body rỗng -> 400.
2. Chat DM: đúng 2 thành viên; người ngoài (carol) đọc/gửi -> 403.
3. Chat trận: gửi khi playing OK; ván kết thúc -> khóa gửi (403) nhưng retain lịch sử.
4. Admin xóa tin chat; player thường -> 403.
5. Notifications: challenge (tạo phòng online), turn (đối thủ tới lượt),
   match_finished; unread count + mark read.
6. WS authorize: subscribe dm/user topic của người khác -> error (không được).
7. WS broadcast: gửi chat lobby qua REST -> subscriber nhận event "chat".
"""

from __future__ import annotations

import pytest

import main  # noqa: E402 - cần truy cập _chat_rate_buckets để reset rate limit

from test_api_integration import create_match, make_playing_match, send_move

pytestmark = pytest.mark.usefixtures("players")


@pytest.fixture(autouse=True)
def _reset_chat_rate_limit():
    main._chat_rate_buckets.clear()
    yield
    main._chat_rate_buckets.clear()


def dm_topic(a_id: str, b_id: str) -> str:
    """Topic DM luôn sort 2 id để 2 phía ra cùng 1 topic."""
    lo, hi = sorted([a_id, b_id])
    return f"dm:{lo}:{hi}"


# ---------------------------------------------------------------------------
# 1) Chat Sảnh
# ---------------------------------------------------------------------------
def test_lobby_chat_send_and_list(client, players):
    h = players["alice"]["headers"]
    resp = client.post("/api/chat/lobby/messages", json={"body": "Chào Sảnh!"}, headers=h)
    assert resp.status_code == 200, resp.text
    msg = resp.json()
    assert msg["topic"] == "lobby"
    assert msg["body"] == "Chào Sảnh!"
    assert msg["sender_id"] == players["alice"]["id"]

    resp = client.get("/api/chat/lobby/messages", headers=h)
    assert resp.status_code == 200
    messages = resp.json()["messages"]
    assert any(m["id"] == msg["id"] for m in messages)


def test_lobby_chat_empty_body_400(client, players):
    resp = client.post(
        "/api/chat/lobby/messages", json={"body": "   "}, headers=players["alice"]["headers"]
    )
    assert resp.status_code == 400


def test_lobby_chat_invalid_topic_400(client, players):
    resp = client.post(
        "/api/chat/global/messages", json={"body": "hi"}, headers=players["alice"]["headers"]
    )
    assert resp.status_code == 400


def test_chat_rate_limit_429(client, players):
    h = players["bob"]["headers"]
    for _ in range(5):
        resp = client.post("/api/chat/lobby/messages", json={"body": "spam?"}, headers=h)
        assert resp.status_code == 200
    resp = client.post("/api/chat/lobby/messages", json={"body": "tin thứ 6"}, headers=h)
    assert resp.status_code == 429
    # Người khác / topic khác không bị ảnh hưởng
    resp = client.post(
        "/api/chat/lobby/messages", json={"body": "ko liên quan"}, headers=players["alice"]["headers"]
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 2) Chat DM
# ---------------------------------------------------------------------------
def test_dm_chat_between_members(client, players):
    alice, bob = players["alice"], players["bob"]
    topic = dm_topic(alice["id"], bob["id"])
    resp = client.post(f"/api/chat/{topic}/messages", json={"body": "chơi ván không?"}, headers=alice["headers"])
    assert resp.status_code == 200, resp.text
    resp = client.get(f"/api/chat/{topic}/messages", headers=bob["headers"])
    assert resp.status_code == 200
    assert resp.json()["messages"][-1]["body"] == "chơi ván không?"
    # DM tới người nhận offline -> bob có notification kind 'dm'
    resp = client.get("/api/notifications", headers=bob["headers"])
    kinds = [n["kind"] for n in resp.json()["notifications"]]
    assert "dm" in kinds


def test_dm_chat_forbidden_for_outsider(client, players):
    alice, bob, carol = players["alice"], players["bob"], players["carol"]
    topic = dm_topic(alice["id"], bob["id"])
    assert client.get(f"/api/chat/{topic}/messages", headers=carol["headers"]).status_code == 403
    resp = client.post(f"/api/chat/{topic}/messages", json={"body": "cho tôi vào"}, headers=carol["headers"])
    assert resp.status_code == 403


def test_dm_topic_wrong_format_400(client, players):
    resp = client.post(
        "/api/chat/dm:only-one/messages", json={"body": "x"}, headers=players["alice"]["headers"]
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 3) Chat trận: retain sau kết thúc + khóa gửi
# ---------------------------------------------------------------------------
def test_match_chat_locked_after_finish_but_retained(client, players):
    alice, bob = players["alice"], players["bob"]
    match = make_playing_match(client, players)
    topic = f"match:{match['match']['id']}"

    resp = client.post(f"/api/chat/{topic}/messages", json={"body": "nước hay đấy!"}, headers=alice["headers"])
    assert resp.status_code == 200
    msg_id = resp.json()["id"]

    # Khán giả cũng đọc được chat trận
    resp = client.get(f"/api/chat/{topic}/messages", headers=players["carol"]["headers"])
    assert resp.status_code == 200

    # Kết thúc ván (alice đầu hàng)
    resp = client.post(
        f"/api/matches/{match['match']['id']}/finish",
        json={"action": "resign"},
        headers=alice["headers"],
    )
    assert resp.status_code == 200

    # Khóa gửi...
    resp = client.post(f"/api/chat/{topic}/messages", json={"body": "gg"}, headers=bob["headers"])
    assert resp.status_code == 403
    # ...nhưng lịch sử vẫn còn
    resp = client.get(f"/api/chat/{topic}/messages", headers=alice["headers"])
    assert resp.status_code == 200
    assert any(m["id"] == msg_id for m in resp.json()["messages"])


# ---------------------------------------------------------------------------
# 4) Admin xóa tin chat
# ---------------------------------------------------------------------------
def test_admin_delete_chat_message(client, players, admin):
    h = players["alice"]["headers"]
    resp = client.post("/api/chat/lobby/messages", json={"body": "tin cần xóa"}, headers=h)
    msg_id = resp.json()["id"]

    # Player thường không được xóa
    assert (
        client.delete(f"/api/chat/messages/{msg_id}", headers=h).status_code == 403
    )
    resp = client.delete(f"/api/chat/messages/{msg_id}", headers=admin["headers"])
    assert resp.status_code == 204
    messages = client.get("/api/chat/lobby/messages", headers=h).json()["messages"]
    assert not any(m["id"] == msg_id for m in messages)
    # Xóa lần 2 -> 404
    assert (
        client.delete(f"/api/chat/messages/{msg_id}", headers=admin["headers"]).status_code == 404
    )


# ---------------------------------------------------------------------------
# 5) Notifications: challenge / turn / match_finished / unread / mark read
# ---------------------------------------------------------------------------
def test_challenge_notification_on_online_match_creation(client, players):
    alice, bob = players["alice"], players["bob"]
    match = create_match(
        client,
        alice["headers"],
        status="waiting",
        white_user_id=alice["id"],
        black_user_id=bob["id"],
    )
    resp = client.get("/api/notifications", headers=bob["headers"])
    challenges = [
        n
        for n in resp.json()["notifications"]
        if n["kind"] == "challenge" and n["payload"]["match_id"] == match["match"]["id"]
    ]
    assert challenges, "bob phải nhận notification challenge khi alice tạo phòng nhắm vào bob"
    assert challenges[0]["payload"]["from_display_name"] == "Alice"
    # Người tạo không tự notify chính mình
    resp = client.get("/api/notifications", headers=alice["headers"])
    assert not [
        n
        for n in resp.json()["notifications"]
        if n["kind"] == "challenge" and n["payload"]["match_id"] == match["match"]["id"]
    ]


def test_turn_and_finished_notifications(client, players):
    alice, bob = players["alice"], players["bob"]
    match = make_playing_match(client, players)
    match_id = match["match"]["id"]

    # Alice đi nước đầu -> tới lượt bob (human) -> notify 'turn'
    resp = send_move(client, alice["headers"], match_id, alice["id"], "e2e4")
    assert resp.status_code == 200, resp.text

    resp = client.get("/api/notifications", headers=bob["headers"])
    turns = [
        n
        for n in resp.json()["notifications"]
        if n["kind"] == "turn" and n["payload"]["match_id"] == match_id
    ]
    assert turns, "bob phải nhận notification 'turn' sau nước của alice"
    # 'turn' chỉ giữ 1 tin chưa đọc mới nhất
    assert all(n["read_at"] is None for n in turns)
    unread_before = resp.json()["unread"]
    assert unread_before >= 1

    # Kết thúc ván -> cả 2 kỳ thủ nhận 'match_finished'
    resp = client.post(
        f"/api/matches/{match_id}/finish",
        json={"action": "resign"},
        headers=bob["headers"],
    )
    assert resp.status_code == 200
    for p in (alice, bob):
        resp = client.get("/api/notifications", headers=p["headers"])
        finished = [
            n
            for n in resp.json()["notifications"]
            if n["kind"] == "match_finished" and n["payload"]["match_id"] == match_id
        ]
        assert finished, f"{p['user']['username']} phải nhận 'match_finished'"


def test_mark_notifications_read(client, players):
    bob = players["bob"]
    resp = client.get("/api/notifications", headers=bob["headers"])
    unread = resp.json()["unread"]
    if unread == 0:
        pytest.skip("bob chưa có notification chưa đọc trong session này")
    resp = client.post("/api/notifications/read", json={}, headers=bob["headers"])
    assert resp.status_code == 200
    assert resp.json()["unread"] == 0
    assert resp.json()["marked"] == unread


def test_mention_creates_notification(client, players):
    """@username trong chat -> notification kind 'mention' cho người được nhắc."""
    alice, bob = players["alice"], players["bob"]
    resp = client.post(
        "/api/chat/lobby/messages",
        json={"body": "chào @bob coi ván này với"},
        headers=alice["headers"],
    )
    assert resp.status_code == 200, resp.text

    resp = client.get("/api/notifications", headers=bob["headers"])
    mentions = [
        n
        for n in resp.json()["notifications"]
        if n["kind"] == "mention" and n["payload"]["from_display_name"] == "Alice"
    ]
    assert mentions, "bob phải nhận notification 'mention' khi alice nhắc @bob"
    assert "chào @bob" in mentions[0]["payload"]["preview"]

    # Không tự nhắc chính mình, không nhắc user không tồn tại
    resp = client.post(
        "/api/chat/lobby/messages",
        json={"body": "@alice tự nhắc @khongtontai999"},
        headers=alice["headers"],
    )
    assert resp.status_code == 200
    resp = client.get("/api/notifications", headers=alice["headers"])
    assert not [n for n in resp.json()["notifications"] if n["kind"] == "mention"]


# ---------------------------------------------------------------------------
# 6) WS authorize: topic riêng tư
# ---------------------------------------------------------------------------
def test_ws_authorize_private_topics(client, players):
    alice, bob, carol = players["alice"], players["bob"], players["carol"]
    topic = dm_topic(alice["id"], bob["id"])

    # Thành viên subscribe OK
    with client.websocket_connect(f"/api/ws?token={alice['token']}") as ws:
        ws.send_json({"action": "subscribe", "topic": topic})
        assert ws.receive_json()["type"] == "subscribed"
        ws.send_json({"action": "subscribe", "topic": f"user:{alice['id']}"})
        assert ws.receive_json()["type"] == "subscribed"

    # Người ngoài subscribe dm/user của người khác -> error
    with client.websocket_connect(f"/api/ws?token={carol['token']}") as ws:
        ws.send_json({"action": "subscribe", "topic": topic})
        resp = ws.receive_json()
        assert resp["type"] == "error"
        ws.send_json({"action": "subscribe", "topic": f"user:{alice['id']}"})
        resp = ws.receive_json()
        assert resp["type"] == "error"


# ---------------------------------------------------------------------------
# 7) WS broadcast event "chat" cho subscriber của topic
# ---------------------------------------------------------------------------
def test_ws_chat_broadcast(client, players):
    alice = players["alice"]
    with client.websocket_connect(f"/api/ws?token={alice['token']}") as ws:
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"
        ws.send_json({"action": "subscribe", "topic": "lobby"})
        assert ws.receive_json()["type"] == "subscribed"

        resp = client.post(
            "/api/chat/lobby/messages",
            json={"body": "event realtime!"},
            headers=alice["headers"],
        )
        assert resp.status_code == 200
        event = ws.receive_json()
        assert event["type"] == "chat"
        assert event["topic"] == "lobby"
        assert event["body"] == "event realtime!"
        assert event["sender_id"] == alice["id"]
