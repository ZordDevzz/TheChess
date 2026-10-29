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
