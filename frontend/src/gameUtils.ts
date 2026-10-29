/**
 * Tiện ích game: dựng lại MoveRecord từ danh sách UCI, xuất PGN, lưu/khôi phục ván qua localStorage,
 * preset chế độ chơi, phát hiện kết thúc ván, chênh lệch quân và bảng gating tính năng.
 */
import { Chess } from 'chess.js';
import {
  AnalysisLevel,
  FeatureVisibility,
  GameConfig,
  GameOverInfo,
  GameModeId,
  GamePhase,
  ModePreset,
  MoveRecord,
  PlayerInfo,
} from './types';

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---------------------------------------------------------------------------
// Chế độ chơi & mức phân tích
// ---------------------------------------------------------------------------

export const MODE_PRESETS: ModePreset[] = [
  {
    id: 'training',
    label: 'Học tập',
    description: 'Mọi công cụ mở: phân tích trực tiếp, gợi ý, đi lại nước.',
    defaultConfig: { mode: 'training', analysis: 'full', allowTakeback: true, allowHints: true, opponent: 'ai' },
    enabled: true,
  },
  {
    id: 'vs_ai',
    label: 'Chơi với máy',
    description: 'Thi đấu thật với AI. Tắt hỗ trợ engine khi đang chơi để giữ bản chất ván đấu.',
    defaultConfig: { mode: 'vs_ai', analysis: 'off', allowTakeback: false, allowHints: false, opponent: 'ai' },
    enabled: true,
  },
  {
    id: 'online',
    label: 'Chơi qua mạng',
    description: 'Đấu với người thật qua mạng.',
    defaultConfig: { mode: 'online', analysis: 'off', allowTakeback: false, allowHints: false, opponent: 'ai' },
    enabled: false,
  },
];

export const ANALYSIS_LEVEL_LABELS: Record<
  AnalysisLevel,
  { label: string; description: string }
> = {
  off: {
    label: 'Tắt',
    description: 'Thuần thi đấu — không có bất kỳ hỗ trợ nào từ engine khi đang chơi.',
  },
  eval_only: {
    label: 'Chỉ Eval',
    description: 'Chỉ thanh lợi thế, không gợi ý nước đi.',
  },
  full: {
    label: 'Đầy đủ',
    description: 'Eval + mũi tên MultiPV + phân loại nước đi ngay khi đánh.',
  },
};

export const DEFAULT_GAME_CONFIG: GameConfig =
  MODE_PRESETS[1].defaultConfig;

export function buildAiPlayerName(ai: { engine: 'maia' | 'stockfish'; elo: number }): string {
  return ai.engine === 'maia' ? `Maia ${ai.elo}` : `Stockfish (${ai.elo} Elo)`;
}

export function makeDefaultPlayers(): { w: PlayerInfo; b: PlayerInfo } {
  const ai = { engine: 'maia' as const, elo: 1500 };
  return {
    w: { name: 'Player', type: 'human' },
    b: { name: buildAiPlayerName(ai), type: 'ai', ai },
  };
}

/**
 * Bảng gating: tính năng nào được phép theo config + phase.
 * Khi ván kết thúc mọi phân tích mở lại full (hết tính chất thi đấu).
 */
export function resolveFeatureVisibility(
  config: GameConfig,
  phase: GamePhase
): FeatureVisibility {
  const playing = phase === 'playing';
  return {
    canMove: playing,
    evalBar: phase === 'finished' || (playing && config.analysis !== 'off'),
    arrows: phase === 'finished' || (playing && config.analysis === 'full'),
    classifyLive: playing && config.analysis === 'full',
    hints: playing && config.allowHints,
    takeback: playing && config.allowTakeback,
    reviewButton: phase === 'finished' || config.mode === 'training',
  };
}

// ---------------------------------------------------------------------------
// Kết thúc ván & vật chất
// ---------------------------------------------------------------------------

