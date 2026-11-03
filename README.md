# TheChess

*Nền tảng cờ vua mã nguồn mở tích hợp động cơ phân tích UCI, mô hình mạng nơ-ron phong cách con người và hệ thống thi đấu thời gian thực.*

---

## 1. Tổng quan

**TheChess** là hệ thống cờ vua full-stack tự lưu trữ (self-hosted), được thiết kế nhằm phục vụ nhu cầu nghiên cứu lý thuyết cờ, luyện tập đối kháng với trí tuệ nhân tạo, phân tích ván đấu theo chiều sâu và tổ chức thi đấu nội bộ.

Dự án chú trọng vào tính ổn định, kiến trúc module rõ ràng và khả năng vận hành độc lập không phụ thuộc vào các dịch vụ đám mây bên ngoài.

```
                           +-----------------------------------+
                           |        Trình duyệt (Client)       |
                           |  React 18 / TypeScript / Tailwind |
                           +-----------------+-----------------+
                                             |
                              HTTP / REST    |  WebSocket (Real-time)
                                             v
                           +-----------------+-----------------+
                           |        FastAPI Backend App        |
                           |   (API Routes, Channels, Auth)    |
                           +--------+-----------------+--------+
                                    |                 |
                   SQLite + WAL     v                 v  python-chess (UCI Async)
             +----------------------+--+   +----------+----------------------+
             |   thechess.db           |   |           Engine Pool            |
             | - Users & Auth          |   | - Stockfish 17 (MultiPV/WDL)    |
             | - Matches & Reviews     |   | - Maia Chess (Lc0 / 1100-1900)  |
             | - Tournaments & Chats   |   | - Polyglot Human Opening Book   |
             +-------------------------+   +---------------------------------+
```

---

## 2. Tính năng Cốt lõi

### 2.1. Động cơ Tính toán & Mô phỏng Con người
* **Stockfish 17**: Phân tích thế trận thời gian thực, hỗ trợ hiển thị nhiều biến thể tốt nhất (MultiPV) và xác suất Thắng / Hòa / Thua (WDL - Win/Draw/Loss).
* **Maia Chess (1100 – 1900 Elo)**: Mô phỏng nước đi tự nhiên của con người theo từng cấp độ thông qua mạng nơ-ron Leela Chess Zero (Lc0). Khi không có binary Lc0, hệ thống tự động kích hoạt thuật toán heuristic fallback dựa trên Stockfish.
* **Sách khai cuộc Polyglot**: Tích hợp sẵn bộ mở cờ chuẩn con người (`human_book.bin`) giúp AI đi các nước khai cuộc thông dụng và cân bằng.

### 2.2. Phân tích & Đánh giá Ván đấu (Game Review)
* **Phân loại nước đi theo thời gian thực**: Nhận diện từng nước đi là *Best (Tối ưu)*, *Excellent (Xuất sắc)*, *Good (Tốt)*, *Inaccuracy (Thiếu chính xác)*, *Mistake (Sai lầm)* hay *Blunder (Sai lầm nghiêm trọng)*.
* **Review toàn trận nền**: Xử lý đánh giá toàn bộ ván đấu dưới dạng tác vụ nền (background job) có báo cáo tiến độ, sinh biểu đồ biến thiên lợi thế (Eval Graph).
* **Kiểm tra thế cờ (Board Editor)**: Công cụ dựng thế cờ và kiểm tra tính hợp lệ của chuỗi FEN.
* **Xuất / Nhập PGN**: Đồng bộ và lưu trữ biên bản ván đấu theo chuẩn quốc tế.

### 2.3. Thi đấu & Kết nối Trực tuyến
* **Đồng bộ thời gian thực**: Giao thức WebSocket phục vụ truyền nhận nước đi, đồng hồ thi đấu (Fischer increment / Sudden death), và tín hiệu hiện diện người chơi.
* **Thao tác trận đấu**: Hỗ trợ đề nghị đi lại (Takeback), đề nghị hòa, xin thua và chế độ quan sát trận đấu (Spectator).
* **Sảnh chờ & Trao đổi**: Trò chuyện sảnh chung (Lobby Chat), nhắn tin trực tiếp (Direct Message) và hệ thống thông báo trạng thái.

### 2.4. Phòng thí nghiệm & Giải đấu (Lab & Tournaments)
* **Giải đấu vòng tròn Berger**: Tự động xếp cặp và tính điểm theo chuẩn bảng Berger của FIDE.
* **Mô phỏng đối đầu (Bot vs Bot)**: Hỗ trợ tạo các trận đấu tự động giữa các cấp độ động cơ phục vụ mục đích kiểm thử và nghiên cứu.

---

## 3. Kiến trúc Ngăn xếp Kỹ thuật

