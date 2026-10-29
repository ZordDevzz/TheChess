import { AnalysisResponse, EngineStatus, ReviewJobStatus } from './types';

const API_BASE = '/api';

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