/** Phát hiện ván đã kết thúc + lý do, dựa trên chess.js. */
export function detectGameOver(fen: string): GameOverInfo | null {
  let g: Chess;
  try {
    g = new Chess(fen);
  } catch {
    return null;
  }
  if (!g.isGameOver()) return null;

  if (g.isCheckmate()) {
    const winner: 'w' | 'b' = g.turn() === 'w' ? 'b' : 'w';
    return {
      result: winner === 'w' ? '1-0' : '0-1',
      reason: 'Chiếu hết',
      winner,
    };
  }
  if (g.isStalemate()) {
    return { result: '1/2-1/2', reason: 'Hết nước đi (stalemate)', winner: null };
  }
  if (g.isInsufficientMaterial()) {
    return { result: '1/2-1/2', reason: 'Không đủ quân để chiếu hết', winner: null };
  }
  if (g.isThreefoldRepetition()) {
    return { result: '1/2-1/2', reason: 'Lặp lại thế cờ 3 lần', winner: null };
  }
  if (g.isDraw()) {
    return { result: '1/2-1/2', reason: 'Hòa theo luật 50 nước', winner: null };
  }
  return { result: '1/2-1/2', reason: 'Hòa', winner: null };
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START_COUNTS: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
// Dùng glyph filled cho cả 2 màu — phân biệt bằng màu chữ nơi hiển thị
const CAPTURED_SYMBOLS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

export interface MaterialInfo {
  /** Quân Đen đã bị bắt (hiển thị cạnh người chơi Trắng) */
  capturedByWhite: string[];
  /** Quân Trắng đã bị bắt (hiển thị cạnh người chơi Đen) */
  capturedByBlack: string[];
  /** Chênh lệch vật chất dương nghiêng về Trắng */
  diff: number;
}

export function getMaterialInfo(fen: string): MaterialInfo {
  let g: Chess;
  try {
    g = new Chess(fen);
  } catch {
    return { capturedByWhite: [], capturedByBlack: [], diff: 0 };
  }

  const counts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  let whiteVal = 0;
  let blackVal = 0;
  for (const row of g.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue;
      counts[cell.color][cell.type as 'p' | 'n' | 'b' | 'r' | 'q']++;
      const val = PIECE_VALUES[cell.type] ?? 0;
      if (cell.color === 'w') whiteVal += val;
      else blackVal += val;
    }
  }

  const missing = (color: 'w' | 'b'): string[] => {
    const out: Array<{ sym: string; val: number }> = [];
    for (const t of ['q', 'r', 'b', 'n', 'p'] as const) {
      const miss = Math.max(0, START_COUNTS[t] - counts[color][t]);
      const sym = CAPTURED_SYMBOLS[t];
      for (let i = 0; i < miss; i++) out.push({ sym, val: PIECE_VALUES[t] });
    }
    return out.sort((a, b) => b.val - a.val).map((x) => x.sym);
  };

  return {
    capturedByWhite: missing('b'),
    capturedByBlack: missing('w'),
    diff: whiteVal - blackVal,
  };
}

// ---------------------------------------------------------------------------
// Dựng lại biên bản từ UCI & xuất PGN
// ---------------------------------------------------------------------------

/** Dựng lại danh sách MoveRecord (kèm FEN trước/sau) từ FEN gốc + danh sách nước UCI. */
export function recordsFromUciList(initialFen: string, uciList: string[]): MoveRecord[] {
  let game: Chess;
  try {
    game = new Chess(initialFen);
  } catch {
    return [];
  }

  const records: MoveRecord[] = [];
  for (let i = 0; i < uciList.length; i++) {
    const uci = uciList[i];
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const fenBefore = game.fen();
    let mv;
    try {
      mv = game.move({ from, to, promotion: promotion || 'q' });
    } catch {
      try {
        mv = game.move({ from, to });
      } catch {
        break; // nước không hợp lệ -> dừng, giữ phần hợp lệ
      }
    }
    if (!mv) break;
    records.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      turn: mv.color,
      uci: `${mv.from}${mv.to}${mv.promotion || ''}`,
      san: mv.san,
      from: mv.from,
      to: mv.to,
      fenBefore,
      fenAfter: game.fen(),
    });
  }
  return records;
}

/** Tạo chuỗi PGN hoàn chỉnh (kèm header FEN nếu thế cờ xuất phát không tiêu chuẩn). */
export function buildPgn(initialFen: string, moves: MoveRecord[]): string {
  const g = new Chess(initialFen);
  for (const m of moves) {
    try {
      g.move(m.san);
    } catch {
      try {
        g.move({ from: m.from, to: m.to, promotion: m.uci[4] || 'q' });
      } catch {
        break;
      }
    }
  }
  try {
    g.setHeader('Event', 'TheChess Studio');
    if (initialFen !== STARTING_FEN) {
      g.setHeader('SetUp', '1');
      g.setHeader('FEN', initialFen);
    }
  } catch {
    // chess.js cũ không có setHeader -> bỏ qua header mở rộng
  }
  return g.pgn();
}

