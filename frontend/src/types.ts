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
  engines?: Array<{
    id: string;
    name: string;
    description: string;
    mode?: 'lc0_native' | 'human_policy_sampling';
    elos?: number[];
    min_elo?: number;
    max_elo?: number;
  }>;
}

export interface ReviewJobStatus {
  job_id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
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
  /**
   * Bảng năng lực sidebar MatchScreen (nguồn chân lý duy nhất — mọi component
   * chỉ đọc cờ, không tự quyết chính sách theo chế độ):
   */
  /** Nút Đầu hàng (đang chơi, không phải khán giả) */
  resign: boolean;
  /** Nút "Đi" trên nhánh PV engine gợi ý */
  playSuggestedMove: boolean;
  /** Nút yêu cầu AI đi nước tiếp theo (chỉ vs_AI) */
  triggerAiMove: boolean;
  /** Nút ⚙ mở cấu hình ván đấu (chỉ ván local — ván server do lobby sở hữu) */
  openConfig: boolean;
  /** Nút Đổi bên (chỉ ván local với AI) */
  switchSides: boolean;
  /** Nút Nhánh từ đây (chỉ ván local) */
  branchFromHere: boolean;
  /** Nút Ván mới (online = về Sảnh; khán giả không có) */
  newGame: boolean;
  /** Hiển thị đồ thị EvalGraph */
  evalGraph: boolean;
}

/** Bối cảnh gating: mọi thứ resolveFeatureVisibility cần biết ngoài config + phase. */
export interface FeatureVisibilityContext {
  /** Đang xem trực tiếp ván của người khác */
  isSpectator?: boolean;
  /** Ván đấu thuộc DB server (online / vs_ai tạo từ Sảnh) — cấu hình do server sở hữu */
  isServerMatch?: boolean;
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

// ---------------------------------------------------------------------------
// Multiplayer V3: User, Match, MatchDetail, Lobby & Admin
// ---------------------------------------------------------------------------

export type AppScreen = 'home' | 'match' | 'admin' | 'lab';

export type TimeControlType =
  | 'untimed'
  | 'bullet'
  | 'blitz'
  | 'rapid'
  | 'classical'
  | 'custom';

export interface UserRecord {
  id: string;
  username: string;
  email?: string | null;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  role: 'admin' | 'player';
  is_active: boolean;
  must_change_password: boolean;
  token_version: number;
  created_by_id?: string | null;
  is_bot: boolean;
  bot_engine?: 'maia' | 'stockfish' | null;
  bot_default_elo?: number | null;
  rating: number;
  peak_rating: number;
  rating_deviation: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  white_wins: number;
  black_wins: number;
  current_streak: number;
  best_win_streak: number;
  avg_accuracy?: number | null;
  preferred_board_theme: string;
  preferred_piece_set: string;
  last_login_at?: string | null;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchRecord {
  id: string;
  room_code?: string | null;
  mode: GameModeId;
  status: 'waiting' | 'setup' | 'playing' | 'finished' | 'aborted';
  is_rated: boolean;
  white_user_id: string;
  black_user_id: string;
  white_rating_before?: number | null;
  white_rating_after?: number | null;
  white_rating_delta?: number | null;
  black_rating_before?: number | null;
  black_rating_after?: number | null;
  black_rating_delta?: number | null;
  ai_elo_override?: number | null;
  analysis_level: AnalysisLevel;
  allow_takeback: boolean;
  allow_hints: boolean;
  time_control_type: TimeControlType;
  initial_time_ms?: number | null;
  increment_ms: number;
  white_clock_ms?: number | null;
  black_clock_ms?: number | null;
  last_move_at?: string | null;
  white_connected: boolean;
  black_connected: boolean;
  preset_id?: string | null;
  initial_fen: string;
  current_fen: string;
  current_turn: 'w' | 'b';
  total_plies: number;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  winner_user_id?: string | null;
  termination?: string | null;
  pgn?: string | null;
  review_status: 'none' | 'queued' | 'running' | 'done' | 'error';
  white_accuracy?: number | null;
  black_accuracy?: number | null;
  review_summary?: Record<string, unknown> | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
}

export interface MatchDetailRecord {
  id: string;
  match_id: string;
  parent_detail_id?: string | null;
  ply: number;
  move_number: number;
  is_mainline: boolean;
  variation_index: number;
  turn: 'w' | 'b';
  player_user_id: string;
  uci: string;
  san: string;
  from_sq: string;
  to_sq: string;
  promotion?: string | null;
  piece_moved: string;
  piece_captured?: string | null;
  is_check: boolean;
  is_checkmate: boolean;
  is_castling: boolean;
  fen_before: string;
  fen_after: string;
  time_spent_ms?: number | null;
  clock_after_ms?: number | null;
  hint_used: boolean;
  cp?: number | null;
  mate?: number | null;
  win_percent_white?: number | null;
  win_loss?: number | null;
  accuracy?: number | null;
  classification?: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | null;
  symbol?: string | null;
  best_move_uci?: string | null;
  best_move_san?: string | null;
  pv_lines?: PVLine[] | null;
  created_at: string;
}

export interface MatchSummaryItem {
  match: MatchRecord;
  white_player: UserRecord;
  black_player: UserRecord;
  is_system_exhibition: boolean;
}

export interface MatchWithDetailsResponse {
  match: MatchRecord;
  white_player: UserRecord;
  black_player: UserRecord;
  moves: MatchDetailRecord[];
  variations: MatchDetailRecord[];
}

export interface SystemStats {
  total_humans: number;
  active_humans: number;
  total_bots: number;
  waiting_matches: number;
  playing_matches: number;
  finished_matches: number;
}

export interface LobbyResponse {
  waiting_matches: MatchSummaryItem[];
  live_matches: MatchSummaryItem[];
  featured_match?: MatchSummaryItem | null;
  my_history: MatchSummaryItem[];
  club_history: MatchSummaryItem[];
  online_players: UserRecord[];
  bots: UserRecord[];
  stats: SystemStats;
}

// ---------------------------------------------------------------------------
// Phòng Lab: tổ chức trận AI vs AI & giải round-robin
// ---------------------------------------------------------------------------

/** Trận AI vs AI trong Lab (match thường, cả 2 bên là bot) */
export interface LabMatchListResponse {
  live: MatchSummaryItem[];
  recent: MatchSummaryItem[];
}

export interface LabScheduleSlot {
  round: number;
  white_bot_id: string;
  black_bot_id: string;
  match_id: string | null;
  status?: string;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
}

export interface LabParticipant {
  bot_id: string;
  username: string;
  label: string;
  engine: 'maia' | 'stockfish';
  elo: number;
}

export interface LabStanding {
  bot_id: string;
  label: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export interface LabTournament {
  id: string;
  name: string;
  status: 'running' | 'finished' | 'aborted';
  participants: LabParticipant[];
  schedule: LabScheduleSlot[];
  standings: LabStanding[];
  created_at: string;
  finished_at?: string | null;
}

