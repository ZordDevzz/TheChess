/**
 * Tiện ích game: dựng lại MoveRecord từ danh sách UCI, xuất PGN, lưu/khôi phục ván qua localStorage.
 */
import { Chess } from 'chess.js';
import { MoveRecord } from './types';

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
  if (initialFen !== STARTING_FEN) {
    try {
      g.setHeader('SetUp', '1');
      g.setHeader('FEN', initialFen);
    } catch {
      // chess.js cũ không có setHeader -> bỏ qua header mở rộng
    }
  }
  try {
    g.setHeader('Event', 'TheChess Studio');
  } catch {
    // ignore
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
// Lưu / khôi phục ván cờ qua localStorage
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'thechess:game:v1';

export type BoardThemeId = 'stone' | 'wood' | 'graphite';

export interface SavedGameData {
  initialFen: string;
  movesUci: string[];
  currentPly: number;
  playerColor: 'w' | 'b';
  boardTheme: BoardThemeId;
  savedAt: number;
}

export interface RestoredGame {
  initialFen: string;
  moves: MoveRecord[];
  currentPly: number;
  playerColor: 'w' | 'b';
  boardTheme: BoardThemeId;
}

const VALID_THEMES: BoardThemeId[] = ['stone', 'wood', 'graphite'];

/** Đọc ván đã lưu (nếu có) và dựng lại MoveRecord hợp lệ. Trả về null khi không có/lỗi. */
export function loadSavedGame(): RestoredGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedGameData>;
    if (!data.initialFen || !Array.isArray(data.movesUci)) return null;

    const moves = recordsFromUciList(data.initialFen, data.movesUci);
    const theme =
      data.boardTheme && VALID_THEMES.includes(data.boardTheme)
        ? data.boardTheme
        : 'stone';
    const requestedPly =
      typeof data.currentPly === 'number' ? data.currentPly : moves.length;
    return {
      initialFen: data.initialFen,
      moves,
      currentPly: Math.max(0, Math.min(requestedPly, moves.length)),
      playerColor: data.playerColor === 'b' ? 'b' : 'w',
      boardTheme: theme,
    };
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
  } catch {
    // ignore
  }
}
