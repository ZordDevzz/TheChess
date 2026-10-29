export interface PVLine {
  rank: number;
  depth: number;
  move_uci: string;
  move_san: string;
  from_square: string;
  to_square: string;
  cp: number | null;
  mate: number | null;
  win_percent_white: number;
  pv_san: string[];
  pv_uci: string[];
  wdl?: {
    win: number;
    draw: number;
    loss: number;
  } | null;
}

export interface AnalysisResponse {
  fen: string;
  turn: 'w' | 'b';
  is_game_over: boolean;
  result?: string;
  cp: number | null;
  mate: number | null;
  win_percent_white: number;
  lines: PVLine[];
}

export interface MoveRecord {
  ply: number;
  moveNumber: number;
  turn: 'w' | 'b';
  uci: string;
  san: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  cp?: number | null;
  mate?: number | null;
  winPercentWhite?: number;
  classification?: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
  symbol?: string;
  color?: string;
  bestMoveUci?: string | null;
  bestMoveSan?: string | null;
  accuracy?: number;
  winLoss?: number;
}

export interface PresetPosition {
  id: string;
  name: string;
  category: string;
  fen: string;
  description: string;
}

export interface EngineStatus {
  stockfish_ready: boolean;
  stockfish_path: string | null;
  lc0_binary_ready: boolean;
  lc0_path: string | null;
  maia_weights_available: number[];
  presets: PresetPosition[];
}

export interface ReviewJobStatus {
  job_id: string;
  status: 'running' | 'done' | 'error';
  progress: { done: number; total: number };
  result?: GameReviewResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// Vòng đời ván đấu & chế độ chơi (V2)
// ---------------------------------------------------------------------------

/** Trạng thái ván đấu: chuẩn bị -> đang chơi -> đã kết thúc */
export type GamePhase = 'setup' | 'playing' | 'finished';

/** Chế độ chơi */
export type GameModeId = 'training' | 'vs_ai' | 'online';

/** Mức engine hỗ trợ trong lúc chơi (người dùng đặt ở màn chuẩn bị) */
export type AnalysisLevel = 'off' | 'eval_only' | 'full';

export interface AiSettings {
  engine: 'maia' | 'stockfish';
  elo: number;
}

/** Thông tin người chơi một bên — nền cho account/online/stats sau này */
export interface PlayerInfo {
  name: string;
  type: 'human' | 'ai';
  ai?: AiSettings;
}

export interface GameConfig {
  mode: GameModeId;
  analysis: AnalysisLevel;
  allowTakeback: boolean;
  allowHints: boolean;
  /** Đối thủ: AI hoặc 2 người */
  opponent: 'ai' | 'human';
}

export interface GameOverInfo {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  winner: 'w' | 'b' | null;
}

export interface ModePreset {
  id: GameModeId;
  label: string;
  description: string;
  defaultConfig: GameConfig;
  enabled: boolean;
}

/** Các tính năng được phép hiển thị/dùng theo config + phase */
export interface FeatureVisibility {
  canMove: boolean;
  evalBar: boolean;
  arrows: boolean;
  classifyLive: boolean;
  hints: boolean;
  takeback: boolean;
  reviewButton: boolean;
}

export interface GameReviewResult {
  initial_fen: string;
  white_accuracy: number;
  black_accuracy: number;
  counts: {
    w: Record<string, number>;
    b: Record<string, number>;
  };
  moves: Array<{
    ply: number;
    move_number: number;
    turn: 'w' | 'b';
    move_uci: string;
    move_san: string;
    fen_after: string;
    cp: number | null;
    mate: number | null;
    win_percent_white: number;
    best_move_uci: string | null;
    best_move_san: string | null;
    classification: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
    symbol: string;
    color: string;
    win_loss: number;
    accuracy: number;
  }>;
}
