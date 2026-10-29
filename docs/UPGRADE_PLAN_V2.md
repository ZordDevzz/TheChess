# Kế hoạch nâng cấp V2 — Game Lifecycle, Chế độ chơi & Trải nghiệm phân tích

> Nguồn: yêu cầu người dùng sau bản vá P0–P2. Tài liệu này là bản phân tích + kế hoạch triển khai dùng làm căn cứ code ở các commit tiếp theo.

---

## 1. Phân tích yêu cầu

| # | Yêu cầu | Hiện trạng | Khoảng trống cần lấp |
|---|---|---|---|
| YC1 | Màn hình kết thúc game, nút "Phân tích" nằm trong dialog; màn hình phân tích có chi tiết từng nước | Khi chiếu hết chỉ đổi dòng chữ header; Game Review hiện tại chỉ có accuracy tổng + bảng đếm, **không xem được chi tiết từng nước** | Modal kết thúc (kết quả + lý do); màn hình Review riêng: danh sách nước + panel chi tiết từng nước (eval trước/sau, nước tối ưu, PV lines) |
| YC2 | Nút bắt đầu ván mới sau chiếu hết | Nút "Mới" có nhưng chìm trong panel phụ; không có ở điểm chặn màn hình | Nút "Ván mới" / "Đổi bên đánh lại" đặt ngay trong modal kết thúc |
| YC3 | Màn hình chuẩn bị game (pre-match) | Không có khái niệm "ván chưa bắt đầu": đổi sang Đen là AI đi ngay | State machine `setup → playing → finished` + PreMatchDialog; AI chỉ đi sau khi bấm "Bắt đầu" |
| YC4 | Player name (AI = tên model + settings, người = "Player") | Chỉ có chip `Maia 1500` / `Trắng-Đen` rời rạc | Model `PlayerInfo` hai bên, hiển thị hai đầu bàn cờ, edit tên người trong pre-match — nền cho account/online/stats sau này |
| YC5 | Chế độ chơi Học tập / Chơi với máy / Chơi qua mạng (placeholder) với mức phân tích live & hint do người dùng đặt | Chỉ có `playMode` vs_ai/2 người/sandbox; eval + arrows luôn bật → mất bản chất thi đấu | `GameModeId` + `AnalysisLevel` cấu hình được; ẩn eval/hint khi thi đấu; khóa toàn bộ ở chế độ online |

## 2. Cải thiện bổ sung (do phân tích khoảng trống phát sinh)

| # | Cải thiện | Lý do |
|---|---|---|
| B1 | **State machine `GamePhase`** (`setup / playing / finished`) | Xương sống cho YC1–YC3, YC5: mọi gating (AI đi, analysis, hint, takeback) đều phụ thuộc phase |
| B2 | **Lý do kết thúc ván** từ chess.js (chiếu hết / hết nước / thiếu quân / 50 nước / lặp 3 lần) | Modal kết thúc không thể chỉ ghi "hòa" |
| B3 | **Nút đầu hàng** khi đang chơi | Chuẩn một ván đấu thật; bổ sung cho YC2 (kết thúc không chỉ do chiếu hết) |
| B4 | **PlayerCard hai đầu bàn cờ** + chênh lệch quân (material diff) | Nơi hiển thị tên (YC4), tăng chất "game", chỗ treo đồng hồ sau này |
| B5 | **Hint button** (chỉ Học tập) | Yêu cầu "hint khác nhau theo chế độ" — cần một điểm truy cập rõ ràng |
| B6 | **Phân tích theo yêu cầu trong Review** (re-analyze FEN trước mỗi nước) | Chi tiết từng nước cần PV lines mà không lưu hàng trăm line khi review hàng loạt |
| B7 | **Persistence v2** (lưu phase/mode/players, migrate từ v1) | Refresh giữa ván phải quay về đúng trạng thái (đang chơi / đã kết thúc) |
| B8 | **Ẩn badge phân loại nước khi đang thi đấu** | Tránh "ăn cắp" thông tin engine trong lúc chơi — cùng tinh thần YC5 |
| B9 | **Đồng hồ (tùy chọn, giai đoạn cuối)** | Đã nằm trong khuyến nghị gốc; chỉ làm sau khi lifecycle ổn định |
| B10 | **Rematch đổi bên** trong modal kết thúc | Case dùng thường xuyên nhất sau ván đấu AI |

