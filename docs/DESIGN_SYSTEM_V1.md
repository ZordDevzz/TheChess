# TheChess — Design System V1

> **Trạng thái (cập nhật 2026-10-30):** `[DONE]` Đã triển khai hoàn tất toàn bộ hệ thống Design System V1 trên codebase (ngoại trừ thành phần `EvalBar` dọc cạnh bàn cờ được đánh dấu `[INVALIDATED]` theo quyết định của Maintainer do trùng thông tin với thanh tỷ lệ thắng trong `EnginePanel` ở sidebar).

## 1. Concept: "Phòng học cờ" (The Study) `[DONE]`

TheChess là studio học cờ + phân tích, không phải social chess app. Concept thiết kế:

**"Bàn cờ chỉ có đen trắng. Màu sắc duy nhất trên màn hình là sự thật — đường eval."**

Nguyên tắc:
- `[DONE]` **Đơn sắc làm brand**: nền xanh-đen trầm (như nỉ bàn đấu trong bóng tối), accent duy nhất là **ngà (ivory)** — màu quân trắng. Không có màu brand thứ hai.
- `[DONE]` **Màu = thông tin, không phải trang trí**: mọi màu bão hòa chỉ xuất hiện khi mang ngữ nghĩa (eval, phân loại nước, lượt đi, lỗi). Đây là điểm khác biệt lớn nhất so với SaaS zinc hiện tại — hiện tại emerald/sky/amber/rose được dùng lẫn cả cho trang trí lẫn ngữ nghĩa.
- `[DONE]` **Chất liệu thật**: bàn cờ là chất liệu (nỉ xanh, gỗ, đá), chữ khắc học thuật — app là "phòng học", board là trung tâm thờ phụng.
- `[PARTIAL: DONE dải màu move list / INVALIDATED EvalBar dọc]` **Một khoảnh khắc đáng nhớ**: ~~thanh eval dọc nằm sát board~~ *(đã bỏ `EvalBar` dọc theo quyết định của Maintainer do trùng với thanh eval trong sidebar)* + dải màu phân loại nước trong move list — "dải màu sự thật" chạy dọc game. Không hiệu ứng trang trí khác.

## 2. Color tokens (dark — mặc định) `[DONE]`

Nền tint xanh rất nhẹ (green-tinted charcoal), ấm hơn zinc thuần, hợp chất liệu nỉ bàn đấu:

| Token | Hex | Dùng cho | Trạng thái |
|---|---|---|---|
| `bg` (`--c-base`) | `#0F1211` | nền trang | `[DONE]` |
| `surface-1` (`--c-panel`) | `#151A18` | panel sidebar, top bar | `[DONE]` |
| `surface-2` (`--c-inset` / `--c-card`) | `#1B211E` | thẻ con, move list, header popover | `[DONE]` |
| `surface-3` (`--c-overlay`) | `#232B27` | dialog, popover nổi | `[DONE]` |
| `border-subtle` (`--c-line`) | `#273029` | viền phân cách panel | `[DONE]` |
| `border-strong` (`--c-line-strong`) | `#3A463F` | viền input, hover | `[DONE]` |
| `text-primary` (`--c-ink`) | `#E9ECE8` | chữ chính | `[DONE]` |
| `text-secondary` (`--c-ink-2`) | `#A6B0AA` | chữ phụ, label | `[DONE]` |
| `text-faint` (`--c-ink-3`) | ~~`#6F7B75`~~ → `#86928B` | placeholder, meta *(đã nâng độ sáng để đạt chuẩn tương phản WCAG 2.1 AA >= 4.5:1)* | `[DONE]` |
| `accent-ivory` (`--c-accent`) | `#EDEAE0` | button chính (chữ `#10130F`), focus ring, item đang chọn | `[DONE]` |
| `danger` (`--c-danger`) | `#F07167` | resign, lỗi (đồng bộ với đỏ blunder) | `[DONE]` |

### Kiến trúc: hệ thống theme presets (thay cho dark-only) `[DONE]`

Không hardcode dark — toàn hệ thống chạy trên CSS variables theo `data-theme` trên `<html>`:

