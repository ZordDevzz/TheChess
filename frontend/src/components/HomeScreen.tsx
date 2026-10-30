import React, { useEffect, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import {
  Bot,
  Clock,
  Eye,
  GraduationCap,
  History,
  Lock,
  Play,
  PlusCircle,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trophy,
  UserCheck,
  UserCircle2,
  Users,
  X,
  MessageSquare,
} from 'lucide-react';
import { fetchLobbyApi } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import { LobbyChat } from './LobbyChat';
import {
  AnalysisLevel,
  GameModeId,
  LobbyResponse,
  MatchSummaryItem,
  PresetPosition,
  TimeControlType,
  UserRecord,
} from '../types';
import {
  ANALYSIS_LEVEL_LABELS,
  MODE_PRESETS,
  STARTING_FEN,
} from '../gameUtils';
import { cburnettPieces } from '../theme/pieces';
import { useTheme } from '../theme/ThemeProvider';
import { PlayerProfileModal } from './PlayerProfileModal';

export interface QuickCreateMatchOptions {
  mode: GameModeId;
  opponentType: 'ai' | 'human';
  timeControlType: TimeControlType;
  initialTimeMs: number | null;
  incrementMs: number;
  side: 'w' | 'b' | 'random';
  isRated: boolean;
  aiEngine: 'maia' | 'stockfish';
  aiElo: number;
  analysisLevel: AnalysisLevel;
  allowTakeback: boolean;
  allowHints: boolean;
  initialFen: string;
  presetId?: string | null;
  targetOpponentId?: string | null;
}

interface HomeScreenProps {
  currentUser: UserRecord;
  presets: PresetPosition[];
  lc0Ready?: boolean;
  onCreateMatch: (opts: QuickCreateMatchOptions) => Promise<void>;
  onJoinMatchByCodeOrId: (codeOrId: string) => Promise<void>;
  onOpenLiveMatch: (matchId: string) => Promise<void>;
  onOpenHistoryMatchReview: (matchId: string) => Promise<void>;
  onOpenBoardEditor: () => void;
  /** Mở modal chat DM với user */
  onOpenDm: (user: UserRecord) => void;
}

const TIME_PRESETS: Array<{
  id: string;
  label: string;
  sub: string;
  type: TimeControlType;
  initialMs: number | null;
  incrementMs: number;
}> = [
  {
    id: '3+2',
    label: '3 + 2',
    sub: 'Blitz',
    type: 'blitz',
    initialMs: 180_000,
    incrementMs: 2_000,
  },
  {
    id: '5+3',
    label: '5 + 3',
    sub: 'Blitz',
    type: 'blitz',
    initialMs: 300_000,
    incrementMs: 3_000,
  },
  {
    id: '10+0',
    label: '10 + 0',
    sub: 'Rapid',
    type: 'rapid',
    initialMs: 600_000,
    incrementMs: 0,
  },
  {
    id: 'untimed',
    label: '∞',
    sub: 'Tự do',
    type: 'untimed',
    initialMs: null,
    incrementMs: 0,
  },
];

const MAIA_ELOS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

export function formatClockMs(ms?: number | null): string {
  if (ms == null) return '∞';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function isPlayerRecentlyOnline(
  u: UserRecord,
  currentUserId: string
): boolean {
  if (u.id === currentUserId) return true;
  if (!u.last_seen_at) return false;
  const ts = Date.parse(u.last_seen_at);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= 5 * 60 * 1000;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  currentUser,
  presets,
  lc0Ready,
  onCreateMatch,
  onJoinMatchByCodeOrId,
  onOpenLiveMatch,
  onOpenHistoryMatchReview,
  onOpenBoardEditor,
  onOpenDm,
}) => {
  const { boardTheme } = useTheme();
  const [lobby, setLobby] = useState<LobbyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLiveId, setSelectedLiveId] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);

  // State cho Modal Hồ sơ kỳ thủ & Thách đấu trực tiếp
  const [profileUser, setProfileUser] = useState<UserRecord | null>(null);
  const [challengedPlayer, setChallengedPlayer] = useState<UserRecord | null>(
    null
  );

  // State cho Menu Tạo trận mới (Cột phải trên) - đầy đủ như PreMatchDialog
  const [createMode, setCreateMode] = useState<GameModeId>('online');
  const [opponentType, setOpponentType] = useState<'ai' | 'human'>('human');
  const [timePresetId, setTimePresetId] = useState<string>('5+3');
  const [sideChoice, setSideChoice] = useState<'w' | 'b' | 'random'>('random');
  const [isRated, setIsRated] = useState(true);
  const [aiEngine, setAiEngine] = useState<'maia' | 'stockfish'>('maia');
  const [aiElo, setAiElo] = useState<number>(1500);
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>('off');
  const [allowTakeback, setAllowTakeback] = useState<boolean>(false);
  const [allowHints, setAllowHints] = useState<boolean>(false);
  const [startTab, setStartTab] = useState<'standard' | 'preset'>('standard');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard');
  const [creating, setCreating] = useState(false);

  const nonStandardPresets = React.useMemo(
    () => presets.filter((p) => p.id !== 'standard'),
    [presets]
  );

  const selectedPreset = React.useMemo(
    () =>
      startTab === 'preset'
        ? presets.find((p) => p.id === selectedPresetId) ||
          nonStandardPresets[0] ||
          null
        : null,
    [startTab, selectedPresetId, presets, nonStandardPresets]
  );

  const selectedFen = selectedPreset ? selectedPreset.fen : STARTING_FEN;
  const startTurnSide: 'w' | 'b' = React.useMemo(() => {
    try {
      return new Chess(selectedFen).turn();
    } catch {
      return 'w';
    }
  }, [selectedFen]);

  // Áp dụng cấu hình mặc định chuẩn của chế độ khi người dùng chuyển tab Mode
  const handleSelectMode = (mode: GameModeId) => {
    const preset = MODE_PRESETS.find((p) => p.id === mode);
    setCreateMode(mode);
    if (preset) {
      setOpponentType(preset.defaultConfig.opponent);
      setAnalysisLevel(preset.defaultConfig.analysis);
      setAllowTakeback(preset.defaultConfig.allowTakeback);
      setAllowHints(preset.defaultConfig.allowHints);
    }
    if (mode === 'training') {
      setTimePresetId('untimed');
      setIsRated(false);
    } else if (timePresetId === 'untimed' && mode === 'online') {
      setTimePresetId('5+3');
      setIsRated(true);
    }
  };

  // State cho Lịch sử đấu (Cột phải dưới)
  const [historyTab, setHistoryTab] = useState<'mine' | 'club' | 'ai'>('mine');

  const loadLobby = async (stepExhibition = true) => {
    try {
      const data = await fetchLobbyApi(stepExhibition);
      setLobby(data);
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  };

  // Realtime: topic `lobby` server báo có thay đổi (trận mới/kết thúc/nước đi)
  // -> refetch ngay. Poll chỉ còn fallback chậm cho khi WS rớt.
  const { subscribe: subscribeRealtime } = useRealtime();
  useEffect(() => {
    return subscribeRealtime('lobby', () => {
      loadLobby(true);
    });
  }, [subscribeRealtime]);

  useEffect(() => {
    loadLobby(true);
    const timer = window.setInterval(() => {
      loadLobby(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const featuredMatch: MatchSummaryItem | null = React.useMemo(() => {
    if (!lobby) return null;
    if (selectedLiveId) {
      const found = lobby.live_matches.find(
        (m) => m.match.id === selectedLiveId
      );
      if (found) return found;
    }
    return lobby.featured_match || lobby.live_matches[0] || null;
  }, [lobby, selectedLiveId]);

  // Bản đồ user_id -> match_id đang thi đấu
  const activeMatchByUserId = React.useMemo(() => {
    const map = new Map<string, string>();
    if (!lobby) return map;
    for (const item of lobby.live_matches) {
      if (item.is_system_exhibition) continue;
      map.set(item.match.white_user_id, item.match.id);
      map.set(item.match.black_user_id, item.match.id);
    }
    return map;
  }, [lobby]);

  /** Kỳ thủ đang giữ phòng chờ (creator đặt cả 2 slot bằng mình khi chờ join) */
  const waitingByUserId = React.useMemo(() => {
    const map = new Map<string, string>();
    if (!lobby) return map;
    for (const item of lobby.waiting_matches) {
      map.set(item.match.white_user_id, item.match.id);
      map.set(item.match.black_user_id, item.match.id);
    }
    return map;
  }, [lobby]);

  const playersList = lobby?.online_players || [currentUser];
  const onlineCount = playersList.filter(
    (u) =>
      isPlayerRecentlyOnline(u, currentUser.id) ||
      activeMatchByUserId.has(u.id) ||
      waitingByUserId.has(u.id)
  ).length;

  const handleSelectChallengePlayer = (player: UserRecord) => {
    setChallengedPlayer(player);
    handleSelectMode('online');
  };

  const handleQuickJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCodeInput.trim()) return;
    setJoiningCode(true);
    try {
      await onJoinMatchByCodeOrId(roomCodeInput.trim());
      setRoomCodeInput('');
    } finally {
      setJoiningCode(false);
    }
  };

  const handleTriggerCreate = async () => {
    const tp =
      TIME_PRESETS.find((t) => t.id === timePresetId) || TIME_PRESETS[1];
    const fen = selectedFen || STARTING_FEN;
    const effectiveOpponent: 'ai' | 'human' =
      createMode === 'vs_ai'
        ? 'ai'
        : createMode === 'online'
        ? 'human'
        : opponentType;

    setCreating(true);
    try {
      await onCreateMatch({
        mode: createMode,
        opponentType: effectiveOpponent,
        timeControlType: tp.type,
        initialTimeMs: tp.initialMs,
        incrementMs: tp.incrementMs,
        side: sideChoice,
        isRated: createMode === 'training' ? false : isRated,
        aiEngine,
        aiElo,
        analysisLevel: createMode === 'online' ? 'off' : analysisLevel,
        allowTakeback: createMode === 'online' ? false : allowTakeback,
        allowHints: createMode === 'online' ? false : allowHints,
        initialFen: fen,
        presetId:
          startTab === 'preset' && selectedPreset ? selectedPreset.id : null,
        targetOpponentId:
          createMode === 'online' && challengedPlayer
            ? challengedPlayer.id
            : null,
      });
    } finally {
      setCreating(false);
    }
  };

  const historyList =
    historyTab === 'mine'
      ? lobby?.my_history || []
      : historyTab === 'club'
      ? lobby?.club_history || []
      : lobby?.ai_history || [];

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto lg:overflow-hidden p-3.5 md:p-4">
      <div className="max-w-[1480px] mx-auto h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* =================================================================
            CỘT TRÁI (7/12): PHÒNG CHỜ + TRỰC TIẾP TRÊN SẢNH + KỲ THỦ ONLINE
           ================================================================= */}
        <section className="lg:col-span-7 flex flex-col gap-3.5 min-h-0 lg:h-full overflow-hidden">
          {/* 1. Thanh Phòng chờ & Nhập mã phòng */}
          <div className="bg-panel border border-line rounded-xl p-3 shrink-0 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-ink">
                  Phòng chờ &amp; Lời thách đấu ({lobby?.waiting_matches.length || 0})
                </span>
              </div>

              <form
                onSubmit={handleQuickJoinCode}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  maxLength={12}
                  value={roomCodeInput}
                  onChange={(e) =>
                    setRoomCodeInput(e.target.value.toUpperCase())
                  }
                  placeholder="Mã phòng #K9M2X4"
                  className="w-36 bg-inset border border-line rounded px-2.5 py-1 text-[11px] font-mono text-ink focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={joiningCode || !roomCodeInput.trim()}
                  className="px-2.5 py-1 rounded bg-accent hover:opacity-90 disabled:opacity-40 text-accent-ink text-[11px] font-semibold transition cursor-pointer"
                >
                  Vào phòng
                </button>
              </form>
            </div>

            {lobby && lobby.waiting_matches.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {lobby.waiting_matches.map((item) => {
                  const m = item.match;
                  const isDirectChallenge =
                    m.white_user_id !== m.black_user_id;
                  const isChallengingMe =
                    isDirectChallenge &&
                    (m.white_user_id === currentUser.id ||
                      m.black_user_id === currentUser.id);
                  const isMine =
                    m.white_user_id === currentUser.id &&
                    m.black_user_id === currentUser.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition ${
                        isChallengingMe
                          ? 'bg-accent/10 border-accent'
                          : 'bg-inset border-line hover:border-line-strong'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-ink truncate">
                          <span
                            className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
                              isChallengingMe ? 'bg-accent' : 'bg-amber-400'
                            }`}
                          />
                          <span className="truncate">
                            {isDirectChallenge
                              ? `${item.white_player.display_name} ⚔ ${item.black_player.display_name}`
                              : `${item.white_player.display_name} (${item.white_player.rating})`}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-ink-2 mt-0.5">
                          Mã #{m.room_code || '---'} ·{' '}
                          {m.initial_time_ms
                            ? `${Math.round(
                                m.initial_time_ms / 60000
                              )}+${Math.round(m.increment_ms / 1000)}`
                            : 'Tự do'}{' '}
                          · {m.is_rated ? 'Tính Elo' : 'Giao hữu'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onJoinMatchByCodeOrId(m.id)}
                        className="px-2.5 py-1 rounded bg-accent text-accent-ink text-[11px] font-semibold shrink-0 hover:opacity-90 transition cursor-pointer"
                      >
                        {isMine
                          ? 'Mở phòng ↗'
                          : isChallengingMe
                          ? 'Chấp nhận ↗'
                          : 'Vào đấu ↗'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-ink-3">
                Chưa có phòng chờ nào đang mở. Bạn có thể thách đấu trực tiếp kỳ
                thủ đang online bên dưới hoặc mở phòng mới ở cột phải.
              </div>
            )}
          </div>

          {/* 2. Vùng cuộn chính Cột Trái: Trận Tiêu Điểm + Danh sách Kỳ thủ Online */}
          <div className="flex-1 min-h-0 bg-panel border border-line rounded-xl p-3.5 flex flex-col gap-4 overflow-y-auto">
            {/* 2A. Trận Tiêu Điểm (Featured Live Stream) */}
            <div className="space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <h2 className="font-display text-sm font-semibold text-ink">
                    Trực tiếp trên Sảnh
                  </h2>
                  {featuredMatch?.is_system_exhibition && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-inset border border-line text-[10px] text-ink-2 font-mono">
                      <Sparkles className="w-3 h-3 text-accent" />
                      Trận biểu diễn AI đồng hạng Elo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => loadLobby(true)}
                  className="text-[11px] text-ink-2 hover:text-ink inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Làm mới
                </button>
              </div>

              {featuredMatch ? (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-inset border border-line rounded-xl p-3.5">
                  {/* Bàn cờ Live Stream */}
                  <div className="md:col-span-6 flex justify-center">
                    <div
                      style={{ width: 236, height: 236 }}
                      className="rounded-md overflow-hidden border border-line shadow-xl shrink-0"
                    >
                      <Chessboard
                        id="LobbyFeaturedBoard"
                        boardWidth={236}
                        position={featuredMatch.match.current_fen}
                        arePiecesDraggable={false}
                        customPieces={cburnettPieces}
                        customDarkSquareStyle={{
                          backgroundColor: boardTheme.dark,
                        }}
                        customLightSquareStyle={{
                          backgroundColor: boardTheme.light,
                        }}
                        animationDuration={220}
                      />
                    </div>
                  </div>

                  {/* Thông tin 2 kỳ thủ & Nút vào bàn */}
                  <div className="md:col-span-6 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      {/* Kỳ thủ Đen */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-line">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-3 h-3 rounded-xs bg-sq-b border border-line-strong shrink-0" />
                          <span className="text-xs font-semibold text-ink truncate">
                            {featuredMatch.black_player.display_name}
                          </span>
                          <span className="font-mono text-[11px] text-ink-2">
                            ({featuredMatch.black_player.rating})
                          </span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-ink tabular-nums">
                          {formatClockMs(featuredMatch.match.black_clock_ms)}
                        </span>
                      </div>

                      {/* Trạng thái giữa */}
                      <div className="flex items-center justify-between px-1 text-[11px] text-ink-2 font-mono">
                        <span>
                          Nước #
                          {Math.ceil(
                            (featuredMatch.match.total_plies || 1) / 2
                          )}{' '}
                          ({featuredMatch.match.total_plies} ply)
                        </span>
                        <span>
                          Lượt:{' '}
                          {featuredMatch.match.current_turn === 'w'
                            ? 'Trắng'
                            : 'Đen'}
                        </span>
                      </div>

                      {/* Kỳ thủ Trắng */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-line">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-3 h-3 rounded-xs bg-sq-w border border-line-strong shrink-0" />
                          <span className="text-xs font-semibold text-ink truncate">
                            {featuredMatch.white_player.display_name}
                          </span>
                          <span className="font-mono text-[11px] text-ink-2">
                            ({featuredMatch.white_player.rating})
                          </span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-ink tabular-nums">
                          {formatClockMs(featuredMatch.match.white_clock_ms)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] text-ink-2 flex items-center justify-between font-mono">
                        <span>
                          Phòng #{featuredMatch.match.room_code || 'LIVE'}
                        </span>
                        <span>
                          {featuredMatch.is_system_exhibition
                            ? 'AI vs AI Live'
                            : featuredMatch.match.mode === 'online'
                            ? 'Đấu Online'
                            : 'Đấu với AI'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenLiveMatch(featuredMatch.match.id)}
                        className="w-full py-2 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {featuredMatch.match.white_user_id === currentUser.id ||
                        featuredMatch.match.black_user_id === currentUser.id ? (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Tiếp tục thi đấu ↗
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            Vào xem trực tiếp &amp; Bật Eval ↗
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-ink-3">
                  {loading
                    ? 'Đang kết nối luồng trực tiếp…'
                    : 'Chưa có trận đấu nào đang diễn ra.'}
                </div>
              )}

              {/* Lưới các bàn đang diễn ra khác */}
              {lobby && lobby.live_matches.length > 1 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-semibold text-ink-2">
                    Các bàn đang thi đấu khác ({lobby.live_matches.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {lobby.live_matches.map((item) => {
                      const isSelected =
                        featuredMatch?.match.id === item.match.id;
                      return (
                        <div
                          key={item.match.id}
                          onClick={() => setSelectedLiveId(item.match.id)}
                          className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center gap-2.5 ${
                            isSelected
                              ? 'bg-card border-accent ring-1 ring-accent'
                              : 'bg-inset border-line hover:border-line-strong'
                          }`}
                        >
                          <div
                            style={{ width: 64, height: 64 }}
                            className="rounded overflow-hidden border border-line shrink-0"
                          >
                            <Chessboard
                              id={`MiniBoard-${item.match.id}`}
                              boardWidth={64}
                              position={item.match.current_fen}
                              arePiecesDraggable={false}
                              customPieces={cburnettPieces}
                              customDarkSquareStyle={{
                                backgroundColor: boardTheme.dark,
                              }}
                              customLightSquareStyle={{
                                backgroundColor: boardTheme.light,
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-[11px] font-semibold text-ink truncate">
                              {item.white_player.display_name}
                            </div>
                            <div className="text-[11px] text-ink-2 truncate">
                              vs {item.black_player.display_name}
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-ink-3">
                              <span>{item.match.total_plies} ply</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenLiveMatch(item.match.id);
                                }}
                                className="text-accent hover:underline cursor-pointer"
                              >
                                Mở bàn ↗
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2B. Danh sách Kỳ thủ trên Sảnh (Players Online) kèm nút Hồ sơ & Thách đấu */}
            <div className="pt-2 border-t border-line space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-display text-sm font-semibold text-ink">
                    Kỳ thủ trên Sảnh
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-mono font-semibold">
                    {onlineCount} trực tuyến
                  </span>
                </div>
                <span className="text-[10px] text-ink-3">
                  Chọn kỳ thủ để xem Hồ sơ hoặc Thách đấu trực tiếp
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {playersList.map((p) => {
                  const isMe = p.id === currentUser.id;
                  const activeMatchId = activeMatchByUserId.get(p.id) || null;
                  const waitingMatchId = waitingByUserId.get(p.id) || null;
                  const online =
                    isPlayerRecentlyOnline(p, currentUser.id) ||
                    Boolean(activeMatchId) ||
                    Boolean(waitingMatchId);
                  const isTargetChallenged = challengedPlayer?.id === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`px-3 py-2.5 rounded-lg border transition flex items-center justify-between gap-2 ${
                        isTargetChallenged
                          ? 'bg-card border-accent ring-1 ring-accent'
                          : 'bg-inset border-line hover:border-line-strong'
                      }`}
                    >
                      <div
                        onClick={() => setProfileUser(p)}
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                        title="Xem hồ sơ chi tiết"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            activeMatchId
                              ? 'bg-amber-400 animate-pulse'
                              : waitingMatchId
                              ? 'bg-sky-400'
                              : online
                              ? 'bg-emerald-400'
                              : 'bg-ink-3'
                          }`}
                        />

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-ink hover:text-accent truncate transition">
                              {p.display_name}
                            </span>
                            {isMe && (
                              <span className="px-1 py-0.2 rounded bg-accent/20 text-accent text-[9px] font-mono font-semibold shrink-0">
                                BẠN
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-2">
                            <span className="font-semibold text-ink">
                              {p.rating} Elo
                            </span>
                            <span>·</span>
                            <span>
                              {p.wins}T/{p.draws}H/{p.losses}B
                            </span>
                            {activeMatchId && (
                              <>
                                <span>·</span>
                                <span className="text-amber-300">Đang đấu</span>
                              </>
                            )}
                            {!activeMatchId && waitingMatchId && (
                              <>
                                <span>·</span>
                                <span className="text-sky-300">Phòng chờ</span>
                              </>
                            )}
                            {!activeMatchId && !waitingMatchId && online && (
                              <>
                                <span>·</span>
                                <span className="text-emerald-300">
                                  Trực tuyến
                                </span>
                              </>
                            )}
                            {!activeMatchId &&
                              !waitingMatchId &&
                              !online && (
                                <>
                                  <span>·</span>
                                  <span className="text-ink-3">
                                    Ngoại tuyến
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setProfileUser(p)}
                          className="px-2 py-1 rounded bg-card hover:bg-panel border border-line text-[10px] font-medium text-ink-2 hover:text-ink inline-flex items-center gap-1 transition cursor-pointer"
                          title={`Xem hồ sơ của ${p.display_name}`}
                        >
                          <UserCircle2 className="w-3 h-3" />
                          Hồ sơ
                        </button>

                        {!isMe && (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenDm(p)}
                              className="px-2 py-1 rounded bg-card hover:bg-panel border border-line text-[10px] font-medium text-ink-2 hover:text-ink inline-flex items-center gap-1 transition cursor-pointer"
                              title={`Nhắn tin riêng ${p.display_name}`}
                            >
                              <MessageSquare className="w-3 h-3" />
                              Nhắn tin
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectChallengePlayer(p)}
                              className={`px-2.5 py-1 rounded text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                                isTargetChallenged
                                  ? 'bg-accent text-accent-ink'
                                  : 'bg-accent/15 hover:bg-accent text-accent hover:text-accent-ink border border-accent/40'
                              }`}
                              title={`Thách đấu trực tiếp ${p.display_name}`}
                            >
                              <Swords className="w-3 h-3" />
                            Thách đấu
                          </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chat Sảnh — mọi thành viên, khối dưới danh sách Kỳ thủ */}
              <LobbyChat
                currentUser={currentUser}
                knownUsers={[...playersList, ...(lobby?.bots ?? [])]}
              />
            </div>
          </div>
        </section>

        {/* =================================================================
            CỘT PHẢI (5/12): MENU TẠO TRẬN MỚI (TRÊN) + LỊCH SỬ ĐẤU (DƯỚI)
           ================================================================= */}
        <section className="lg:col-span-5 flex flex-col gap-3.5 min-h-0 lg:h-full overflow-hidden">
          {/* 1. Khối trên: Menu Tạo trận mới (đầy đủ tùy chỉnh như PreMatchDialog) */}
          <div className="bg-panel border border-line rounded-xl p-3.5 space-y-2.5 lg:max-h-[64%] overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-accent" />
                <h2 className="font-display text-sm font-semibold text-ink">
                  Tạo trận đấu mới
                </h2>
              </div>
              <button
                type="button"
                onClick={onOpenBoardEditor}
                className="text-[10px] text-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                Tự xếp cờ ↗
              </button>
            </div>

            {/* 1. 3 Tab chế độ chơi (MODE_PRESETS) */}
            <div className="grid grid-cols-3 gap-1.5 bg-inset p-1 rounded-lg border border-line">
              {(
                [
                  ['online', 'Đấu Bạn Bè', <Users className="w-3.5 h-3.5" />],
                  ['vs_ai', 'Đấu với AI', <Bot className="w-3.5 h-3.5" />],
                  [
                    'training',
                    'Học Tập',
                    <GraduationCap className="w-3.5 h-3.5" />,
                  ],
                ] as const
              ).map(([id, label, icon]) => {
                const active = createMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectMode(id)}
                    className={`py-1.5 px-2 rounded-md text-[11px] inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      active
                        ? 'bg-accent text-accent-ink font-semibold shadow-sm'
                        : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    {icon}
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Banner Đối thủ đang được chọn để Thách đấu trực tiếp */}
            {createMode === 'online' && challengedPlayer && (
              <div className="px-3 py-2 rounded-lg bg-accent/10 border border-accent flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Swords className="w-3.5 h-3.5 text-accent shrink-0" />
                  <div className="text-xs text-ink truncate">
                    Thách đấu:{' '}
                    <strong className="font-semibold">
                      {challengedPlayer.display_name}
                    </strong>{' '}
                    <span className="font-mono text-[10px] text-ink-2">
                      ({challengedPlayer.rating} Elo)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChallengedPlayer(null)}
                  className="p-1 rounded hover:bg-card text-ink-2 hover:text-ink transition cursor-pointer"
                  title="Bỏ chọn đối thủ (Tạo phòng chờ mở)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 2. Thế cờ xuất phát (Tiêu chuẩn | Thế cờ mẫu | Tự xếp cờ ↗) */}
            <div className="bg-inset rounded-lg border border-line p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-ink-2">
                  Thế cờ xuất phát
                </span>
                <div className="inline-flex bg-card p-0.5 rounded border border-line text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setStartTab('standard');
                      setSelectedPresetId('standard');
                    }}
                    className={`px-2 py-0.5 rounded-xs font-medium transition cursor-pointer ${
                      startTab === 'standard'
                        ? 'bg-accent text-accent-ink'
                        : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    Tiêu chuẩn
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartTab('preset');
                      if (
                        selectedPresetId === 'standard' &&
                        nonStandardPresets[0]
                      ) {
                        setSelectedPresetId(nonStandardPresets[0].id);
                        try {
                          setSideChoice(
                            new Chess(nonStandardPresets[0].fen).turn()
                          );
                        } catch {
                          // ignore
                        }
                      }
                    }}
                    className={`px-2 py-0.5 rounded-xs font-medium transition cursor-pointer ${
                      startTab === 'preset'
                        ? 'bg-accent text-accent-ink'
                        : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    Thế cờ mẫu ({nonStandardPresets.length})
                  </button>
                  <button
                    type="button"
                    onClick={onOpenBoardEditor}
                    className="px-2 py-0.5 rounded-xs font-medium text-ink-2 hover:text-ink inline-flex items-center gap-1 transition cursor-pointer"
                    title="Mở công cụ Xếp cờ hoặc dán FEN/PGN"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    Tự xếp ↗
                  </button>
                </div>
              </div>

              {startTab === 'preset' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedPreset?.id || ''}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedPresetId(nextId);
                        const found = presets.find((p) => p.id === nextId);
                        if (found) {
                          try {
                            setSideChoice(new Chess(found.fen).turn());
                          } catch {
                            // ignore
                          }
                        }
                      }}
                      className="flex-1 bg-card border border-line rounded px-2 py-1 text-[11px] text-ink focus:outline-none focus:border-accent cursor-pointer"
                    >
                      {nonStandardPresets.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          className="bg-card text-ink"
                        >
                          [{p.category}] {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-line text-ink-2">
                      Lượt: {startTurnSide === 'w' ? 'Trắng' : 'Đen'}
                    </span>
                  </div>
                  {selectedPreset?.description && (
                    <div className="text-[10px] text-ink-2 leading-snug">
                      {selectedPreset.description}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Thời gian suy nghĩ (Fischer Clock) & Quân của bạn */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-7">
                <label className="block text-[10px] text-ink-2 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Thời gian (Fischer Clock)
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {TIME_PRESETS.map((tp) => {
                    const active = timePresetId === tp.id;
                    return (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => setTimePresetId(tp.id)}
                        className={`py-1 px-1.5 rounded border text-center transition cursor-pointer ${
                          active
                            ? 'bg-card border-accent ring-1 ring-accent text-ink font-semibold'
                            : 'bg-inset border-line text-ink-2 hover:text-ink'
                        }`}
                      >
                        <div className="font-mono text-[11px]">{tp.label}</div>
                        <div className="text-[9px] text-ink-3">{tp.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[10px] text-ink-2 mb-1">
                  Quân của bạn
                </label>
                <div className="grid grid-cols-3 gap-1 bg-inset p-1 rounded border border-line">
                  {(
                    [
                      ['w', 'Trắng'],
                      ['random', 'Ngẫu nhiên'],
                      ['b', 'Đen'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSideChoice(val)}
                      className={`py-1.5 rounded text-[10px] transition cursor-pointer ${
                        sideChoice === val
                          ? 'bg-accent text-accent-ink font-semibold'
                          : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Cấu hình Đối thủ & Engine AI (khi ở vs_ai hoặc training) */}
            {createMode !== 'online' ? (
              <div className="bg-inset rounded-lg border border-line p-2.5 space-y-2">
                {/* Ở chế độ Học Tập (training), cho phép chọn Máy (AI) hoặc 2 Người trên 1 máy */}
                {createMode === 'training' && (
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-line">
                    <span className="text-[10px] font-medium text-ink-2">
                      Đối thủ luyện tập
                    </span>
                    <div className="inline-flex bg-card p-0.5 rounded border border-line text-[10px]">
                      <button
                        type="button"
                        onClick={() => setOpponentType('ai')}
                        className={`px-2 py-0.5 rounded-xs font-medium inline-flex items-center gap-1 transition cursor-pointer ${
                          opponentType === 'ai'
                            ? 'bg-accent text-accent-ink'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Bot className="w-3 h-3" />
                        Máy (AI)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpponentType('human')}
                        className={`px-2 py-0.5 rounded-xs font-medium inline-flex items-center gap-1 transition cursor-pointer ${
                          opponentType === 'human'
                            ? 'bg-accent text-accent-ink'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Users className="w-3 h-3" />
                        2 Người (1 máy)
                      </button>
                    </div>
                  </div>
                )}

                {(createMode === 'vs_ai' || opponentType === 'ai') && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        {(['maia', 'stockfish'] as const).map((eng) => (
                          <button
                            key={eng}
                            type="button"
                            onClick={() => {
                              setAiEngine(eng);
                              setAiElo(eng === 'maia' ? 1500 : 1800);
                            }}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                              aiEngine === eng
                                ? 'bg-accent text-accent-ink font-semibold'
                                : 'bg-card text-ink-2 hover:text-ink'
                            }`}
                          >
                            {eng === 'maia'
                              ? 'Maia (Giống người)'
                              : 'Stockfish 17'}
                          </button>
                        ))}
                      </div>
                      <span className="font-mono text-[11px] text-ink font-semibold tabular-nums">
                        {aiElo} Elo
                      </span>
                    </div>

                    {aiEngine === 'maia' ? (
                      <div className="space-y-1">
                        <div className="grid grid-cols-9 gap-1">
                          {MAIA_ELOS.map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setAiElo(lvl)}
                              className={`py-0.5 rounded text-[10px] font-mono border transition cursor-pointer ${
                                aiElo === lvl
                                  ? 'bg-accent border-accent text-accent-ink font-semibold'
                                  : 'bg-card border-line text-ink-2 hover:text-ink'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                        {lc0Ready === false && (
                          <div className="text-[10px] text-amber-300">
                            ⚠ lc0 chưa sẵn sàng — Maia sẽ tạm dùng Stockfish giới
                            hạn Elo tương đương.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1320}
                          max={3190}
                          step={50}
                          value={aiElo}
                          onChange={(e) => setAiElo(Number(e.target.value))}
                          className="flex-1 accent-accent cursor-pointer"
                        />
                        <span className="font-mono text-[10px] text-ink-2">
                          1320–3190
                        </span>
                      </div>
                    )}
                  </>
                )}

                {createMode === 'vs_ai' && (
                  <div className="flex items-center justify-between pt-1 border-t border-line text-[11px]">
                    <span className="text-ink-2">
                      Tính điểm Elo câu lạc bộ khi đấu với AI
                    </span>
                    <input
                      type="checkbox"
                      checked={isRated}
                      onChange={(e) => setIsRated(e.target.checked)}
                      className="accent-accent cursor-pointer"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-inset border border-line text-[11px]">
                <span className="text-ink-2">
                  Chế độ tính điểm Elo câu lạc bộ
                </span>
                <input
                  type="checkbox"
                  checked={isRated}
                  onChange={(e) => setIsRated(e.target.checked)}
                  className="accent-accent cursor-pointer"
                />
              </div>
            )}

            {/* 5. Mức phân tích khi đang chơi & Quyền hỗ trợ (Takeback / Hint) */}
            <div className="bg-inset rounded-lg border border-line p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-ink-2">
                  Mức phân tích khi đang chơi
                </span>
                {createMode === 'online' && (
                  <span className="text-[10px] text-amber-300 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Khóa khi Đấu Bạn Bè
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(['off', 'eval_only', 'full'] as AnalysisLevel[]).map(
                  (lvl) => {
                    const meta = ANALYSIS_LEVEL_LABELS[lvl];
                    const effectiveLvl =
                      createMode === 'online' ? 'off' : analysisLevel;
                    const active = effectiveLvl === lvl;
                    const disabled = createMode === 'online' && lvl !== 'off';
                    return (
                      <button
                        key={lvl}
                        type="button"
                        disabled={disabled}
                        onClick={() => setAnalysisLevel(lvl)}
                        className={`p-1.5 rounded border text-left transition ${
                          disabled
                            ? 'opacity-35 cursor-not-allowed border-line bg-card/30'
                            : active
                            ? 'border-accent bg-card text-ink ring-1 ring-accent cursor-pointer'
                            : 'border-line bg-card/40 text-ink-2 hover:text-ink cursor-pointer'
                        }`}
                        title={meta.description}
                      >
                        <div className="text-[10px] font-semibold truncate">
                          {meta.label}
                        </div>
                        <div className="text-[9px] text-ink-3 truncate">
                          {meta.description}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>

              {/* Quyền hỗ trợ: Đi lại nước (takeback) & Gợi ý (hint) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line text-[11px]">
                <label
                  className={`inline-flex items-center gap-1.5 ${
                    createMode === 'online'
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={createMode === 'online'}
                    checked={createMode === 'online' ? false : allowTakeback}
                    onChange={(e) => setAllowTakeback(e.target.checked)}
                    className="accent-accent"
                  />
                  <span className="text-ink-2">
                    Cho phép đi lại nước (takeback)
                  </span>
                </label>

                <label
                  className={`inline-flex items-center gap-1.5 ${
                    createMode === 'online'
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={createMode === 'online'}
                    checked={createMode === 'online' ? false : allowHints}
                    onChange={(e) => setAllowHints(e.target.checked)}
                    className="accent-accent"
                  />
                  <span className="text-ink-2">Cho phép gợi ý (hint)</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={handleTriggerCreate}
              className="w-full py-2.5 rounded-lg bg-accent hover:opacity-90 disabled:opacity-50 text-accent-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5" />
              {creating
                ? 'Đang khởi tạo bàn cờ…'
                : createMode === 'online'
                ? challengedPlayer
                  ? `Gửi Thách Đấu Tới ${challengedPlayer.display_name} ↗`
                  : 'Mở Phòng Đấu Bạn Bè ↗'
                : createMode === 'training'
                ? 'Bắt Đầu Luyện Tập ↗'
                : 'Bắt Đầu Ván Đấu ↗'}
            </button>
          </div>

          {/* 2. Khối dưới: Lịch sử đấu (Match History) */}
          <div className="flex-1 min-h-0 bg-panel border border-line rounded-xl p-4 flex flex-col gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-accent" />
                <h2 className="font-display text-sm font-semibold text-ink">
                  Lịch sử đấu
                </h2>
              </div>

              <div className="inline-flex bg-inset p-0.5 rounded border border-line text-[10px]">
                <button
                  type="button"
                  onClick={() => setHistoryTab('mine')}
                  className={`px-2 py-0.5 rounded-xs transition cursor-pointer ${
                    historyTab === 'mine'
                      ? 'bg-accent text-accent-ink font-semibold'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  Ván của tôi
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('club')}
                  className={`px-2 py-0.5 rounded-xs transition cursor-pointer ${
                    historyTab === 'club'
                      ? 'bg-accent text-accent-ink font-semibold'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  Toàn sảnh
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('ai')}
                  className={`px-2 py-0.5 rounded-xs transition cursor-pointer ${
                    historyTab === 'ai'
                      ? 'bg-accent text-accent-ink font-semibold'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  AI vs AI
                </button>
              </div>
            </div>

            {/* Thanh tóm tắt chỉ số cá nhân */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-inset border border-line text-[11px] font-mono shrink-0">
              <span className="inline-flex items-center gap-1 text-ink font-semibold">
                <Trophy className="w-3.5 h-3.5 text-accent" />
                {currentUser.rating} Elo
              </span>
              <span className="text-ink-2">
                {currentUser.wins}T · {currentUser.draws}H ·{' '}
                {currentUser.losses}B
              </span>
              <span className="text-ink-2">
                Chuẩn TB:{' '}
                {currentUser.avg_accuracy != null
                  ? `${currentUser.avg_accuracy.toFixed(1)}%`
                  : '—'}
              </span>
            </div>

            {/* Danh sách cuộn các ván đã kết thúc */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {historyList.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-3">
                  Chưa có ván đấu nào hoàn tất.
                </div>
              ) : (
                historyList.map((item) => {
                  const m = item.match;
                  const isWhite = m.white_user_id === currentUser.id;
                  const isParticipant =
                    isWhite || m.black_user_id === currentUser.id;
                  const mySide = isWhite ? 'w' : 'b';
                  const opponent = isWhite
                    ? item.black_player
                    : item.white_player;

                  let outcomeLabel: string = m.result;
                  let outcomeClass = 'bg-card text-ink-2 border-line';
                  if (isParticipant) {
                    const won =
                      (mySide === 'w' && m.result === '1-0') ||
                      (mySide === 'b' && m.result === '0-1');
                    const drew = m.result === '1/2-1/2';
                    if (won) {
                      outcomeLabel = 'THẮNG';
                      outcomeClass =
                        'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
                    } else if (drew) {
                      outcomeLabel = 'HÒA';
                      outcomeClass =
                        'bg-amber-500/15 text-amber-300 border-amber-500/40';
                    } else {
                      outcomeLabel = 'THUA';
                      outcomeClass =
                        'bg-red-500/15 text-red-300 border-red-500/40';
                    }
                  }

                  const myDelta = isWhite
                    ? m.white_rating_delta
                    : m.black_rating_delta;
                  const myAcc = isWhite ? m.white_accuracy : m.black_accuracy;

                  return (
                    <div
                      key={m.id}
                      onClick={() => onOpenHistoryMatchReview(m.id)}
                      className="px-3 py-2 rounded-lg bg-inset border border-line hover:border-accent/60 transition flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${outcomeClass}`}
                        >
                          {outcomeLabel}
                        </span>

                        <div className="min-w-0">
                          <div className="text-xs font-medium text-ink truncate">
                            {isParticipant
                              ? `vs ${opponent.display_name} (${opponent.rating})`
                              : `${item.white_player.display_name} vs ${item.black_player.display_name}`}
                          </div>
                          <div className="text-[10px] font-mono text-ink-3 truncate">
                            {Math.ceil(m.total_plies / 2)} nước ·{' '}
                            {m.termination || 'Hoàn tất'} ·{' '}
                            {m.created_at.slice(0, 10)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                        {isParticipant && myDelta != null && myDelta !== 0 && (
                          <span
                            className={
                              myDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                            }
                          >
                            {myDelta > 0 ? `+${myDelta}` : myDelta}
                          </span>
                        )}
                        {myAcc != null ? (
                          <span className="px-1.5 py-0.5 rounded bg-card border border-line text-[10px] text-ink">
                            {myAcc.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-accent hover:underline">
                            Review ↗
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Modal Hồ sơ Kỳ thủ */}
      <PlayerProfileModal
        userId={profileUser?.id || null}
        initialUser={profileUser}
        currentUser={currentUser}
        isOnline={
          profileUser
            ? isPlayerRecentlyOnline(profileUser, currentUser.id)
            : false
        }
        activeMatchId={
          profileUser ? activeMatchByUserId.get(profileUser.id) || null : null
        }
        onClose={() => setProfileUser(null)}
        onChallengePlayer={handleSelectChallengePlayer}
        onOpenLiveMatch={onOpenLiveMatch}
        onOpenHistoryMatchReview={onOpenHistoryMatchReview}
      />
    </div>
  );
};