**Không cần đổi backend**: mọi tính năng dùng lại `/api/analyze`, `/api/review-game` (job), `/api/ai-move`.

## 3. Thiết kế

### 3.1 Data model (`types.ts`)

```ts
type GamePhase = 'setup' | 'playing' | 'finished';

type GameModeId = 'training' | 'vs_ai' | 'online';

// Mức engine hỗ trợ trong lúc chơi (người dùng đặt trong pre-match)
type AnalysisLevel = 'off'        // thuần thi đấu: không eval, không arrows
                   | 'eval_only'  // chỉ EvalBar + % thắng
                   | 'full';      // eval + arrows MultiPV + phân loại nước ngay

interface PlayerInfo {
  name: string;                 // "Player" | "Maia 1500" | "Stockfish (2000 Elo)"
  type: 'human' | 'ai';
  ai?: { engine: 'maia' | 'stockfish'; elo: number };
}

interface GameConfig {
  mode: GameModeId;
  analysis: AnalysisLevel;      // chỉ cho chỉnh với training/vs_ai
  allowTakeback: boolean;       // default: training=true, vs_ai=false
  allowHints: boolean;          // default: training=true, vs_ai=false
}

interface GameOverInfo {
  result: '1-0' | '0-1' | '1/2-1/2' | '*';   // '*' = đầu hàng dangở...
  reason: string;               // "Chiếu hết", "Hết nước đi", "Đầu hàng", ...
  winner: 'w' | 'b' | null;
}

interface ModePreset {
  id: GameModeId; label: string; description: string;
  defaultConfig: GameConfig; lockedAnalysis?: AnalysisLevel[]; enabled: boolean;
}
```

**Preset mặc định:**

| Mode | analysis | takeback | hints | Ghi chú |
|---|---|---|---|---|
| `training` (Học tập) | `full` (chỉnh được) | ✅ | ✅ | Phân loại nước ngay khi đi |
| `vs_ai` (Chơi với máy) | `off` (chỉnh được) | ❌ | ❌ | Badge/eval chỉ hiện sau khi ván kết thúc |
| `online` (Chơi qua mạng) | khóa `off` | ❌ | ❌ | **Placeholder**: tab disabled "Sắp ra mắt" |

### 3.2 State machine (`App.tsx`)

```
            startGame()                    game over / resign
 setup ────────────────────► playing ──────────────────────────► finished
   ▲                            │  ▲                               │
   │      newGame()             │  └── reviewMode (xem lại,        │
   └────────────────────────────┘       không đổi phase)           │
        "Ván mới" từ modal kết thúc ◄──── "Đổi bên đánh lại" ──────┘
```

- `phase === 'setup'`: bàn cờ hiển thị thế cờ xuất phát, **AI không tự đi**, mọi input đi quân bị chặn; overlay/panel pre-match hiện lên.
- `phase === 'playing'`: đi quân bình thường; AI effect chỉ kích hoạt `phase==='playing' && turn !== playerColor`; eval/arrows/classify/hint gating theo `config.analysis`.
- `phase === 'finished'`: chặn đi quân; hiện `GameOverDialog`; bật full analysis (đã hết tính chất thi đấu).
- `reviewMode: boolean` — độc lập với phase, chỉ cho phép bật khi có ≥ 1 nước; vào từ modal kết thúc hoặc nút Game Review.
- `pass_and_play` cũ → gộp vào `vs_ai` (AI = none?) hoặc giữ tương đương `vs_ai` với human-vs-human: quyết định triển khai — map `2 Người` = mode `vs_ai` với `ai: undefined` cả 2 bên; `sandbox` cũ = `training` không AI.

### 3.3 Component mới

| Component | Vai trò |
|---|---|
| `PreMatchDialog.tsx` | Chọn mode (3 thẻ, online disabled), màu quân, engine + Elo (nếu đấu AI), tên người chơi, mức phân tích + toggle takeback/hint. Nút **Bắt đầu ván đấu** |
| `GameOverDialog.tsx` | Kết quả + lý do + tên 2 bên (YC4), accuracy nếu đã review; nút: **Ván mới** / **Đổi bên đánh lại** / **Phân tích ván đấu** / **Xuất PGN** |
| `ReviewScreen.tsx` | Thay modal review hiện tại: layout 3 cột (thông số ván — danh sách nước có badge — panel chi tiết nước đang chọn); panel chi tiết gồm eval trước/sau, win_loss, accuracy, nước tối ưu, **PV lines phân tích lại theo yêu cầu** (B6) |
| `PlayerCard.tsx` | Tên + loại (người/AI + Elo) + material diff + (giai đoạn 6: đồng hồ); đặt trên/dưới bàn cờ theo orientation |
| `HintButton` (trong EnginePanel) | Chỉ hiện khi `allowHints`; gọi analyze depth 12 MultipV1, vẽ mũi tên nhấp nháy nước tối ưu |

