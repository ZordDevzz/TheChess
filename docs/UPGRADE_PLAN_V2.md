# Kế hoạch nâng cấp V2 — Game Lifecycle, Chế độ chơi & Trải nghiệm phân tích

> **Trạng thái (cập nhật 2026-10-30):** `[DONE]` Toàn bộ Giai đoạn 1–6 và nâng cấp **Multiplayer V3** ([`UI_MULTIPLAYER_SPEC_V3.md`](./UI_MULTIPLAYER_SPEC_V3.md) & [`DATABASE_DESIGN_MULTIPLAYER.md`](./DATABASE_DESIGN_MULTIPLAYER.md)) đã triển khai hoàn tất. Một số chi tiết thiết kế ban đầu (như `EvalBar` dọc, dropdown thế cờ mẫu trên Topbar, đồng hồ client-side thuần túy) đã được đánh dấu `[INVALIDATED]` để chuyển sang kiến trúc chuẩn hơn (tích hợp Thế cờ xuất phát vào `PreMatchDialog` và `HomeScreen`, thiết kế CSDL & đồng hồ Fischer trong [`docs/DATABASE_DESIGN_MULTIPLAYER.md`](./DATABASE_DESIGN_MULTIPLAYER.md)).

---

## 1. Phân tích yêu cầu

| # | Trạng thái | Yêu cầu | Hiện trạng (trước V2) | Giải pháp đã triển khai |
|---|:---:|---|---|---|
| YC1 | `[DONE]` | Màn hình kết thúc game, nút "Phân tích" nằm trong dialog; màn hình phân tích có chi tiết từng nước | Khi chiếu hết chỉ đổi dòng chữ header; Game Review hiện tại chỉ có accuracy tổng + bảng đếm, **không xem được chi tiết từng nước** | Modal kết thúc (`GameOverDialog`); màn hình `ReviewScreen` riêng: danh sách nước + panel chi tiết từng nước (eval trước/sau, nước tối ưu, PV lines + nút `Thử ↗`) |
| YC2 | `[DONE]` | Nút bắt đầu ván mới sau chiếu hết | Nút "Mới" có nhưng chìm trong panel phụ; không có ở điểm chặn màn hình | Nút "Ván mới" / "Đổi bên đánh lại" đặt ngay trong `GameOverDialog` |
| YC3 | `[DONE]` | Màn hình chuẩn bị game (pre-match) | Không có khái niệm "ván chưa bắt đầu": đổi sang Đen là AI đi ngay | State machine `setup → playing → finished` + `PreMatchDialog` (tích hợp cả chọn **Thế cờ xuất phát**: Tiêu chuẩn / Thế cờ mẫu / Tự xếp cờ); AI chỉ đi sau khi bấm "Bắt đầu" |
| YC4 | `[DONE]` | Player name (AI = tên model + settings, người = "Player") | Chỉ có chip `Maia 1500` / `Trắng-Đen` rời rạc | Model `PlayerInfo` hai bên (có `alignPlayersWithColor` tự động đồng bộ khi đổi màu quân), hiển thị `PlayerCard` hai đầu bàn cờ, edit tên người trong pre-match |
| YC5 | `[DONE]` | Chế độ chơi Học tập / Chơi với máy / Chơi qua mạng (placeholder) với mức phân tích live & hint do người dùng đặt | Chỉ có `playMode` vs_ai/2 người/sandbox; eval + arrows luôn bật → mất bản chất thi đấu | `GameModeId` + `AnalysisLevel` cấu hình được; ẩn eval/hint khi thi đấu; khóa toàn bộ ở chế độ online *(đang nâng cấp lên Multiplayer thật theo `DATABASE_DESIGN_MULTIPLAYER.md`)* |

## 2. Cải thiện bổ sung (do phân tích khoảng trống phát sinh)