- `[DONE]` **Preset = UI palette + board theme đi kèm**, chọn trong panel Theme mới ở top bar (`ThemePicker.tsx`, thay select board theme đơn lẻ). Board theme vẫn override riêng được cho người dùng muốn trộn.
- `[DONE]` Lưu `localStorage` (`thechess:theme:v1`), lần đầu vào lấy theo `prefers-color-scheme`.
- `[DONE]` Mọi màu trong code **chỉ được tham chiếu token** — cấm hex trực tiếp trong component (trừ thang semantic mục 5).

| Preset | UI | Board đi kèm | Chất liệu | Trạng thái |
|---|---|---|---|---|
| **Study** (mặc định) | dark xanh-đen ở trên | Baize | phòng học ban đêm, nỉ giải đấu | `[DONE]` |
| **Graphite** | dark trung tính (`bg #101012`, surface xám lạnh) | Slate | neutral, contrast cao, cho ai ghét tint xanh | `[DONE]` |
| **Scoresheet** | light (`bg #F3F2EC` · `surface #FBFAF5` · `text #1D201D` · `border #DDD9CE`) | Wood | tờ ghi biên trên giấy ngà | `[DONE]` |
| **Marble** | light (`bg #F2F3F1` · `surface #FAFBFA` · `text #1D1F20`) | Slate | sáng, đá lạnh, train | `[DONE]` |

Bộ quân Cburnett SVG dùng chung mọi preset (outline quân đen/đủ độ tương phản trên cả ô sáng lẫn tối, kèm lớp `piece-black-underlay` rim-light). ~~Board mặc định chuyển sang Wood.~~ `[INVALIDATED — Board mặc định của preset Study là Baize theo mục 8]`.

## 3. Typography — 2 font, 3 vai trò `[DONE]`

Hiện tại dùng toàn system default. Đề xuất theo chất "sách cờ":

- `[DONE]` **Fraunces** (serif, optical-size, hỗ trợ tiếng Việt) — display: tên app, tiêu đề dialog, kết quả ("Chiến thắng", "Hòa"). Chữ khắc sách gỡ cờ, 500–700.
- `[DONE]` **IBM Plex Mono** — dữ liệu: move list, điểm eval, Elo, FEN, depth, số liệu accuracy. Tabular (`tabular-nums`), hỗ trợ tiếng Việt đầy đủ, có "mùi" thiết bị đo đạc.
- `[DONE]` **System sans** — mọi UI control còn lại (button, label, tab). Không cần font thứ ba.

Move list bằng mono là nâng cấp lớn nhất về cảm giác "chuyên nghiệp phân tích" — hiện notation trộn lẫn với font UI.

## 4. Bàn cờ & quân `[DONE]`

### Board themes (token hóa trong `src/theme/board.ts`, thay `BOARD_THEMES` rải trong App.tsx) `[DONE]`
| Theme | Ô sáng | Ô tối | Chất liệu | Trạng thái |
|---|---|---|---|---|
| **Baize** (mặc định mới) | `#EEEFE0` | `#6E8C62` | nỉ bàn đấu giải | `[DONE]` |
| **Wood** | `#EDD9B5` | `#A97C50` | gỗ classical | `[DONE]` |
| **Slate** | `#D9DDE1` | `#626B76` | đá, train cao contrast | `[DONE]` |

`[DONE]` Ô highlight (nước cuối, chọn, legal dots, chiếu) định nghĩa theo hệ số alpha trên token theme (`squareOverlays`) — tự ăn khớp mọi theme thay vì hardcode từng màu.

### Quân cờ: bỏ Unicode → SVG piece set `[DONE]`
`[DONE]` Unicode glyph là nút cổ chai chất lượng lớn nhất hiện nay (khác nhau giữa OS, không đồng bộ, không đẹp). Đã chuyển toàn bộ sang bộ **Cburnett** (`src/theme/pieces.tsx`, chuẩn de-facto của thế giới phân tích, `react-chessboard` hỗ trợ qua `customPieces` SVG) và đồng bộ trên cả `BoardEditor`, `PromotionDialog`, `CapturedRail`.

## 5. Thang màu ngữ nghĩa (single source of truth) `[DONE]`

`[DONE]` Palette phân loại nước và PV colors đã được gom về một module duy nhất `src/theme/semantic.ts` và đồng bộ 100% với `backend/analyzer.py`:

```
best #34D399 · excellent #2DD4BF · good #60A5FA
inaccuracy #FACC15 · mistake #FB923C · blunder #F87171
```
(giữ thang hiện tại — nó đã tốt và người dùng quen; chỉ chuẩn hóa cùng xuất hiện trên mọi surface)