| Thành phần | Công nghệ chính | Ghi chú |
| :--- | :--- | :--- |
| **Backend** | Python 3.12, FastAPI, Pydantic v2, Uvicorn | Xử lý REST API và WebSocket |
| **Chess Logic** | `python-chess` | Sinh nước đi, kiểm tra luật, giao tiếp UCI async |
| **Cơ sở dữ liệu** | SQLite 3 (WAL mode) | Lưu trữ người dùng, dữ liệu ván đấu, chat |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS | Ứng dụng Single Page Application (SPA) |
| **Chess Board** | `react-chessboard`, `chess.js` | Hiển thị bàn cờ và xử lý tương tác kéo thả |
| **Động cơ** | Stockfish 17, Leela Chess Zero (Lc0), Maia PB | Động cơ phân tích và mạng nơ-ron |

---

## 4. Yêu cầu Hệ thống

* **Hệ điều hành**: Linux (Ubuntu 22.04+ khuyến nghị), macOS hoặc Windows (thông qua WSL2/Docker).
* **Docker & Docker Compose** (nếu triển khai qua container).
* **Hoặc môi trường chạy cục bộ**:
  * Python `>= 3.12`
  * Node.js `>= 20 LTS` (kèm `npm`)
  * CPU hỗ trợ tập lệnh AVX2 (cho binary Stockfish mặc định).

---

## 5. Hướng dẫn Khởi chạy

### Cách 1: Triển khai bằng Docker Compose (Khuyến nghị cho Production/Self-hosting)

1. Sao chép kho mã nguồn:
   ```bash
   git clone https://github.com/ZordDevzz/TheChess.git
   cd TheChess
   ```

2. Thiết lập biến môi trường bắt buộc:
   ```bash
   export THECHESS_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
   ```

3. Khởi chạy container:
   ```bash
   docker compose up -d --build
   ```

4. Truy cập giao diện tại: `http://localhost:8000`
   * Kiểm tra tình trạng dịch vụ: `curl -fsS http://localhost:8000/health`
   * Dữ liệu cơ sở dữ liệu được lưu bền vững tại Docker volume `thechess_data`.

> **Lưu ý**: Nếu muốn build nhanh không tải nhị phân động cơ, thêm cờ `--build-arg SKIP_ENGINES=1`.

---

### Cách 2: Chạy Môi trường Phát triển Cục bộ (Local Development)

#### Bước 1: Chuẩn bị Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cd ..
```

#### Bước 2: Chuẩn bị Frontend
```bash
cd frontend
npm ci
cd ..
```

#### Bước 3: Tải Động cơ & Dữ liệu Khai cuộc
```bash
# Tải Stockfish và các tệp trọng số Maia
python engines/setup_engines.py

# Sinh sách khai cuộc Polyglot
python engines/build_opening_book.py

# (Tùy chọn) Tải các bộ âm thanh nước đi
python scripts/download_sounds.py
```

#### Bước 4: Khởi chạy Ứng dụng
* **Chạy qua script tổng hợp**:
  ```bash
  ./run.sh
  ```
* **Hoặc chạy từng tiến trình độc lập**:
  * Terminal 1 (Backend API):
    ```bash
    cd backend
    source .venv/bin/activate
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ```
  * Terminal 2 (Frontend Dev Server):
    ```bash
    cd frontend
    npm run dev
    ```
  Giao diện phát triển sẽ có mặt tại `http://localhost:5173`.

---

## 6. Cấu hình Biến Môi trường

Các tham số cấu hình có thể thiết lập qua biến môi trường hoặc tệp `.env`:

| Biến môi trường | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `THECHESS_ENV` | `development` | Môi trường chạy (`development` hoặc `production`). |
| `THECHESS_SECRET_KEY` | *(Tự sinh nếu rỗng)* | Khóa bí mật dùng để ký phiên xác thực (bắt buộc ở production). |
| `THECHESS_SECRET_KEY_FILE` | `backend/data/.secret_key` | Đường dẫn lưu khóa bí mật nếu không truyền qua môi trường. |
| `THECHESS_DB_PATH` | `backend/data/thechess.db` | Đường dẫn tệp cơ sở dữ liệu SQLite. |
| `THECHESS_ADMIN_USER` | `admin` | Tên tài khoản quản trị viên mặc định khi khởi tạo lần đầu. |
| `THECHESS_ADMIN_PASSWORD` | *(Sinh ngẫu nhiên)* | Mật khẩu quản trị viên. Nếu bỏ trống, hệ thống in mật khẩu ra log. |
| `THECHESS_ALLOWED_ORIGINS` | `http://localhost:8000` | Danh sách domain được cấp quyền CORS (ngăn cách bởi dấu phẩy). |
| `THECHESS_LAN_IP` | *(Tự phát hiện)* | Địa chỉ IP nội bộ dùng tạo link mời và mã QR cho người chơi khác. |
| `THECHESS_ENGINE_POOL` | `3` | Số tiến trình Stockfish phân tích chạy đồng thời trong pool. |
| `THECHESS_MAX_LC0_PER_ELO` | `2` | Số tiến trình Lc0 tối đa cho mỗi mức Elo mạng nơ-ron Maia. |
| `THECHESS_MAX_TOTAL_LC0` | `6` | Tổng số tiến trình Lc0 tối đa hoạt động trên hệ thống. |
| `THECHESS_LC0_IDLE_TIMEOUT`| `900` | Thời gian nhàn rỗi (giây) trước khi tự giải phóng tiến trình Lc0. |

