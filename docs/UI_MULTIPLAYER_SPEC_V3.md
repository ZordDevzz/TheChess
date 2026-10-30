# Đặc tả Thiết kế Giao diện Multiplayer V3 — TheChess

> **Phiên bản:** 3.1  
> **Ngày cập nhật:** 2026-10-30  
> **Trạng thái:** `[DONE]` Đã chốt thiết kế và triển khai hoàn chỉnh.  
> **Tài liệu liên quan:** [`DESIGN_SYSTEM_V1.md`](./DESIGN_SYSTEM_V1.md) · [`UPGRADE_PLAN_V2.md`](./UPGRADE_PLAN_V2.md) · [`DATABASE_DESIGN_MULTIPLAYER.md`](./DATABASE_DESIGN_MULTIPLAYER.md)

---

## 1. Kiến trúc Màn hình & Điều hướng (Screen Architecture)

Hệ thống giao diện `TheChess` phiên bản Multiplayer V3 bao gồm **4 màn hình chính** dùng chung hệ thống Token màu sắc & kiểu chữ của **Design System V1 ("Phòng học cờ")**:

1. **`LoginScreen` ([`LoginScreen.tsx`](../frontend/src/components/LoginScreen.tsx) — Cổng xác thực bắt buộc & Quick-Link 19 ký tự):**
   - Chặn toàn bộ truy cập chưa xác thực (Strict Auth Gate).
   - Hỗ trợ **Quick-Link đăng nhập 1 chạm rút gọn** (`http://<LAN_IP>:<PORT>/?q=<19-char-token>`, đồng thời tương thích ngược `/?login_token=<token>`) do Admin cấp: tự động xác thực lấy phiên JWT, xóa tham số `q`/`login_token` khỏi thanh URL (`history.replaceState`) và đưa thẳng vào ứng dụng.
   - Nếu tài khoản có `must_change_password = true` (mật khẩu tạm do Admin cấp), hiển thị hộp thoại [`ChangePasswordModal`](../frontend/src/components/LoginScreen.tsx) bắt buộc cập nhật mật khẩu mới trước khi vào Sảnh.

2. **`HomeScreen` ([`HomeScreen.tsx`](../frontend/src/components/HomeScreen.tsx) — Sảnh Câu lạc bộ 2 cột):**
   - **Cột trái (7/12 — Phòng chờ, Trực tiếp trên Sảnh & Kỳ thủ Online):**
     - **Thanh Phòng chờ & Lời thách đấu (`waiting`):** Hiển thị các phòng đang mở hoặc lời thách đấu trực tiếp gửi tới bạn, kèm ô nhập nhanh **Mã phòng 6 ký tự** (`#K9M2X4`).
     - **Bàn cờ Tiêu điểm (`Featured Live Stream Board`) & Lưới Bàn cờ thu nhỏ (`Live Mini-Board Grid`):** Luôn phát trực tiếp trận đấu đang diễn ra. Ưu tiên trận của người chơi thật; nếu Sảnh không có trận người chơi nào đang diễn ra, hệ thống tự động ghép cặp 2 Bot AI đồng hạng Elo đánh biểu diễn trực tiếp.
     - **Kỳ thủ trên Sảnh (`Players Online`):** Hiển thị danh sách thành viên câu lạc bộ kèm trạng thái trực tuyến (`trực tuyến` / `Đang đấu`), chỉ số Elo & T/H/B, cùng 2 nút thao tác:
       - **`[Hồ sơ]`**: Mở hộp thoại [`PlayerProfileModal.tsx`](../frontend/src/components/PlayerProfileModal.tsx) xem thống kê chi tiết (Elo hiện tại, Elo đỉnh, Độ chuẩn TB, T-H-B) và lịch sử ván đấu của kỳ thủ đó.
       - **`[⚔ Thách đấu]`**: Chọn kỳ thủ đó làm đối thủ thách đấu trực tiếp (`targetOpponentId`) trong khung Tạo trận mới.
   - **Cột phải (5/12 — Tạo trận mới đầy đủ tùy chỉnh & Lịch sử đấu):**
     - **Khối trên — Menu Tạo trận mới (đầy đủ tùy chỉnh ngang hàng `PreMatchDialog`):**
       - **3 tab chế độ (`MODE_PRESETS`):** `Đấu Bạn Bè` (`online`) | `Đấu với AI` (`vs_ai`) | `Học Tập` (`training`), tự động áp dụng cấu hình mặc định chuẩn khi chuyển tab.
       - **Thế cờ xuất phát (3 tab):** `Tiêu chuẩn` | `Thế cờ mẫu (N)` (hiển thị danh mục, mô tả thế cờ, nhãn `Lượt: Trắng/Đen`, tự động đồng bộ màu quân cầm) | `Tự xếp ↗`.
       - **Thời gian suy nghĩ (Fischer Clock):** `3+2` (Blitz), `5+3` (Blitz), `10+0` (Rapid), `∞` (Tự do) & **Quân của bạn** (`Trắng` | `Ngẫu nhiên` | `Đen`).
       - **Đối thủ luyện tập** (khi ở tab `Học Tập`): Tùy chọn `Máy (AI)` hoặc `2 Người (1 máy)`.
       - **Cấu hình Engine AI:** Chọn giữa `Maia (Giống người)` với đầy đủ **9 mức Elo (`1100..1900`)** và `Stockfish 17` (thanh trượt `1320–3190 Elo`), kèm tùy chọn tính điểm Elo câu lạc bộ.
       - **Mức phân tích khi đang chơi (`AnalysisLevel`):** 3 nút `Tắt` (`off`) · `Chỉ thanh đánh giá` (`eval_only`) · `Đầy đủ` (`full`) — mở khóa cho `Học Tập` và `Đấu với AI`, tự động khóa ở `Đấu Bạn Bè`.
       - **Quyền hỗ trợ:** Hộp kiểm `Cho phép đi lại nước (takeback)` (`allowTakeback`) và `Cho phép gợi ý (hint)` (`allowHints`).
     - **Khối dưới — Lịch sử đấu (`Match History`):** 2 tab lọc `[Ván của tôi | Toàn sảnh]`, dải tóm tắt chỉ số cá nhân (`Elo · T-H-B · Chuẩn TB`), click vào ván đã kết thúc sẽ mở thẳng `MatchScreen` ở chế độ `ReviewScreen`.