| # | Trạng thái | Cải thiện | Lý do / Ghi chú |
|---|:---:|---|---|
| B1 | `[DONE]` | **State machine `GamePhase`** (`setup / playing / finished`) | Xương sống cho YC1–YC3, YC5: mọi gating (AI đi, analysis, hint, takeback) đều phụ thuộc phase |
| B2 | `[DONE]` | **Lý do kết thúc ván** từ chess.js (chiếu hết / hết nước / thiếu quân / 50 nước / lặp 3 lần) | Modal kết thúc hiển thị rõ lý do qua `detectGameOver(fen)` |
| B3 | `[DONE]` | **Nút đầu hàng** khi đang chơi | Chuẩn một ván đấu thật; bổ sung cho YC2 (kết thúc không chỉ do chiếu hết) |
| B4 | `[DONE]` | **PlayerCard hai đầu bàn cờ** + chênh lệch quân (`CapturedRail` material diff) | Nơi hiển thị tên (YC4), tăng chất "game", chỗ treo đồng hồ sau này |
| B5 | `[DONE]` | **Hint button** (khi `allowHints = true`) | Yêu cầu "hint khác nhau theo chế độ" — vẽ mũi tên gợi ý 4 giây |
| B6 | `[DONE]` | **Phân tích theo yêu cầu trong Review** (re-analyze FEN trước mỗi nước) | Chi tiết từng nước có MultiPV lines + đồng bộ mũi tên lên bàn cờ chính và cho phép bấm `Thử ↗` |
| B7 | `[DONE]` | **Persistence v2** (lưu phase/mode/players, migrate từ v1) | Refresh giữa ván quay về đúng trạng thái *(song song với tầng DB `match`/`match_detail` cho Multiplayer)* |
| B8 | `[DONE]` | **Ẩn badge phân loại nước khi đang thi đấu** | Tránh lộ thông tin engine trong lúc chơi — cùng tinh thần YC5 |
| B9 | `[INVALIDATED]` | ~~**Đồng hồ client-side đơn giản (tùy chọn, giai đoạn cuối)**~~ | **Đã thay thế (Superseded):** Chuyển sang thiết kế đồng hồ Fischer chuẩn (`initial_time_ms`, `increment_ms`, `white_clock_ms`, `black_clock_ms`, `last_move_at`) trong bảng `match` của kiến trúc Multiplayer (`backend/database.py`) |
| B10 | `[DONE]` | **Rematch đổi bên** trong modal kết thúc | Tự động đảo màu quân và hoán đổi `players.w` ↔ `players.b` chính xác |

~~**Không cần đổi backend**: mọi tính năng dùng lại `/api/analyze`, `/api/review-game` (job), `/api/ai-move`.~~
> `[INVALIDATED]` **Cập nhật Backend:** Đã nâng cấp `backend/analyzer.py` (đồng bộ màu semantic), `backend/engine_manager.py` (khắc phục rò rỉ `Skill Level`, thêm LRU cache 256 FEN), `backend/main.py` (sửa lỗi dọn dẹp job, thêm `DELETE /api/review-game/{job_id}`, tối ưu `/api/classify-move`), và bổ sung `backend/models.py` + `backend/database.py` cho Multiplayer.

## 3. Thiết kế

### 3.1 Data model (`types.ts`) `[DONE]`

```ts
type GamePhase = 'setup' | 'playing' | 'finished';

type GameModeId = 'training' | 'vs_ai' | 'online';

// Mức engine hỗ trợ trong lúc chơi (người dùng đặt trong pre-match)
type AnalysisLevel = 'off'        // thuần thi đấu: không eval, không arrows
                   | 'eval_only'  // chỉ thanh % thắng trong EnginePanel (EvalBar dọc đã [INVALIDATED])
                   | 'full';      // eval + arrows MultiPV + phân loại nước ngay

interface PlayerInfo {
  name: string;                 // "Player" | "Maia 1500" | "Stockfish (2000 Elo)"
  type: 'human' | 'ai';
  ai?: { engine: 'maia' | 'stockfish'; elo: number };
}

interface GameConfig {
  mode: GameModeId;
  opponent: 'ai' | 'human';     // [DONE] Bổ sung tường minh đối thủ AI vs 2 Người
  analysis: AnalysisLevel;      // chỉ cho chỉnh với training/vs_ai
  allowTakeback: boolean;       // default: training=true, vs_ai=false
  allowHints: boolean;          // default: training=true, vs_ai=false
}

interface GameOverInfo {
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  reason: string;               // "Chiếu hết", "Hết nước đi", "Đầu hàng", ...
  winner: 'w' | 'b' | null;
}

interface ModePreset {
  id: GameModeId; label: string; description: string;
  defaultConfig: GameConfig; lockedAnalysis?: AnalysisLevel[]; enabled: boolean;
}
```