### 3.4 Gating bảng phân tích theo mode/phase

| Tính năng | setup | playing @ off | playing @ eval_only | playing @ full | finished / review |
|---|---|---|---|---|---|
| EvalBar + % thắng | — | ❌ | ✅ | ✅ | ✅ |
| Mũi tên MultiPV | ❌ | ❌ | ❌ | ✅ | ✅ |
| Phân loại nước (badge) | — | ❌ | ❌ | ✅ | ✅ |
| Hint | ❌ | ❌ | ❌ | tùy `allowHints` | — |
| Takeback | — | tùy `allowTakeback` | tùy | tùy | — |
| Nước đi người dùng | ❌ | ✅ | ✅ | ✅ | ❌ |

### 3.5 Persistence v2 (`thechess:game:v2`)

Lưu thêm: `phase`, `config`, `players`, `reviewMode`. Khi khôi phục:
- `setup` → mở PreMatchDialog lại;
- `playing` → tiếp tục ván đúng currentPly cuối;
- `finished` → hiện lại GameOverDialog (hoặc ReviewScreen nếu trước đó đang review).
- Đọc được v1 cũ (chỉ initialFen+moves) → coi như `playing`.

## 4. Kế hoạch triển khai (6 giai đoạn, mỗi giai đoạn 1 commit)

### Giai đoạn 1 — Nền tảng lifecycle & người chơi *(YC4 + B1)*
1. `types.ts`: thêm `GamePhase`, `PlayerInfo`, `GameConfig`, `ModePreset`, `GameOverInfo`; `MODE_PRESETS` hằng số.
2. `App.tsx`: thêm state `phase`, `config`, `players` (thay `playMode`/`aiEngine`/`aiElo` rời rạc bằng nguồn thật; giữ biến cũ làm derived để hạn chế sửa rộng).
3. Gate: AI auto-move + `executeMove` chỉ chạy khi `phase === 'playing'`.
4. `PlayerCard.tsx` + material diff (tính từ FEN), đặt 2 đầu bàn cờ.
5. `gameUtils.ts`: `detectGameOver(fen): GameOverInfo | null` (dùng chess.js: `isCheckmate/isStalemate/isInsufficientMaterial/isThreefoldRepetition/isDraw`), `getMaterialDiff(fen)`; bump persistence v2 + migrate v1.
6. **Nghiệm thu**: AI không bao giờ tự đi khi chưa "Bắt đầu"; build pass; v1 save cũ vẫn khôi phục được.

### Giai đoạn 2 — Pre-match dialog *(YC3)*
1. `PreMatchDialog.tsx` đầy đủ theo §3.3; validate (online disabled).
2. `App.tsx`: vào tab Bàn đấu khi `phase === 'setup'` → hiện dialog (đóng được để ngắm bàn cờ, có nút "Bắt đầu ván đấu" nổi bật phía dưới).
3. `startGame()`: áp config, nếu AI cầm Trắng → trigger nước đầu sau ~400ms.
4. Đổi màu/đổi engine giữa ván (`onSwitchSides`, popover AI config) → chuyển về `setup` (hỏi xác nhận nếu đang có nước đã đi) — khép kín luồng "muốn đổi cấu hình thì qua ván mới".
5. **Nghiệm thu**: chọn Đen + Maia 1500 → bấm Bắt đầu → AI đi trước đúng 1 nước; không có nước nào bị đi trước khi bấm.

### Giai đoạn 3 — Kết thúc game & ván mới *(YC1-modal + YC2 + B2, B3, B10)*
1. Effect theo dõi `chessInstance`: khi game over ở `playing` → set `phase='finished'` + `gameOver=detectGameOver()`.
2. Nút **Đầu hàng** (hiện khi `playing` vs AI) → `gameOver = {result theo phe, reason: 'Đầu hàng'}`.
3. `GameOverDialog.tsx`: kết quả lớn + lý do + PlayerCard 2 bên; 4 nút: Ván mới (`→ setup`, giữ cấu hình), Đổi bên đánh lại (`→ setup` + swap màu + start ngay), Phân tích ván đấu (chạy review job + mở ReviewScreen), Xuất PGN.
4. **Nghiệm thu**: chiếu hết → modal hiện đúng lý do; cả 4 nút hoạt động; không thể đi quân khi finished.

