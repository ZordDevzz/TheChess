import {
  AnalysisLevel,
  AnalysisResponse,
  EngineStatus,
  GameModeId,
  LobbyResponse,
  MatchRecord,
  MatchSummaryItem,
  MatchWithDetailsResponse,
  ReviewJobStatus,
  SystemStats,
  TimeControlType,
  UserRecord,
} from './types';

const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'thechess:auth_token:v1';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

export async function fetchStatus(): Promise<EngineStatus> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error('Không thể kết nối tới Backend Engine');
  return res.json();
}

export async function analyzePosition(
  fen: string,
  depth = 15,
  multipv = 3,
  signal?: AbortSignal
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, depth, multipv, time_limit: 0.75 }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Lỗi phân tích thế cờ');
  }
  return res.json();
}

export async function requestAIMove(params: {
  fen: string;
  engine_type: 'maia' | 'stockfish';
  elo: number;
  skill_level?: number | null;
  move_time?: number;
}): Promise<{
  move_uci: string;
  move_san: string;
  from_square: string;
  to_square: string;
  fen_after: string;
  engine_used: string;
}> {
  const res = await fetch(`${API_BASE}/ai-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Lỗi khi yêu cầu nước đi từ AI');
  }
  return res.json();
}

export async function classifySingleMove(params: {
  fen_before: string;
  move_uci: string;
  depth?: number;
  before_win_percent_white?: number;
  best_move_uci?: string | null;
  best_move_san?: string | null;
}): Promise<{
  move_uci: string;
  best_move_uci: string | null;
  best_move_san: string | null;
  before_win_percent_white: number;
  after_analysis: AnalysisResponse;
  classification: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
  symbol: string;
  color: string;
  win_loss: number;
  accuracy: number;
}> {
  const res = await fetch(`${API_BASE}/classify-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Lỗi chấm điểm nước đi');
  }
  return res.json();
}

export async function startGameReview(params: {
  initial_fen: string;
  moves_uci: string[];
  depth?: number;
}): Promise<{ job_id: string; status: string; progress: { done: number; total: number } }> {
  const res = await fetch(`${API_BASE}/review-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Lỗi khi khởi chạy Game Review');
  }
  return res.json();
}

export async function getReviewJob(jobId: string): Promise<ReviewJobStatus> {
  const res = await fetch(`${API_BASE}/review-game/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Lỗi khi lấy tiến độ Game Review');
  }
  return res.json();
}

export async function cancelReviewJob(jobId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/review-game/${jobId}`, { method: 'DELETE' });
  } catch {
    // Bỏ qua lỗi mạng khi hủy job nền
  }
}

export async function validateCustomFen(fen: string): Promise<{
  valid: boolean;
  errors: string[];
  turn?: 'w' | 'b';
  is_check?: boolean;
  legal_moves_count?: number;
}> {
  const res = await fetch(`${API_BASE}/validate-fen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen }),
  });
  if (!res.ok) throw new Error('Lỗi kiểm tra FEN');
  return res.json();
}

// ---------------------------------------------------------------------------
// Multiplayer Auth, Lobby, Matches & Admin API
// ---------------------------------------------------------------------------

export async function loginApi(
  username: string,
  password: string
): Promise<{ token: string; user: UserRecord }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Đăng nhập thất bại.');
  }
  return res.json();
}

