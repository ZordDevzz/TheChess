# Hướng dẫn Đóng góp (Contributing Guidelines)

Cảm ơn bạn đã quan tâm và mong muốn đóng góp cho **TheChess**. Dự án được phát triển theo mô hình mã nguồn mở minh bạch, hoan nghênh mọi đóng góp từ cộng đồng nhằm hoàn thiện chất lượng mã nguồn, sửa lỗi, tối ưu hiệu năng và bổ sung tính năng hữu ích.

Để duy trì tính nhất quán và độ ổn định của hệ thống, vui lòng tuân thủ các hướng dẫn dưới đây.

---

## 1. Nguyên tắc Chung

- **Tính khách quan và chuẩn mực**: Mọi thảo luận, mã nguồn và tài liệu đều hướng tới sự rõ ràng, trung tính và có cơ sở kỹ thuật xác thực.
- **Tôn trọng Quy tắc Ứng xử**: Vui lòng đọc kỹ [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) trước khi tham gia đóng góp.
- **Đảm bảo kiểm thử**: Bất kỳ thay đổi mã logic nào cũng cần đi kèm kiểm thử đơn vị hoặc kiểm thử tích hợp tương ứng.

---

## 2. Báo cáo Sự cố (Bug Reports)

Nếu bạn gặp lỗi trong quá trình sử dụng:
1. Kiểm tra danh sách **Issues** hiện có để tránh tạo trùng lặp.
2. Nếu lỗi chưa được ghi nhận, hãy tạo một Issue mới theo mẫu **Bug Report**.
3. Cung cấp đầy đủ thông tin:
   - Mô tả hiện tượng lỗi và hành vi kỳ vọng.
   - Các bước tái hiện chi tiết (kèm mã FEN hoặc PGN nếu liên quan đến ván cờ).
   - Môi trường chạy (phiên bản hệ điều hành, Python, Node.js, trình duyệt, Docker).
   - Log lỗi từ bảng điều khiển (Console) hoặc backend log nếu có.

---

## 3. Đề xuất Tính năng mới (Feature Requests)

1. Mở Issue theo mẫu **Feature Request**.
2. Giải thích rõ bài toán hoặc hạn chế hiện tại mà tính năng đề xuất sẽ giải quyết.
3. Đề xuất phương án thiết kế kiến trúc hoặc luồng người dùng (nếu có).
4. Thảo luận cùng đội ngũ duy trì trước khi bắt tay vào triển khai mã nguồn lớn để đảm bảo sự thống nhất với lộ trình dự án.

---

## 4. Thiết lập Môi trường Phát triển Cục bộ

### Yêu cầu tiên quyết
- **Python**: 3.12 trở lên
- **Node.js**: 20 LTS trở lên (kèm `npm`)
- **Git**

### Bước 1: Sao chép kho mã nguồn
```bash
git clone https://github.com/ZordDevzz/TheChess.git
cd TheChess
```

### Bước 2: Thiết lập Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cd ..
```

### Bước 3: Thiết lập Frontend
```bash
cd frontend
npm ci
cd ..
```

### Bước 4: Tải Động cơ và Dữ liệu phụ trợ
```bash
# Tải Stockfish và trọng số Maia Chess
python engines/setup_engines.py

# (Tùy chọn) Biên dịch sách khai cuộc Polyglot
python engines/build_opening_book.py

# (Tùy chọn) Tải bộ âm thanh bàn cờ
python scripts/download_sounds.py
```

### Bước 5: Khởi chạy môi trường phát triển
- Chạy backend:
  ```bash
  cd backend
  source .venv/bin/activate
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
  ```
- Chạy frontend:
  ```bash
  cd frontend
  npm run dev
  ```
- Hoặc sử dụng tập lệnh tiện ích:
  ```bash
  ./run.sh
  ```

---

## 5. Quy chuẩn Mã nguồn

- **Python (Backend)**:
  - Tuân thủ chuẩn PEP 8.
  - Sử dụng Type Hints cho các hàm công khai và tham số API.
  - Định nghĩa dữ liệu truyền nhận thông qua Pydantic models trong `models.py`.
  - Quản lý tương tác động cơ UCI bất đồng bộ theo luồng chuẩn của `python-chess`.
- **TypeScript / React (Frontend)**:
  - Sử dụng TypeScript ở chế độ nghiêm ngặt (`strict: true`), hạn chế tối đa sử dụng kiểu `any`.
  - Sử dụng React Functional Components và Hooks.
  - Sử dụng Tailwind CSS cho việc định dạng giao diện, đảm bảo tính nhất quán của hệ thống thiết kế.
- **Thông điệp Commit**:
  - Tuân thủ quy ước [Conventional Commits](https://www.conventionalcommits.org/):
    - `feat:` Thêm tính năng mới
    - `fix:` Khắc phục sự cố/lỗi
    - `refactor:` Tái cấu trúc mã nguồn mà không làm thay đổi hành vi bên ngoài
    - `test:` Thêm hoặc điều chỉnh kiểm thử
    - `docs:` Bổ sung hoặc chỉnh sửa tài liệu
    - `chore:` Các thay đổi liên quan đến cấu hình, công cụ build, CI

---

## 6. Kiểm thử Bắt buộc

Trước khi tạo Pull Request, toàn bộ bài kiểm tra phải hoàn tất thành công:

```bash
# Kiểm thử Backend
cd backend
source .venv/bin/activate
pytest tests -v
cd ..

# Kiểm thử và kiểm tra định kiểu Frontend
cd frontend
npm test
npm run build
cd ..
```

---

## 7. Quy trình Gửi Pull Request (PR)

1. Tạo nhánh phát triển mới từ `master`:
   ```bash
   git checkout -b feat/ten-tinh-nang-moi
   # hoặc
   git checkout -b fix/mo-ta-loi
   ```
2. Thực hiện các chỉnh sửa, commit mã nguồn kèm thông điệp rõ ràng.
3. Đảm bảo toàn bộ bài kiểm tra (backend + frontend) đều pass.
4. Đẩy nhánh lên fork của bạn và mở Pull Request hướng về nhánh `master` của kho nguồn chính.
5. Điền đầy đủ thông tin theo mẫu **Pull Request Template**.
6. Đội ngũ duy trì sẽ xem xét mã nguồn (Code Review) và phản hồi ý kiến đóng góp.