### Giai đoạn 4 — Màn hình phân tích chi tiết *(YC1-detail + B6)*
1. `ReviewScreen.tsx` (modal lớn tối đa chiều cao): cột trái = accuracy 2 bên + counts + graph; giữa = danh sách nước (2 cột W/B) có badge, click chọn; phải = panel chi tiết nước: SAN, phân loại, win% trước→sau (mini bar), accuracy, nước tối ưu, nút **"Phân tích thế cờ này"** → gọi `/api/analyze` với `fen_before`, render PV lines (MultiPV 3) + mũi tên trên bàn cờ khi dialog mở (đồng bộ currentPly).
2. Thay modal cũ trong `EvalGraph`; nút "Game Review" và nút trong GameOverDialog cùng trỏ về ReviewScreen.
3. Auto-chạy review khi vào từ GameOverDialog; hiển thị tiến độ job (đã có polling).
4. **Nghiệm thu**: click từng nước → panel cập nhật; phân tích lại từng nước ra PV lines đúng thế cờ; điều hướng bàn cờ theo nước chọn.

### Giai đoạn 5 — Chế độ chơi & mức phân tích *(YC5 + B5, B8)*
1. Áp bảng gating §3.4: `EvalBar`, arrows, classify-call (bỏ call `/api/classify-move` khi `analysis='off'|'eval_only'`), badge render, takeback, EnginePanel settings.
2. `HintButton`: chỉ `allowHints`; vẽ mũi tên nổi bật nước Top-1 trong 4s.
3. Mode `online`: thẻ trong PreMatchDialog disabled + badge "Sắp ra mắt"; cấu trúc `GameModeId` sẵn sàng cắm backend sau này.
4. Header hiển thị mode hiện tại + mức phân tích (ví dụ `Học tập · Phân tích đầy đủ`).
5. **Nghiệm thu**: chế độ Chơi với máy @ off: không có bất kỳ thông tin engine nào trong lúc chơi (EvalBar ẩn, không arrows, không badge); sau khi kết thúc mọi thứ bật lại.

### Giai đoạn 6 — Hoàn thiện (tùy chọn)
1. Đồng hồ đơn giản (Không / 3+2 / 10+0) trong PreMatch + PlayerCard, client-side, hết giờ = thua theo bên.
2. Âm thanh đi quân / chiếu hết / kết thúc (WebAudio, toggle).
3. Test: unit test `detectGameOver`, `getMaterialDiff`, gating logic (`resolveFeatureVisibility(config, phase)`); cập nhật CI.
4. Đánh bóng accessibility: aria-label bàn cờ, focus-trap các dialog.

## 5. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| Refactor `App.tsx` lớn (state cũ rời rạc) | Làm theo giai đoạn, mỗi giai đoạn 1 commit build pass; giữ biến derived (`playMode`...) để hạn chế đụng EnginePanel trong giai đoạn 1 |
| Restore sai trạng thái giữa ván (playing/finished) | Persistence v2 lưu cả `gameOver` khi finished; test tay 3 case refresh |
| Chi phí re-analyze trong Review | `time_limit 0.5s`, depth 12, chỉ gọi khi user click (không pre-fetch) |
| Đổi cấu hình giữa ván gây lệch state | Chuyển hết về `setup` + xác nhận khi đã có nước đi |
| Đồng hồ làm phức tạp | Đặt ở giai đoạn 6, có thể bỏ mà không ảnh hưởng giai đoạn 1–5 |

## 6. Thứ tự ưu tiên & phạm vi commit

```
G1 (nền tảng) → G2 (pre-match) → G3 (kết thúc game) → G4 (review chi tiết) → G5 (mode/gating) → G6 (tùy chọn)
```

G1–G3 tạo thành MVP thỏa YC1–YC4; G5 đáp ứng YC5; G4 nâng trải nghiệm phân tích; G6 là nice-to-have. Mỗi giai đoạn kết thúc bằng: `npm run build` pass + pytest pass + smoke test tay theo mục Nghiệm thu.