export async function quickLoginApi(
  loginToken: string
): Promise<{ token: string; user: UserRecord }> {
  const res = await fetch(`${API_BASE}/auth/quick-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_token: loginToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Quick-Link đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
  return res.json();
}

export async function fetchMeApi(): Promise<UserRecord> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('Phiên đăng nhập đã hết hạn.');
  }
  return res.json();
}

export async function changePasswordApi(
  newPassword: string,
  displayName?: string
): Promise<{ token: string; user: UserRecord }> {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      new_password: newPassword,
      display_name: displayName || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể đổi mật khẩu.');
  }
  return res.json();
}

export async function fetchLobbyApi(stepExhibition = true): Promise<LobbyResponse> {
  const res = await fetch(
    `${API_BASE}/lobby?step_exhibition=${stepExhibition ? 'true' : 'false'}`,
    {
      headers: authHeaders(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tải được dữ liệu Sảnh.');
  }
  return res.json();
}

export async function fetchUserProfileApi(userId: string): Promise<{
  user: UserRecord;
  recent_matches: MatchSummaryItem[];
}> {
  const res = await fetch(`${API_BASE}/users/${userId}/profile`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tải được hồ sơ kỳ thủ.');
  }
  return res.json();
}

export async function createMatchApi(params: {
  mode: GameModeId;
  status: 'waiting' | 'setup' | 'playing';
  is_rated: boolean;
  white_user_id: string;
  black_user_id: string;
  ai_elo_override?: number | null;
  analysis_level: AnalysisLevel;
  allow_takeback: boolean;
  allow_hints: boolean;
  time_control_type: TimeControlType;
  initial_time_ms?: number | null;
  increment_ms: number;
  preset_id?: string | null;
  initial_fen: string;
  generate_room_code?: boolean;
}): Promise<MatchWithDetailsResponse> {
  const res = await fetch(`${API_BASE}/matches`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tạo được trận đấu mới.');
  }
  return res.json();
}

export async function joinMatchApi(
  roomCodeOrId: string
): Promise<MatchWithDetailsResponse> {
  const res = await fetch(`${API_BASE}/matches/join`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ room_code_or_id: roomCodeOrId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tham gia được phòng đấu.');
  }
  return res.json();
}

export async function getMatchApi(
  matchId: string
): Promise<MatchWithDetailsResponse> {
  const res = await fetch(`${API_BASE}/matches/${matchId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tìm thấy trận đấu.');
  }
  return res.json();
}

export async function appendMatchMoveApi(
  matchId: string,
  params: {
    player_user_id: string;
    uci: string;
    fen_before?: string;
    time_spent_ms?: number | null;
    clock_after_ms?: number | null;
    hint_used?: boolean;
    cp?: number | null;
    mate?: number | null;
    win_percent_white?: number | null;
    win_loss?: number | null;
    accuracy?: number | null;
    classification?: string | null;
    symbol?: string | null;
    best_move_uci?: string | null;
    best_move_san?: string | null;
  }
): Promise<MatchWithDetailsResponse> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/move`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không ghi nhận được nước đi.');
  }
  return res.json();
}

export async function takebackMatchApi(
  matchId: string,
  targetPly: number
): Promise<MatchWithDetailsResponse> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/takeback`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target_ply: targetPly }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thực hiện được đi lại nước.');
  }
  return res.json();
}

export async function finishMatchApi(
  matchId: string,
  result: '1-0' | '0-1' | '1/2-1/2',
  termination = 'resign'
): Promise<MatchWithDetailsResponse> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/finish`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ result, termination }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không kết thúc được ván đấu.');
  }
  return res.json();
}

export async function saveMatchReviewApi(
  matchId: string,
  params: {
    white_accuracy: number;
    black_accuracy: number;
    review_summary: Record<string, unknown>;
    ply_evaluations: Array<Record<string, unknown>>;
  }
): Promise<MatchRecord> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/save-review`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không lưu được kết quả Game Review.');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

export async function fetchAdminOverviewApi(): Promise<{
  stats: SystemStats;
  users: UserRecord[];
  active_matches: MatchSummaryItem[];
  lan_ip?: string;
}> {
  const res = await fetch(`${API_BASE}/admin/overview`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tải được dữ liệu Quản trị.');
  }
  return res.json();
}

export async function adminCreateUserApi(params: {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
  bio?: string;
  role: 'admin' | 'player';
  initial_rating: number;
  must_change_password: boolean;
}): Promise<{
  user: UserRecord;
  quick_login_token: string;
  initial_password: string;
  lan_ip?: string;
}> {
  const res = await fetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tạo được tài khoản mới.');
  }
  return res.json();
}

export async function adminUpdateUserApi(
  targetUserId: string,
  params: {
    display_name?: string;
    email?: string;
    bio?: string;
    role?: 'admin' | 'player';
    rating?: number;
    is_active?: boolean;
    new_password?: string;
    must_change_password?: boolean;
  }
): Promise<UserRecord> {
  const res = await fetch(`${API_BASE}/admin/users/${targetUserId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không cập nhật được tài khoản.');
  }
  return res.json();
}

export async function adminGenerateQuickLinkApi(
  targetUserId: string
): Promise<{ user: UserRecord; quick_login_token: string; lan_ip?: string }> {
  const res = await fetch(`${API_BASE}/admin/users/${targetUserId}/quick-link`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không tạo được Quick-Link.');
  }
  return res.json();
}

export async function adminRevokeUserApi(
  targetUserId: string,
  deactivate = false
): Promise<UserRecord> {
  const res = await fetch(
    `${API_BASE}/admin/users/${targetUserId}/revoke?deactivate=${
      deactivate ? 'true' : 'false'
    }`,
    {
      method: 'POST',
      headers: authHeaders(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thu hồi được phiên đăng nhập.');
  }
  return res.json();
}

export async function adminAbortMatchApi(matchId: string): Promise<MatchRecord> {
  const res = await fetch(`${API_BASE}/admin/matches/${matchId}/abort`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không đóng được phòng đấu.');
  }
  return res.json();
}

