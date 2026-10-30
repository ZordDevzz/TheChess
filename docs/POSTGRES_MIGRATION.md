# Kế hoạch Migration SQLite → PostgreSQL (P2-3)

> Trạng thái: **thiết kế** — chưa thay đổi code. Mục tiêu: câu lạc bộ mở rộng hàng chục
> ngàn người chơi, nhiều worker uvicorn, connection pool chuẩn (PgBouncer).

## 1. Vì sao chưa chuyển ngay

- `backend/database.py` dùng SQL thuần + `sqlite3.Row`, mọi nghiệp vụ (Elo, takeback,
  PGN, token) đã có test phủ (`backend/tests/`). Việc đổi driver đồng loạt rủi ro cao.
- Chiến lược: chuyển **từng lớp có thể kiểm chứng**, giữ nguyên schema & hành vi,
  dùng Alembic kiểm soát DDL, và luôn giữ khả năng chạy SQLite cho dev/test.

## 2. Kiến trúc đích

```
uvicorn (N worker) ──> PgBouncer (transaction pooling, pool_size 20-50)
                          └─> PostgreSQL 16
```

- ORM: **SQLAlchemy 2.0 async** (`asyncpg` driver) hoặc SQLModel (Pydantic sẵn có).
- DDL: **Alembic** — chuyển `SCHEMA_DDL` thành migration khởi đầu (`alembic revision
  --autogenerate`), về sau mọi thay đổi schema đi qua Alembic.
- Biến môi trường: `THECHESS_DATABASE_URL=postgresql+asyncpg://thechess:...@postgres:5432/thechess`
  (mặc định giữ `sqlite+aiosqlite:///...` cho dev).

## 3. Lộ trình 4 bước

### Bước 1 — Abstract syntax của SQL hiện có
- Rà soát `database.py`: mọi query đang dùng `?` placeholder → đổi sang named binds
  (`:param`) để tương thích cả hai dialect.
- `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys` → gói vào `_create_connection()`
  chỉ chạy khi dialect là SQLite; PostgreSQL tự quản MVCC.
- Partial unique index `uq_match_detail_mainline_ply (…) WHERE is_mainline = 1`:
  PostgreSQL hỗ trợ y hệt cú pháp → giữ nguyên trong Alembic.

### Bước 2 — Đổi lớp kết nối sang SQLAlchemy async
```python
# engine_manager.py (mới) — thay sqlite3.Connection
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

url = os.environ.get("THECHESS_DATABASE_URL", f"sqlite+aiosqlite:///{DEFAULT_DB_PATH}")
engine = create_async_engine(url, pool_pre_ping=True, echo=False)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)
```
- `_row_to_user/_row_to_match/_row_to_match_detail` đổi input từ `sqlite3.Row`
  sang `Mapping` — đã hoạt động với cả dict (JOIN alias ở `list_match_summaries`).
- Mutex `threading.RLock` hiện tại bỏ hẳn: PostgreSQL xử lý đồng thời thật;
  các nghiệp vụ nhiều câu lệnh (complete_match + Elo) bọc trong
  `async with SessionFactory.begin()`.
- `app = FastAPI(...)` đã async-ready; các endpoint đổi `def` sync → `await` các hàm DB.

### Bước 3 — Alembic + seed
- `alembic init migrations`; autogenerate từ DDL hiện tại; `seed_defaults()` đổi thành
  `alembic upgrade head && python -m backend.seed` (chạy 1 lần khi deploy).
- CI thêm job PostgreSQL service container chạy toàn bộ `backend/tests` trên cả
  SQLite lẫn PostgreSQL (phát hiện sai khác dialect sớm).

### Bước 4 — Vận hành
- docker-compose: bỏ comment service `postgres` (đã chuẩn bị sẵn), thêm PgBouncer:
  `pool_mode = transaction`, `default_pool_size = 40`, `max_client_conn = 500`.
- Backup: `pg_dump` hằng ngày qua cron sidecar; WAL archiving nếu cần PITR.
- Migration dữ liệu: `pgloader sqlite:///thechess.db postgresql:///thechess`
  (tự map kiểu TEXT/INTEGER/REAL → text/integer/double precision).

## 4. Điểm cần lưu ý riêng của codebase này

| Vấn đề | Chi tiết |
|---|---|
| `verify_token_and_get_user` quét toàn bộ user | Nhánh quick-link compact đang `SELECT * FROM "user"` rồi so `uid_tag` từng dòng — với PostgreSQL hàng chục nghìn user sẽ chậm. Bổ sung cột `uid_tag BYTEA` + index khi chuyển. |
| `ORDER BY created_at DESC` (TEXT ISO-8601) | ISO-8601 UTC sorts đúng lexicographically; sang PostgreSQL nên đổi cột sang `timestamptz`. |
| `COALESCE(last_move_at, created_at)` | Đổi sang `GREATEST(...)` nếu muốn semantics khác; hiện tại giữ COALESCE là đủ. |
| Nhiều worker + `REVIEW_JOBS` in-memory | Đã có sẵn phải chuyển sang bảng/Redis khi scale-out worker (độc lập với DB migration). |

## 5. Hiện trạng đã chuẩn bị (commit này)

- Dockerfile multi-stage + docker-compose (service PostgreSQL đã stub sẵn).
- Mọi query đọc đã đi qua `read_connection()` — seam rõ ràng để thay engine.
- `list_match_summaries` JOIN duy nhất — không còn N+1 phụ thuộc SQLite-specific.