**Preset mặc định:** `[DONE]`

| Mode | analysis | takeback | hints | Ghi chú | Trạng thái |
|---|---|---|---|---|---|
| `training` (Học tập) | `full` (chỉnh được) | ✅ | ✅ | Phân loại nước ngay khi đi | `[DONE]` |
| `vs_ai` (Chơi với máy) | `off` (chỉnh được) | ❌ | ❌ | Badge/eval chỉ hiện sau khi ván kết thúc | `[DONE]` |
| `online` (Chơi qua mạng) | khóa `off` | ❌ | ❌ | Đã hoàn thiện trọn vẹn từ tầng DB `user`/`match`/`match_detail` (`backend/database.py`) tới Sảnh `HomeScreen`, Phòng chờ mã `#K9M2X4`, Thách đấu trực tiếp và Xem trực tiếp (`Spectator`) | `[DONE — MULTIPLAYER V3]` |

### 3.2 State machine (`App.tsx`) `[DONE]`

```
            startGame()                    game over / resign
 setup ────────────────────► playing ──────────────────────────► finished
   ▲                            │  ▲                               │
   │      newGame()             │  └── reviewMode (xem lại,        │
   └────────────────────────────┘       không đổi phase)           │
        "Ván mới" từ modal kết thúc ◄──── "Đổi bên đánh lại" ──────┘
```

- `[DONE]` `phase === 'setup'`: bàn cờ hiển thị thế cờ xuất phát, **AI không tự đi**, mọi input đi quân bị chặn; overlay/panel `PreMatchDialog` hiện lên.
- `[DONE]` **Quy hoạch lại nơi chọn Thế cờ mẫu (Preset Positions):** Nút `<select>` chọn thế cờ mẫu trên thanh Top Bar đã bị `[INVALIDATED]` và xóa bỏ (vì xung đột với vòng đời ván đấu, có thể bấm nhầm xóa ván đang `playing`). Thay vào đó, mục **"Thế cờ xuất phát"** (`Tiêu chuẩn` | `Thế cờ mẫu` | `Tự xếp cờ ↗`) đã được tích hợp trực tiếp vào `PreMatchDialog` ở pha `setup` (`[DONE]`).
- `[DONE]` `phase === 'playing'`: đi quân bình thường; AI effect chỉ kích hoạt `phase==='playing' && turn !== playerColor`; chặn người chơi đi hộ quân AI; eval/arrows/classify/hint gating theo `config.analysis`.
- `[DONE]` `phase === 'finished'`: chặn đi quân; hiện `GameOverDialog`; bật full analysis (đã hết tính chất thi đấu).
- `[DONE]` `reviewMode: boolean` — độc lập với phase, chỉ cho phép bật khi có ≥ 1 nước; vào từ modal kết thúc hoặc nút Game Review.
- `[DONE]` `pass_and_play` cũ → gộp vào `config.opponent = 'human'` (`2 Người`) ngay trong `PreMatchDialog`.

### 3.3 Component mới `[DONE]`

| Component | Trạng thái | Vai trò |
|---|:---:|---|
| `PreMatchDialog.tsx` | `[DONE]` | Chọn mode (3 thẻ), **thế cờ xuất phát** (Tiêu chuẩn / Thế cờ mẫu / Tự xếp cờ), màu quân, tên người chơi, đối thủ (AI / 2 Người), engine + Elo, mức phân tích + toggle takeback/hint. Nút **Bắt đầu ván đấu** |
| `GameOverDialog.tsx` | `[DONE]` | Kết quả + lý do + tên 2 bên (YC4), accuracy nếu đã review; nút: **Ván mới** / **Đổi bên đánh lại** / **Phân tích ván đấu** / **Xuất PGN** |
| `ReviewScreen.tsx` | `[DONE]` | Layout split-view bên trong sidebar mở rộng (`md:w-[540px] xl:w-[640px]`) kết hợp `EvalGraph` phía dưới (thay vì modal che bàn cờ `[INVALIDATED]`): danh sách nước có badge + panel chi tiết nước đang chọn + **PV lines phân tích lại theo yêu cầu** kèm nút `Thử ↗` |
| `PlayerCard.tsx` | `[DONE]` | Tên + loại (người/AI + Elo) + chỉ báo lượt đi / đang nghĩ; đặt trên/dưới bàn cờ theo orientation |
| `HintButton` (trong `EnginePanel`) | `[DONE]` | Chỉ hiện khi `allowHints`; gọi analyze depth 12 MultiPV 1, vẽ mũi tên nước tối ưu trong 4s |