/** Tải chuỗi PGN xuống máy dưới dạng file .pgn. */
export function downloadPgn(pgn: string, filename?: string): void {
  const name =
    filename || `thechess-${new Date().toISOString().slice(0, 10)}.pgn`;
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Lưu / khôi phục ván cờ qua localStorage (v2: kèm phase/config/players)
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'thechess:game:v2';
const LEGACY_KEY = 'thechess:game:v1';

export type BoardThemeId = 'stone' | 'wood' | 'graphite';

export interface SavedGameData {
  initialFen: string;
  movesUci: string[];
  currentPly: number;
  playerColor: 'w' | 'b';
  boardTheme: BoardThemeId;
  phase: GamePhase;
  config: GameConfig;
  players: { w: PlayerInfo; b: PlayerInfo };
  gameOver: GameOverInfo | null;
  savedAt: number;
}

export interface RestoredGame {
  initialFen: string;
  moves: MoveRecord[];
  currentPly: number;
  playerColor: 'w' | 'b';
  boardTheme: BoardThemeId;
  phase: GamePhase;
  config: GameConfig;
  players: { w: PlayerInfo; b: PlayerInfo };
  gameOver: GameOverInfo | null;
}

const VALID_THEMES: BoardThemeId[] = ['stone', 'wood', 'graphite'];

function sanitizeConfig(raw: unknown): GameConfig {
  const d = raw as Partial<GameConfig> | null;
  if (!d) return DEFAULT_GAME_CONFIG;
  const validModes: GameModeId[] = ['training', 'vs_ai', 'online'];
  const validLevels: AnalysisLevel[] = ['off', 'eval_only', 'full'];
  return {
    mode: validModes.includes(d.mode as GameModeId) ? (d.mode as GameModeId) : 'vs_ai',
    analysis: validLevels.includes(d.analysis as AnalysisLevel)
      ? (d.analysis as AnalysisLevel)
      : 'off',
    allowTakeback: Boolean(d.allowTakeback),
    allowHints: Boolean(d.allowHints),
    opponent: d.opponent === 'human' ? 'human' : 'ai',
  };
}

function sanitizePlayers(raw: unknown): { w: PlayerInfo; b: PlayerInfo } {
  const d = raw as { w?: PlayerInfo; b?: PlayerInfo } | null;
  const def = makeDefaultPlayers();
  if (!d?.w || !d?.b) return def;
  const fix = (p: PlayerInfo, fb: PlayerInfo): PlayerInfo =>
    p && typeof p.name === 'string' && (p.type === 'human' || p.type === 'ai')
      ? { name: p.name, type: p.type, ai: p.ai }
      : fb;
  return { w: fix(d.w, def.w), b: fix(d.b, def.b) };
}

/** Đọc ván đã lưu (nếu có) và dựng lại MoveRecord hợp lệ. Trả về null khi không có/lỗi. */
export function loadSavedGame(): RestoredGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<SavedGameData>;
      if (!data.initialFen || !Array.isArray(data.movesUci)) return null;
      const moves = recordsFromUciList(data.initialFen, data.movesUci);
      const theme =
        data.boardTheme && VALID_THEMES.includes(data.boardTheme)
          ? data.boardTheme
          : 'stone';
      const requestedPly =
        typeof data.currentPly === 'number' ? data.currentPly : moves.length;
      const phase: GamePhase =
        data.phase === 'playing' || data.phase === 'finished' ? data.phase : 'setup';
      return {
        initialFen: data.initialFen,
        moves,
        currentPly: Math.max(0, Math.min(requestedPly, moves.length)),
        playerColor: data.playerColor === 'b' ? 'b' : 'w',
        boardTheme: theme,
        phase,
        config: sanitizeConfig(data.config),
        players: sanitizePlayers(data.players),
        gameOver:
          phase === 'finished' && data.gameOver?.result ? data.gameOver : null,
      };
    }

    // Migrate từ v1 (chỉ có initialFen + moves) -> coi như đang chơi
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const data = JSON.parse(legacy) as Partial<SavedGameData>;
      localStorage.removeItem(LEGACY_KEY);
      if (!data.initialFen || !Array.isArray(data.movesUci)) return null;
      const moves = recordsFromUciList(data.initialFen, data.movesUci);
      if (moves.length === 0) return null;
      return {
        initialFen: data.initialFen,
        moves,
        currentPly: moves.length,
        playerColor: data.playerColor === 'b' ? 'b' : 'w',
        boardTheme:
          data.boardTheme && VALID_THEMES.includes(data.boardTheme)
            ? data.boardTheme
            : 'stone',
        phase: 'playing',
        config: DEFAULT_GAME_CONFIG,
        players: makeDefaultPlayers(),
        gameOver: null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveGame(game: Omit<SavedGameData, 'savedAt'>): void {
  try {
    const payload: SavedGameData = { ...game, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage đầy / bị chặn -> bỏ qua
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}
