"""
Fixtures dùng chung cho API integration tests.

Quan trọng: đặt biến môi trường (DB file tạm, secret key, admin password)
TRƯỚC khi import `main`, vì `main.db_manager = DatabaseManager()` đọc env
ngay khi import module. conftest.py được pytest nạp trước mọi test module
nên việc set env ở đầu file đảm bảo cả `test_database.py` (import `database`
trực tiếp) cũng không tự sinh file `.secret_key` trong `backend/data/`.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# 1) Cấu hình môi trường TRƯỚC khi import app
# ---------------------------------------------------------------------------
_TMP_BASE = Path("/tmp/opencode")
_TMP_BASE.mkdir(parents=True, exist_ok=True)
_DB_DIR = tempfile.mkdtemp(prefix="thechess_api_tests_", dir=str(_TMP_BASE))

ADMIN_PASSWORD = "integration-test-admin-pass"
PLAYER_PASSWORD = "player-pass-123"

os.environ["THECHESS_DB_PATH"] = str(Path(_DB_DIR) / "thechess_test.db")
os.environ["THECHESS_SECRET_KEY"] = "integration-test-secret-key-do-not-use-in-prod"
os.environ["THECHESS_ADMIN_PASSWORD"] = ADMIN_PASSWORD
# Lab: runner chạy nền bằng engine thật — trong test tắt pacing để trận kết thúc nhanh.
os.environ["THECHESS_LAB_PACING"] = "0,0"
os.environ["THECHESS_LAB_MIN_MOVE"] = "0"

# ---------------------------------------------------------------------------
# 2) Import app SAU khi env đã sẵn sàng
# ---------------------------------------------------------------------------
import main  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient với lifespan (chỉ shutdown engine_manager — an toàn)."""
    with TestClient(main.app) as c:
        yield c


def _login(client: TestClient, username: str, password: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["token"]
    return {
        "token": data["token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


@pytest.fixture(scope="session")
def admin(client):
    """Đăng nhập tài khoản Admin mặc định (seed từ THECHESS_ADMIN_PASSWORD)."""
    return _login(client, "admin", ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def players(client, admin):
    """alice & bob là 2 kỳ thủ, carol là người ngoài cuộc (spectator)."""
    result = {}
    for name in ("alice", "bob", "carol"):
        resp = client.post(
            "/api/admin/users",
            json={
                "username": name,
                "password": PLAYER_PASSWORD,
                "display_name": name.capitalize(),
                "initial_rating": 1500,
            },
            headers=admin["headers"],
        )
        assert resp.status_code == 200, resp.text
        result[name] = _login(client, name, PLAYER_PASSWORD)
        result[name]["id"] = result[name]["user"]["id"]
    return result