### 3.4 Gating bảng phân tích theo mode/phase `[DONE]`

| Tính năng | setup | playing @ off | playing @ eval_only | playing @ full | finished / review | Trạng thái |
|---|---|---|---|---|---|---|
| Thanh % thắng (trong `EnginePanel`; ~~`EvalBar` dọc~~ `[INVALIDATED]`) | — | ❌ | ✅ | ✅ | ✅ | `[DONE]` |
| Mũi tên MultiPV | ❌ | ❌ | ❌ | ✅ | ✅ | `[DONE]` |
| Phân loại nước (badge) | — | ❌ | ❌ | ✅ | ✅ | `[DONE]` |
| Hint | ❌ | ❌ | ❌ | tùy `allowHints` | — | `[DONE]` |
| Takeback | — | tùy `allowTakeback` | tùy | tùy | — | `[DONE]` |
| Nước đi người dùng | ❌ | ✅ (chỉ phe mình) | ✅ (chỉ phe mình) | ✅ (chỉ phe mình) | ❌ | `[DONE]` |

### 3.5 Persistence v2 (`thechess:game:v2`) `[DONE]`

- `[DONE]` Lưu đầy đủ: `phase`, `config`, `players`, `reviewMode`, tự động căn chỉnh `players` với `playerColor` qua `alignPlayersWithColor` khi khôi phục.

## 4. Kế hoạch triển khai (6 giai đoạn)

### Giai đoạn 1 — Nền tảng lifecycle & người chơi *(YC4 + B1)* `[DONE]`
1. `[DONE]` `types.ts`: thêm `GamePhase`, `PlayerInfo`, `GameConfig`, `ModePreset`, `GameOverInfo`; `MODE_PRESETS` hằng số.
2. `[DONE]` `App.tsx`: thêm state `phase`, `config`, `players`.
3. `[DONE]` Gate: AI auto-move + `executeMove` chỉ chạy khi `phase === 'playing'`.
4. `[DONE]` `PlayerCard.tsx` + `CapturedRail.tsx` (material diff tính từ FEN).
5. `[DONE]` `gameUtils.ts`: `detectGameOver(fen)`, `getMaterialInfo(fen)`, `alignPlayersWithColor()`; bump persistence v2 + migrate v1.
6. `[DONE]` **Nghiệm thu**: AI không bao giờ tự đi khi chưa "Bắt đầu"; build pass; v1 save cũ vẫn khôi phục được.

### Giai đoạn 2 — Pre-match dialog *(YC3)* `[DONE]`
1. `[DONE]` `PreMatchDialog.tsx` đầy đủ theo §3.3 + tích hợp chọn **Thế cờ xuất phát** (xóa dropdown chọn thế cờ bất hợp lý trên Topbar `[INVALIDATED]`).
2. `[DONE]` `App.tsx`: vào tab Bàn đấu khi `phase === 'setup'` → hiện dialog (đóng được để ngắm bàn cờ, có nút "Chuẩn bị & Bắt đầu ván đấu" nổi bật phía dưới).
3. `[DONE]` `handleStartGame()`: căn chỉnh `players` theo `playerColor`, nếu AI cầm bên đi trước → trigger nước đầu sau ~300ms.
4. `[DONE]` Đổi cấu hình/thế cờ xuất phát giữa ván → hỏi xác nhận nếu đang có nước đã đi.
5. `[DONE]` **Nghiệm thu**: chọn Đen + Maia 1500 → bấm Bắt đầu → AI cầm Trắng đi trước đúng 1 nước.