---

## 7. Kiểm thử (Testing)

Dự án duy trì bộ kiểm thử tự động cho cả backend và frontend nhằm đảm bảo tính ổn định trước mỗi thay đổi.

### Backend (Python / pytest)
Bộ kiểm thử bao gồm kiểm tra logic phân tích thế cờ, quản lý động cơ, cơ chế lưu trữ cơ sở dữ liệu, phòng thí nghiệm và tích hợp API:
```bash
cd backend
source .venv/bin/activate
pytest tests -v
```

### Frontend (Node.js test runner & TypeScript compile)
Bộ kiểm tra bao gồm kiểm tra logic luật cờ, tính điểm ván cờ, an toàn dữ liệu và kiểm tra kiểu tĩnh:
```bash
cd frontend
npm test
npm run build
```

---

## 8. Cấu trúc Thư mục

```
TheChess/
├── .github/
│   ├── workflows/ci.yml           # Quy trình tích hợp liên tục (CI)
│   ├── ISSUE_TEMPLATE/            # Biểu mẫu báo lỗi và đề xuất tính năng
│   └── PULL_REQUEST_TEMPLATE.md   # Mẫu nội dung khi gửi Pull Request
├── backend/
│   ├── analyzer.py                # Thuật toán phân loại nước đi (Best, Blunder, ...)
│   ├── database.py                # Tầng truy xuất dữ liệu SQLite (WAL mode)
│   ├── engine_manager.py          # Quản lý hồ tiến trình UCI Stockfish & Lc0
│   ├── lab_manager.py             # Quản lý giải đấu và mô phỏng ván cờ
│   ├── main.py                    # Khởi tạo FastAPI, WebSocket endpoints, routes
│   ├── models.py                  # Pydantic schemas và cấu trúc bản ghi
│   ├── requirements.txt           # Thư viện phụ thuộc production
│   ├── requirements-dev.txt       # Thư viện phụ thuộc phát triển và kiểm thử
│   └── tests/                     # Bộ kiểm thử tích hợp và đơn vị
├── frontend/
│   ├── src/                       # Mã nguồn React, Hooks, Contexts, Pages
│   ├── public/                    # Tài nguyên tĩnh (âm thanh, biểu tượng)
│   ├── package.json               # Cấu hình gói và kịch bản npm
│   └── vite.config.ts             # Cấu hình đóng gói Vite
├── engines/
│   ├── setup_engines.py           # Kịch bản tải Stockfish và bộ trọng số Maia
│   ├── build_opening_book.py      # Kịch bản biên dịch sách khai cuộc Polyglot
│   └── weights/                   # Thư mục lưu trữ trọng số mạng nơ-ron
├── scripts/
│   └── download_sounds.py         # Kịch bản tải bộ âm thanh bàn cờ
├── docker-compose.yml             # Cấu hình khởi chạy container dịch vụ
├── Dockerfile                     # Định nghĩa container đa tầng (multi-stage)
├── .editorconfig                  # Quy chuẩn định dạng mã nguồn trong editor
├── .env.example                   # Mẫu cấu hình biến môi trường
├── CONTRIBUTING.md                # Hướng dẫn đóng góp mã nguồn
├── CODE_OF_CONDUCT.md             # Quy tắc ứng xử cộng đồng
├── SECURITY.md                    # Chính sách báo cáo lỗ hổng bảo mật
├── LICENSE                        # Giấy phép phần mềm MIT
└── run.sh                         # Kịch bản hỗ trợ khởi chạy nhanh
```

---

## 9. Đóng góp & Phát triển

Dự án hoan nghênh các đóng góp cải thiện mã nguồn, tài liệu và báo cáo lỗi từ cộng đồng. Vui lòng tham khảo các tài liệu sau trước khi gửi yêu cầu kéo (Pull Request):
* [Hướng dẫn Đóng góp (CONTRIBUTING.md)](CONTRIBUTING.md)
* [Quy tắc Ứng xử Cộng đồng (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md)
* [Chính sách Bảo mật (SECURITY.md)](SECURITY.md)

---

## 10. Giấy phép (License)

Dự án được phát hành theo các điều khoản của [Giấy phép MIT](LICENSE). Toàn bộ mã nguồn được cung cấp tự do phục vụ mục đích học tập, nghiên cứu và phát triển phần mềm.