`[DONE]` Mũi tên PV: hạ bão hòa 1 mức so với trước để không giành attention với quân. Turn indicator: chuyển sang ivory/square token (nhất quán concept đơn sắc).

## 6. Layout & component `[DONE]`

Giữ khung xương hiện tại (top bar / board trung tâm / sidebar phải) — nó đúng cho app phân tích. Tinh chỉnh:

- `[DONE]` **Sidebar 3 tầng rõ ràng**: `EnginePanel` (hành động) → `MoveHistory` (nước đi, mono) → `EvalGraph` (dòng thời gian). Mỗi tầng tách bằng border-subtle, không shadow.
- `[INVALIDATED]` **EvalBar**: ~~component đã có nhưng chưa render — render sát board bên trái, chính là "đũa thần" của concept.~~ *(Quyết định của Maintainer: Bỏ không dùng `EvalBar` dọc cạnh bàn cờ vì trùng lặp với thanh eval trong sidebar).*
- `[DONE]` **Top Bar tinh gọn & Điều hướng trực tiếp**: Cụm trái chứa logo `TheChess`, thanh điều hướng chính (`Sảnh câu lạc bộ | Bàn đấu | Xếp cờ`) đặt trực tiếp trên Top Bar và nhãn trạng thái ngữ cảnh. Cụm phải chứa chỉ báo chế độ, `ThemePicker` và `UserDropdownMenu` (quản lý tài khoản & link `Admin UI` cho quản trị viên). *(Dropdown chọn thế cờ mẫu trên Top Bar đã được `[INVALIDATED]` và chuyển vào `PreMatchDialog` cùng `HomeScreen`).*
- `[DONE]` **Tối ưu không gian dọc bàn cờ (`useBoardSize.ts`)**: Bàn cờ và 2 thẻ `PlayerCard` (`h-10`) luôn ưu tiên lấp đầy chiều dọc vùng chứa (`availH = rect.height - 104`); tự động ẩn 2 cột `CapturedBar` bên hông và gộp hiển thị quân ăn được + điểm lợi thế (`+diff`) vào trong `PlayerCard` khi chiều ngang hẹp.
- `[DONE]` **Radius**: 6px control, 10px panel/dialog, 6px board. Một hệ, không lẫn.
- `[DONE]` **Elevation bằng border, không shadow** (trừ board được thắp sáng nhẹ — shadow duy nhất của app, board là vật thể thật duy nhất nổi khỏi mặt bàn).
- `[DONE]` **Focus ring**: 2px ivory, offset 2px — visible trên mọi surface.
- `[DONE]` Spacing scale 4px, density hiện tại giữ (app công cụ).

## 7. Kế hoạch implement (4 phase, độc lập từng phần)

1. `[DONE]` **Tokens + theme engine**: CSS variables, `tailwind.config` extend, module `src/theme/` (semantic palette, board themes, presets), `ThemeProvider` + `ThemePicker` chọn preset, migration các hex hardcode sang token.
2. `[DONE]` **Typography**: load Fraunces + IBM Plex Mono (`@fontsource`), áp vào display/data.
3. `[DONE — trừ EvalBar INVALIDATED]` **Board**: piece set SVG Cburnett + board themes token hóa + highlight alpha-based + ~~render EvalBar~~ `[INVALIDATED]`.
4. `[DONE]` **Polish**: dialogs, `GameOverDialog` (Fraunces display), focus states, `prefers-reduced-motion`, nâng độ tương phản `--c-ink-3` đạt chuẩn WCAG AA trên từng preset.

## 8. Quyết định đã chốt

1. `[DONE]` Concept đơn sắc: accent ivory duy nhất, màu bão hòa chỉ mang ngữ nghĩa — **giữ nguyên discipline**.
2. `[DONE]` Board mặc định: **Baize** (xanh giải đấu).
3. `[DONE]` Bộ quân: **Cburnett SVG**, thay Unicode toàn diện (board, editor, promotion, captured rail).
4. `[DONE]` Theme: **hệ thống preset do người dùng chọn** (4 preset ở mục 2), không dark-only; board override riêng trong preset.
5. `[INVALIDATED]` Thanh `EvalBar` dọc sát bàn cờ: **Loại bỏ theo quyết định của Maintainer** do trùng chức năng với thanh đánh giá trong `EnginePanel` ở sidebar.