### Giai đoạn 3 — Kết thúc game & ván mới *(YC1-modal + YC2 + B2, B3, B10)* `[DONE]`
1. `[DONE]` Effect theo dõi `chessInstance`: khi game over ở `playing` → set `phase='finished'` + `gameOver=detectGameOver()`.
2. `[DONE]` Nút **Đầu hàng** → `gameOver = {result theo phe, reason: 'Đầu hàng'}`.
3. `[DONE]` `GameOverDialog.tsx`: kết quả lớn + lý do + 2 bên (đã sửa hiển thị đúng ô màu quân Đen `bg-sq-b`); 4 nút: Ván mới, Đổi bên đánh lại, Phân tích ván đấu, Xuất PGN.
4. `[DONE]` **Nghiệm thu**: chiếu hết → modal hiện đúng lý do; cả 4 nút hoạt động; không thể đi quân khi finished.

### Giai đoạn 4 — Màn hình phân tích chi tiết *(YC1-detail + B6)* `[DONE]`
1. `[DONE]` `ReviewScreen.tsx`: hiển thị accuracy 2 bên + counts + danh sách nước có badge + panel chi tiết nước + tự động phân tích `fenBefore` lấy 3 nhánh thay thế (MultiPV 3), đồng bộ mũi tên lên bàn cờ chính và có nút **`Thử ↗`** để đi thử nhánh thay thế.
2. `[DONE]` Tách custom hook `useGameReview.ts` quản lý vòng đời job và tự động gọi `DELETE /api/review-game/{job_id}` hủy job cũ khi tạo ván mới.
3. `[DONE]` Auto-chạy review khi vào từ `GameOverDialog`; hiển thị tiến độ job.
4. `[DONE]` **Nghiệm thu**: click từng nước → panel & mũi tên bàn cờ cập nhật đúng thế cờ.

### Giai đoạn 5 — Chế độ chơi & mức phân tích *(YC5 + B5, B8)* `[DONE]`
1. `[DONE]` Áp bảng gating §3.4 (`resolveFeatureVisibility`), trừ `EvalBar` dọc cạnh bàn cờ (`[INVALIDATED]`).
2. `[DONE]` `HintButton`: chỉ bật khi `allowHints` và đúng lượt người chơi; vẽ mũi tên nổi bật nước Top-1 trong 4s.
3. `[DONE]` Mode `online`: thẻ trong `PreMatchDialog` sẵn sàng kết nối với tầng DB Multiplayer (`user`, `match`, `match_detail`).
4. `[DONE]` Header hiển thị mode hiện tại + mức phân tích.
5. `[DONE]` **Nghiệm thu**: chế độ Chơi với máy @ off ẩn toàn bộ thông tin engine trong lúc chơi và mở lại sau khi kết thúc.

### Giai đoạn 6 — Hoàn thiện & Nâng cấp Multiplayer V3 `[DONE]`
1. `[DONE — MULTIPLAYER V3]` ~~Đồng hồ đơn giản client-side~~ `[INVALIDATED]` → Đã triển khai đồng hồ đếm ngược Fischer (`initial_time_ms`, `increment_ms`, `white_clock_ms`, `black_clock_ms`) đồng bộ với CSDL Multiplayer ([`backend/database.py`](../backend/database.py)) và hiển thị trên [`PlayerCard.tsx`](../frontend/src/components/PlayerCard.tsx).
2. `[PENDING / TÙY CHỌN]` Âm thanh đi quân / chiếu hết / kết thúc (WebAudio, toggle).
3. `[DONE]` Test: Đã bổ sung unit test [`frontend/src/__tests__/gameUtils.test.ts`](../frontend/src/__tests__/gameUtils.test.ts) (`9/9 passed`) và [`backend/tests/test_database.py`](../backend/tests/test_database.py) + [`backend/tests/test_analyzer.py`](../backend/tests/test_analyzer.py) (`38/38 passed`).
4. `[DONE]` Đánh bóng accessibility & layout: bổ sung `role="dialog"`, `aria-modal="true"`, xử lý phím `Escape` cho các dialog, nâng độ tương phản `--c-ink-3` đạt chuẩn WCAG AA, và tối ưu [`useBoardSize.ts`](../frontend/src/hooks/useBoardSize.ts) để bàn cờ + 2 `PlayerCard` luôn lấp đầy tối đa chiều dọc container.

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