3. **`MatchScreen` ([`App.tsx`](../frontend/src/App.tsx) — Bàn đấu, Khán giả & Phân tích):**
   - **Tối ưu lấp đầy chiều dọc container ([`useBoardSize.ts`](../frontend/src/hooks/useBoardSize.ts), [`PlayerCard.tsx`](../frontend/src/components/PlayerCard.tsx), [`CapturedRail.tsx`](../frontend/src/components/CapturedRail.tsx)):**
     - Bàn cờ và 2 thẻ `PlayerCard` (`h-10` / `40px`) được tính toán chính xác (`availH = rect.height - 104`) để lấp đầy tối đa chiều dọc vùng chứa trung tâm (`boardStageRef`).
     - Khi chiều ngang màn hình rộng (`availWWithRails >= availH`), hiển thị 2 cột `CapturedBar` (`44px–54px`) đối xứng hai bên bàn cờ; khi chiều ngang hẹp hơn, tự động ẩn 2 cột bên hông và hiển thị trực tiếp các quân đã ăn + điểm lợi thế vật chất (`+diff`) ngay bên trong `PlayerCard` để bàn cờ không bị co nhỏ.
   - **Đồng hồ đếm ngược Fischer** trên `PlayerCard` và phát hiện hết giờ (`timeout`) tự động.
   - **Overlay Phòng chờ (`waiting`)** hiển thị mã phòng `#K9M2X4` và nút Sao chép mã phòng.
   - **Chế độ Khán giả (`Spectator Mode`):** Khi vào xem trực tiếp từ Sảnh, tự động đồng bộ nước đi mới mỗi `1.8s` (kể cả tự động kích hoạt bước đi cho trận biểu diễn AI qua `step_exhibition_match_if_needed`), tự động cập nhật thanh Eval + đồ thị `EvalGraph` theo thời gian thực, và tự động chuyển sang ván biểu diễn mới khi ván cũ kết thúc.

4. **`AdminScreen` ([`AdminScreen.tsx`](../frontend/src/components/AdminScreen.tsx) — Quản trị Tài khoản & Phòng đấu):**
   - Truy cập qua mục **`Quản lý tài khoản (Admin UI)`** trong [`UserDropdownMenu.tsx`](../frontend/src/components/UserDropdownMenu.tsx) đối với tài khoản `role === 'admin'`.
   - Cung cấp 4 thẻ KPI hệ thống, ô cấu hình **`LAN Host`** (tự động nhận diện IP mạng LAN thực tế của máy chủ qua `get_lan_ip()` ở Backend thay vì `localhost`), bảng quản lý thành viên, tạo tài khoản mới kèm **Quick-Link 19 ký tự (`http://<LAN_IP>:<PORT>/?q=...`)**, cấp lại Quick-Link/mật khẩu, chỉnh sửa Elo, thu hồi phiên (`token_version`), và đóng/hủy các phòng đấu bị treo (`Abort Match`).

---

## 2. Cấu trúc Topbar Điều hướng Trực tiếp & Menu Tài khoản

- **Cụm trái & Điều hướng chính (`<nav>` trên Topbar trong [`App.tsx`](../frontend/src/App.tsx)):**
  - Logo **`TheChess`** + Thanh điều hướng chính hiển thị trực tiếp trên Topbar ở mọi màn hình:
    - **`Sảnh câu lạc bộ`** (`screen = 'home'`)
    - **`Bàn đấu`** (`screen = 'match'`, `activeTab = 'play'`)
    - **`Xếp cờ`** (`screen = 'match'`, `activeTab = 'editor'`)
  - Theo sau là dấu `/` và nhãn trạng thái ngữ cảnh trực tiếp của ván cờ hoặc màn hình hiện tại.
- **Cụm phải:**
  - Chỉ báo chế độ & mức phân tích (`Khán giả · Live Eval` hoặc `Mode · Mức phân tích`) khi ở `MatchScreen`.
  - **`ThemePicker`** (4 preset giao diện × 3 chất liệu bàn cờ).
  - **`UserDropdownMenu`** ([`UserDropdownMenu.tsx`](../frontend/src/components/UserDropdownMenu.tsx)): Chỉ chứa thông tin tài khoản (`Tên hiển thị · Elo · @username · T/H/B · Độ chuẩn TB`), **`Quản lý tài khoản (Admin UI)`** (nếu là Admin), **`Đổi mật khẩu & Tên hiển thị`**, và **`Đăng xuất`**.
