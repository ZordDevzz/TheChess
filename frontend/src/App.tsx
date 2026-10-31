import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { Chess, Square as ChessSquare } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import {
  analyzePosition,
  appendMatchMoveApi,
  classifySingleMove,
  createMatchApi,
  fetchStatus,
  finishMatchApi,
  getMatchApi,
  joinMatchApi,
  requestAIMove,
  saveMatchReviewApi,
  takebackMatchApi,
} from './api';
import {
  AppScreen,
  EngineStatus,
  GameConfig,
  AssistantEngineConfig,
  NotificationItem,
  GameOverInfo,
  GamePhase,
  MatchRecord,
  MatchWithDetailsResponse,
  MoveRecord,
  PlayerInfo,
  PVLine,
  UserRecord,
} from './types';
import { Toasts, useToasts, ToastItem, ToastKind } from './components/Toasts';
import { LoginScreen } from './components/LoginScreen';
import { notifyBrowser, playTickSound } from './components/NotificationBell';
import { AppHeader } from './components/AppHeader';
import { MatchScreen } from './components/MatchScreen';
import { MatchModals } from './components/MatchModals';
import { useNotifications } from './hooks/useNotifications';
import { HomeScreen, QuickCreateMatchOptions } from './components/HomeScreen';
import {
  STARTING_FEN,
  ANALYSIS_LEVEL_LABELS,
  MODE_PRESETS,
  alignPlayersWithColor,
  boardMapToFenPlacement,
  buildPgn,
  clearSavedGame,
  detailRecordsToMoveRecords,
  detectGameOver,
  downloadPgn,
  fenToBoardMap,
  getMaterialInfo,
  loadSavedGame,
  makeDefaultPlayers,
  resolveFeatureVisibility,
  saveGame,
} from './gameUtils';
import type { EditorTool } from './components/BoardEditor';
import {
  ARROW_COLORS,
  CLASSIFICATION_META,
  HINT_ARROW_COLOR,
} from './theme/semantic';
import { squareOverlays } from './theme/board';
import { cburnettPieces } from './theme/pieces';
import { ThemePicker } from './theme/ThemePicker';
import { useTheme } from './theme/ThemeProvider';
import { useBoardSize } from './hooks/useBoardSize';
import { useGameReview } from './hooks/useGameReview';
import { useChessClock } from './hooks/useChessClock';
import { resetRealtime } from './hooks/useRealtime';
import { useMatchSync } from './hooks/useMatchSync';
import { useAnalysisController } from './hooks/useAnalysisController';
import { useLiveClassification } from './hooks/useLiveClassification';
import { AuthProvider, useAuth } from './context/AuthContext';

// Code splitting (P2-2): các màn hình nặng chỉ tải khi cần tới
const AdminScreen = React.lazy(() =>
  import('./components/AdminScreen').then((m) => ({ default: m.AdminScreen }))
);
const LabScreen = React.lazy(() =>
  import('./components/LabScreen').then((m) => ({ default: m.LabScreen }))
);

const LazyFallback: React.FC = () => (
  <div className="flex-1 min-h-[200px] flex items-center justify-center text-xs font-mono text-ink-3">
    Đang tải...
  </div>
);

// Ván cờ đã lưu trong localStorage (nếu có), đọc một lần khi mount
const SAVED_GAME = loadSavedGame();

function userRecordToPlayerInfo(
  u: UserRecord | null,
  fallbackName: string,
  aiEloOverride?: number | null
): PlayerInfo {
  if (!u) {
    return {
      name: fallbackName,
      type: 'human',
    };
  }
  if (u.is_bot) {
    return {
      name: u.display_name,
      type: 'ai',
      ai: {
        engine: (u.bot_engine as 'maia' | 'stockfish') || 'maia',
        elo: aiEloOverride || u.bot_default_elo || u.rating || 1500,
      },
    };
  }
  return {
    name: u.display_name,
    type: 'human',
  };
}

interface AppShellProps {
  toasts: ToastItem[];
  pushToast: (msg: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
}

/**
 * App — provider ngoài cùng: toast + auth context, phần logic ván cờ
 * nằm trong AppShell (dùng useAuth()).
 */
export const App: React.FC = () => {
  const { toasts, pushToast, dismissToast } = useToasts();

  return (
    <AuthProvider pushToast={pushToast}>
      <AppShell toasts={toasts} pushToast={pushToast} dismissToast={dismissToast} />
    </AuthProvider>
  );
};

const AppShell: React.FC<AppShellProps> = ({
  toasts,
  pushToast,
  dismissToast,
}) => {
  const { boardTheme } = useTheme();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  // --- Auth (AuthContext) & Điều hướng màn hình ---
  const {
    currentUser,
    authChecking,
    loginError,
    showPasswordModal,
    setShowPasswordModal,
    login,
    logout,
    changePassword,
    refreshCurrentUser,
  } = useAuth();
  const [screen, setScreen] = useState<AppScreen>('home');
  const [activeTab, setActiveTab] = useState<'play' | 'editor'>('play');

  // --- Trạng thái ván đấu Multiplayer ---
  const [activeMatch, setActiveMatch] = useState<MatchRecord | null>(null);
  // Đối tượng chat DM đang mở (UserRecord tối giản từ Sảnh / notification)
  const [dmTarget, setDmTarget] = useState<UserRecord | null>(null);
  const [isSpectator, setIsSpectator] = useState<boolean>(false);
  const [whiteRating, setWhiteRating] = useState<number | null>(null);
  const [blackRating, setBlackRating] = useState<number | null>(null);

  // --- Biên bản ván cờ ---
  const [initialFen, setInitialFen] = useState<string>(
    SAVED_GAME?.initialFen ?? STARTING_FEN
  );
  const [moves, setMoves] = useState<MoveRecord[]>(SAVED_GAME?.moves ?? []);
  const [currentPly, setCurrentPly] = useState<number>(
    SAVED_GAME ? SAVED_GAME.currentPly : 0
  );
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
    SAVED_GAME?.playerColor === 'b' ? 'black' : 'white'
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(
    null
  );

  // --- Vòng đời ván đấu ---
  const [phase, setPhase] = useState<GamePhase>(SAVED_GAME?.phase ?? 'setup');
  const [config, setConfig] = useState<GameConfig>(
    SAVED_GAME?.config ?? MODE_PRESETS[1].defaultConfig
  );
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>(
    SAVED_GAME?.playerColor ?? 'w'
  );
  const [players, setPlayers] = useState<{ w: PlayerInfo; b: PlayerInfo }>(() =>
    SAVED_GAME?.players ?? makeDefaultPlayers(SAVED_GAME?.playerColor ?? 'w')
  );
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(
    SAVED_GAME?.gameOver ?? null
  );
  const [showPreMatch, setShowPreMatch] = useState(
    (SAVED_GAME?.phase ?? 'setup') === 'setup'
  );
  const [showGameOver, setShowGameOver] = useState(
    SAVED_GAME?.phase === 'finished'
  );
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewArrowMode, setReviewArrowMode] = useState<'played' | 'suggestions'>('played');
  const [reviewLines, setReviewLines] = useState<PVLine[] | null>(null);
  const [hintArrow, setHintArrow] = useState<Arrow | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Engine trợ lý cho nút "AI đi" (training) & "Gợi ý" — cấu hình bởi người
  // dùng trong EnginePanel, lưu localStorage để giữ giữa các phiên.
  const [assistantEngine, setAssistantEngine] =
    useState<AssistantEngineConfig>(() => {
      try {
        const raw = window.localStorage.getItem('thechess_assistant');
        if (raw) {
          const parsed = JSON.parse(raw) as AssistantEngineConfig;
          if (
            (parsed.engine === 'maia' || parsed.engine === 'stockfish') &&
            Number.isFinite(parsed.elo)
          ) {
            return parsed;
          }
        }
      } catch {
        // ignore
      }
      return { engine: 'maia', elo: 1500 };
    });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'thechess_assistant',
        JSON.stringify(assistantEngine)
      );
    } catch {
      // ignore
    }
  }, [assistantEngine]);

  // --- Board Editor ---
  const [editorBoardMap, setEditorBoardMap] = useState<Record<string, string>>(
    () => fenToBoardMap(STARTING_FEN)
  );
  const [editorTool, setEditorTool] = useState<EditorTool>('wQ');

  const { boardStageRef, boardSize, showSideRails } = useBoardSize(
    activeTab,
    `${screen}-${authChecking}`
  );
  const {
    reviewResult,
    isReviewing,
    reviewProgress,
    handleRunGameReview,
    resetReview,
  } = useGameReview({
    initialFen,
    moves,
    setMoves,
    pushToast,
  });

  // ------------------ Auth handlers (bọc AuthContext) ------------------

  const handleLogin = async (username: string, password: string) => {
    const user = await login(username, password);
    setScreen('home');
    pushToast(`Chào mừng trở lại, ${user.display_name}!`, 'success');
  };

  const handleLogout = () => {
    logout();
    resetRealtime(); // đóng WS realtime — đăng nhập mới sẽ mở lại token mới
    setActiveMatch(null);
    setScreen('home');
  };

  const handlePasswordChange = async (newPassword: string, displayName: string) => {
    await changePassword(newPassword, displayName);
    pushToast('Đã cập nhật hồ sơ & mật khẩu thành công.', 'success');
  };

  // ------------------ Derived ------------------

  const currentFen =
    currentPly === 0 ? initialFen : moves[currentPly - 1]?.fenAfter || initialFen;

  const chessInstance = useMemo(() => {
    try {
      return new Chess(currentFen);
    } catch {
      return new Chess();
    }
  }, [currentFen]);

  // Bảng năng lực duy nhất cho toàn bộ sidebar MatchScreen (P-gating):
  // khán giả & ván server được xử lý ngay trong resolveFeatureVisibility.
  const visibility = useMemo(
    () =>
      resolveFeatureVisibility(config, phase, {
        isSpectator,
        isServerMatch: activeMatch != null,
      }),
    [config, phase, isSpectator, activeMatch]
  );

  const modeLabel =
    MODE_PRESETS.find((m) => m.id === config.mode)?.label ?? config.mode;

  const aiSide: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
  const aiPlayer =
    !isSpectator && config.opponent === 'ai' && players[aiSide]?.type === 'ai'
      ? players[aiSide]
      : null;

  const material = useMemo(() => getMaterialInfo(currentFen), [currentFen]);

  const analysisEnabled =
    screen === 'match' &&
    activeTab === 'play' &&
    (isSpectator ||
      phase === 'finished' ||
      (phase === 'playing' && config.analysis !== 'off'));

  // Hết giờ — cập nhật trạng thái ván đấu (useChessClock lo phần gọi backend)
  const handleClockTimeout = useCallback((info: GameOverInfo) => {
    setGameOver(info);
    setPhase('finished');
    setShowGameOver(true);
  }, []);

  // ------------------ Đồng hồ Fischer (useChessClock) ------------------

  const {
    whiteClockMs,
    blackClockMs,
    setWhiteClockMs,
    setBlackClockMs,
    lastTurnStartRef,
    turnStartClockRef,
    syncClockFromServer,
    resetClocks,
  } = useChessClock({
    screen,
    phase,
    activeMatch,
    isSpectator,
    turn: chessInstance.turn(),
    onTimeout: handleClockTimeout,
  });

  // ------------------ Phân tích live (useAnalysisController) ------------------

  const {
    analysis,
    isAnalyzing,
    showEval,
    setShowEval,
    showArrows,
    setShowArrows,
    multipv,
    setMultipv,
    depth,
    setDepth,
  } = useAnalysisController({
    currentFen,
    analysisEnabled,
    activeTab,
    isSpectator,
    phase,
    setMoves,
  });

  // Phân loại realtime cho nước đi ĐỒNG BỘ TỪ SERVER (khán giả xem live /
  // nước của đối thủ online) — executeMove chỉ classify nước người chơi tự đi.
  useLiveClassification({
    enabled:
      screen === 'match' &&
      activeTab === 'play' &&
      (isSpectator || visibility.classifyLive),
    moves,
    setMoves,
  });

  // Đổi màu quân người chơi kèm đồng bộ players.w ↔ players.b (tránh lỗi ISS-01)
  const handleChangePlayerColor = useCallback(
    (nextColor: 'w' | 'b') => {
      setPlayerColor(nextColor);
      setBoardOrientation(nextColor === 'w' ? 'white' : 'black');
      setPlayers((prev) =>
        alignPlayersWithColor(prev, nextColor, config.opponent)
      );
    },
    [config.opponent]
  );

  // ------------------ Hydrate Match từ Backend DB ------------------

  const hydrateMatchFromServer = useCallback(
    (
      res: MatchWithDetailsResponse,
      viewer: UserRecord,
      options?: { openReview?: boolean }
    ) => {
      const m = res.match;
      setActiveMatch(m);

      const isWhiteMe = m.white_user_id === viewer.id;
      const isBlackMe = m.black_user_id === viewer.id;
      const isSystemMatch =
        res.white_player?.is_bot && res.black_player?.is_bot;
      const participant = (isWhiteMe || isBlackMe) && !isSystemMatch;
      setIsSpectator(!participant);

      const mySide: 'w' | 'b' = isBlackMe && !isWhiteMe ? 'b' : 'w';
      setPlayerColor(mySide);
      setBoardOrientation(mySide === 'b' ? 'black' : 'white');

      const wInfo = userRecordToPlayerInfo(
        res.white_player,
        m.status === 'waiting' ? 'Đang chờ đối thủ...' : 'Trắng',
        m.ai_elo_override
      );
      const bInfo = userRecordToPlayerInfo(
        res.black_player,
        m.status === 'waiting' ? 'Đang chờ đối thủ...' : 'Đen',
        m.ai_elo_override
      );
      setPlayers({ w: wInfo, b: bInfo });
      setWhiteRating(m.white_rating_after ?? m.white_rating_before ?? res.white_player?.rating ?? null);
      setBlackRating(m.black_rating_after ?? m.black_rating_before ?? res.black_player?.rating ?? null);

      const hasBotPlayer = Boolean(
        res.white_player?.is_bot || res.black_player?.is_bot
      );
      const nextConfig: GameConfig = {
        mode: m.mode,
        analysis: m.analysis_level,
        allowTakeback: m.allow_takeback,
        allowHints: m.allow_hints,
        opponent: m.mode === 'vs_ai' || hasBotPlayer ? 'ai' : 'human',
      };
      setConfig(nextConfig);

      const fenStart = m.initial_fen || STARTING_FEN;
      const builtMoves = detailRecordsToMoveRecords(res.moves);
      setInitialFen(fenStart);
      setMoves(builtMoves);
      setCurrentPly(builtMoves.length);
      syncClockFromServer(
        m.white_clock_ms ?? m.initial_time_ms ?? null,
        m.black_clock_ms ?? m.initial_time_ms ?? null,
        builtMoves
      );

      resetReview();
      setSelectedSquare(null);
      setPendingPromo(null);
      setHintArrow(null);
      setShowPreMatch(false);

      if (m.status === 'finished' || m.status === 'aborted') {
        setPhase('finished');
        const winner =
          m.result === '1-0' ? 'w' : m.result === '0-1' ? 'b' : null;
        setGameOver({
          result: m.result === '*' ? '1/2-1/2' : m.result,
          reason: m.termination || 'Kết thúc ván đấu',
          winner,
        });
        setShowGameOver(!options?.openReview);
        setReviewMode(Boolean(options?.openReview));
      } else {
        setPhase('playing');
        setGameOver(null);
        setShowGameOver(false);
        setReviewMode(false);
      }

      setActiveTab('play');
      setScreen('match');
    },
    [resetReview, syncClockFromServer]
  );

  // ------------------ Lobby Callbacks ------------------

  const handleCreateMatchFromLobby = async (opts: QuickCreateMatchOptions) => {
    if (!currentUser) return;
    const chosenColor: 'w' | 'b' =
      opts.side === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : opts.side;

    let whiteId = currentUser.id;
    let blackId = currentUser.id;
    let matchStatus: 'waiting' | 'playing' = 'playing';

    const useBotOpponent =
      opts.mode === 'vs_ai' ||
      (opts.mode === 'training' && opts.opponentType === 'ai');

    if (opts.mode === 'online') {
      matchStatus = 'waiting';
      if (opts.targetOpponentId && opts.targetOpponentId !== currentUser.id) {
        if (chosenColor === 'w') {
          whiteId = currentUser.id;
          blackId = opts.targetOpponentId;
        } else {
          whiteId = opts.targetOpponentId;
          blackId = currentUser.id;
        }
      } else {
        // Tạm đặt cả 2 vị trí bằng user tạo phòng, khi người thứ 2 join sẽ gán vào vị trí còn lại
        whiteId = currentUser.id;
        blackId = currentUser.id;
      }
    } else if (useBotOpponent) {
      const nearestMaia = Math.min(
        1900,
        Math.max(1100, Math.round(opts.aiElo / 100) * 100)
      );
      const botId =
        opts.aiEngine === 'stockfish'
          ? 'bot_stockfish'
          : `bot_maia_${nearestMaia}`;
      if (chosenColor === 'w') {
        whiteId = currentUser.id;
        blackId = botId;
      } else {
        whiteId = botId;
        blackId = currentUser.id;
      }
    }

    const analysisLevel =
      opts.mode === 'online' ? 'off' : opts.analysisLevel;
    const allowTakeback =
      opts.mode === 'online' ? false : opts.allowTakeback;
    const allowHints = opts.mode === 'online' ? false : opts.allowHints;

    const res = await createMatchApi({
      mode: opts.mode,
      status: matchStatus,
      is_rated: opts.isRated,
      white_user_id: whiteId,
      black_user_id: blackId,
      ai_elo_override: useBotOpponent ? opts.aiElo : null,
      analysis_level: analysisLevel,
      allow_takeback: allowTakeback,
      allow_hints: allowHints,
      time_control_type: opts.timeControlType,
      initial_time_ms: opts.initialTimeMs,
      increment_ms: opts.incrementMs,
      preset_id: opts.presetId ?? null,
      initial_fen: opts.initialFen || STARTING_FEN,
      generate_room_code: opts.mode === 'online',
    });

    hydrateMatchFromServer(res, currentUser);
    if (res.match.status === 'waiting') {
      pushToast(
        `Đã tạo phòng chờ #${res.match.room_code}. Chia sẻ mã này cho đối thủ!`,
        'info'
      );
    } else {
      pushToast('Đã bắt đầu ván đấu mới!', 'success');
    }
  };

  const handleJoinMatchByCodeOrId = async (codeOrId: string) => {
    if (!currentUser) return;
    const res = await joinMatchApi(codeOrId);
    hydrateMatchFromServer(res, currentUser);
    pushToast(
      `Đã vào bàn đấu #${res.match.room_code || res.match.id.slice(0, 6)}!`,
      'success'
    );
  };

  const handleOpenLiveMatch = async (matchId: string) => {
    if (!currentUser) return;
    const res = await getMatchApi(matchId);
    hydrateMatchFromServer(res, currentUser);
  };

  const handleOpenHistoryMatchReview = async (matchId: string) => {
    if (!currentUser) return;
    const res = await getMatchApi(matchId);
    hydrateMatchFromServer(res, currentUser, { openReview: true });
  };

  // ------------------ Thông báo realtime (channel user:{id}) ------------------

  const handleNewNotifications = (items: NotificationItem[]) => {
    for (const n of items) {
      const p = n.payload as Record<string, unknown>;
      const watchingThisMatch =
        screen === 'match' && !!activeMatch && activeMatch.id === p.match_id;
      switch (n.kind) {
        case 'turn': {
          // Chỉ báo khi tab ẩn HOẶC không đang ngồi ở đúng ván này
          const playingThisMatch = watchingThisMatch && !isSpectator;
          if (document.hidden || !playingThisMatch) {
            pushToast('Đến lượt bạn!', 'info');
            notifyBrowser('Đến lượt bạn', 'Đối thủ đã đi nước của họ.');
            playTickSound();
          }
          break;
        }
        case 'challenge':
          pushToast(
            `${String(p.from_display_name ?? 'Có người')} thách đấu bạn — mở chuông thông báo để vào phòng.`,
            'info'
          );
          notifyBrowser(
            'Thách đấu mới',
            `${String(p.from_display_name ?? 'Kỳ thủ')} thách đấu bạn.`
          );
          break;
        case 'match_started':
          pushToast(
            `${String(p.by_display_name ?? 'Đối thủ')} đã vào phòng — ván bắt đầu!`,
            'success'
          );
          notifyBrowser(
            'Ván bắt đầu',
            `${String(p.by_display_name ?? 'Đối thủ')} đã vào phòng.`
          );
          break;
        case 'match_finished':
          if (!watchingThisMatch) {
            pushToast('Một ván đấu của bạn đã kết thúc.', 'info');
          }
          break;
        case 'mention':
          pushToast(
            `${String(p.from_display_name ?? 'Ai đó')} đã nhắc đến bạn trong chat.`,
            'info'
          );
          notifyBrowser(
            'Được nhắc đến',
            `${String(p.from_display_name ?? 'Kỳ thủ')} đã nhắc đến bạn trong chat.`
          );
          break;
        default:
          // 'dm': badge chuông là đủ — tránh spam toast
          break;
      }
    }
  };

  const { notifications, unread, markAllRead } = useNotifications(
    currentUser?.id ?? null,
    handleNewNotifications
  );

  const handleOpenNotificationMatch = async (matchId: string) => {
    await handleOpenLiveMatch(matchId);
  };

  const handleOpenDm = (userId: string, displayName: string) => {
    if (!currentUser || userId === currentUser.id) return;
    setDmTarget({
      id: userId,
      username: displayName,
      display_name: displayName,
    } as UserRecord);
  };

  // ------------------ Effects ------------------

  useEffect(() => {
    saveGame({
      initialFen,
      movesUci: moves.map((m) => m.uci),
      currentPly,
      playerColor,
      phase,
      config,
      players,
      gameOver,
    });
  }, [initialFen, moves, currentPly, playerColor, phase, config, players, gameOver]);

  useEffect(() => {
    fetchStatus()
      .then((st) => {
        setStatus(st);
        setBackendError(null);
      })
      .catch((err) => {
        console.error('Lỗi kết nối backend:', err);
        setBackendError(
          'Không kết nối được backend engine. Hãy khởi động backend bằng ./run.sh rồi tải lại trang.'
        );
      });
  }, []);

  // Polling đồng bộ phòng chờ / đấu Online / xem trực tiếp (useMatchSync)
  useMatchSync({
    screen,
    activeMatch,
    currentUser,
    isSpectator,
    moves,
    currentPly,
    hydrateMatchFromServer,
    pushToast,
    setActiveMatch,
    setMoves,
    setCurrentPly,
    setPhase,
    setGameOver,
    setShowGameOver,
    syncClockFromServer,
  });

  // Tự động lưu kết quả Game Review vào DB khi hoàn tất chấm điểm
  const savedReviewMatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!reviewResult || !activeMatch) return;
    if (savedReviewMatchIdRef.current === activeMatch.id) return;
    savedReviewMatchIdRef.current = activeMatch.id;

    saveMatchReviewApi(activeMatch.id, {
      white_accuracy: reviewResult.white_accuracy,
      black_accuracy: reviewResult.black_accuracy,
      review_summary: reviewResult.counts,
      ply_evaluations: reviewResult.moves.map((rm) => ({
        ply: rm.ply,
        cp: rm.cp,
        mate: rm.mate,
        win_percent_white: rm.win_percent_white,
        classification: rm.classification,
        symbol: rm.symbol,
        best_move_uci: rm.best_move_uci,
        best_move_san: rm.best_move_san,
        accuracy: rm.accuracy,
        win_loss: rm.win_loss,
      })),
    }).catch((err) => console.error('Lỗi lưu Game Review vào DB:', err));
  }, [reviewResult, activeMatch]);

  // Hiển thị dialog kết thúc cục bộ (optimistic). KẾT QUẢ thật do trọng tài
  // server chấm trong append_move/runner — client không tự gọi finish nữa;
  // useMatchSync sẽ đồng bộ status + termination từ server qua WS/poll.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (currentPly !== moves.length) return;
    const info = detectGameOver(currentFen);
    if (info) {
      setGameOver(info);
      setPhase('finished');
      setShowGameOver(true);
      setHintArrow(null);
    }
  }, [phase, currentFen, currentPly, moves.length]);

  // Phím tắt điều hướng ván cờ: ← → Home End
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (screen !== 'match' || activeTab !== 'play') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        setCurrentPly((p) => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentPly((p) => Math.min(moves.length, p + 1));
      } else if (e.key === 'Home') {
        setCurrentPly(0);
      } else if (e.key === 'End') {
        setCurrentPly(moves.length);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [screen, activeTab, moves.length]);

  // ------------------ Nước đi ------------------

  const executeMove = useCallback(
    (
      fromSq: string,
      toSq: string,
      promotion: string = 'q',
      basePlyOverride?: number
    ): boolean => {
      if (phase !== 'playing' || isSpectator) return false;
      if (activeMatch?.status === 'waiting') return false;

      const targetPly = basePlyOverride !== undefined ? basePlyOverride : currentPly;
      let baseMoves = moves;
      let baseFen = currentFen;
      if (targetPly < moves.length) {
        baseMoves = moves.slice(0, targetPly);
        baseFen = targetPly === 0 ? initialFen : baseMoves[targetPly - 1].fenAfter;
      }

      const game = new Chess(baseFen);
      let moveObj = null;
      try {
        moveObj = game.move({ from: fromSq, to: toSq, promotion });
      } catch {
        try {
          moveObj = game.move({ from: fromSq, to: toSq });
        } catch {
          return false;
        }
      }
      if (!moveObj) return false;

      const newPly = baseMoves.length + 1;
      const uci = `${moveObj.from}${moveObj.to}${moveObj.promotion || ''}`;
      const fenAfter = game.fen();
      const moverTurn = moveObj.color;
      const now = Date.now();
      const timeSpentMs = Math.max(50, now - lastTurnStartRef.current);
      lastTurnStartRef.current = now;

      const newRecord: MoveRecord = {
        ply: newPly,
        moveNumber: Math.floor((newPly + 1) / 2),
        turn: moverTurn,
        uci,
        san: moveObj.san,
        from: moveObj.from,
        to: moveObj.to,
        fenBefore: baseFen,
        fenAfter,
      };

      const updatedMoves = [...baseMoves, newRecord];
      setMoves(updatedMoves);
      setCurrentPly(newPly);
      setSelectedSquare(null);
      setHintArrow(null);

      // Cộng increment đồng hồ Fischer phía client
      let nextMoverClock: number | null = null;
      if (activeMatch && activeMatch.initial_time_ms != null) {
        const inc = activeMatch.increment_ms || 0;
        if (moverTurn === 'w') {
          nextMoverClock = Math.max(
            0,
            (whiteClockMs ?? activeMatch.initial_time_ms) + inc
          );
          setWhiteClockMs(nextMoverClock);
          turnStartClockRef.current = blackClockMs ?? activeMatch.initial_time_ms;
        } else {
          nextMoverClock = Math.max(
            0,
            (blackClockMs ?? activeMatch.initial_time_ms) + inc
          );
          setBlackClockMs(nextMoverClock);
          turnStartClockRef.current = whiteClockMs ?? activeMatch.initial_time_ms;
        }
      }

      // Đồng bộ nước đi lên Backend DB nếu ván đấu thuộc DB
      if (activeMatch && activeMatch.status === 'playing') {
        const moverUserId =
          moverTurn === 'w' ? activeMatch.white_user_id : activeMatch.black_user_id;
        appendMatchMoveApi(activeMatch.id, {
          player_user_id: moverUserId,
          uci,
          fen_before: baseFen,
          time_spent_ms: timeSpentMs,
          clock_after_ms: nextMoverClock,
        }).catch((err) => console.error('Lỗi đồng bộ nước đi lên DB:', err));
      }

      // Tận dụng kết quả phân tích sẵn có của thế cờ trước nước đi để tiết kiệm 1 lượt gọi Stockfish (ISS-05)
      if (visibility.classifyLive) {
        const prevMove = baseMoves[baseMoves.length - 1];
        const cachedBeforeWin =
          analysis?.fen === baseFen
            ? analysis.win_percent_white
            : prevMove?.winPercentWhite;
        const cachedBestUci =
          analysis?.fen === baseFen
            ? analysis.lines[0]?.move_uci ?? null
            : undefined;
        const cachedBestSan =
          analysis?.fen === baseFen
            ? analysis.lines[0]?.move_san ?? null
            : undefined;

        classifySingleMove({
          fen_before: baseFen,
          move_uci: uci,
          depth: 11,
          before_win_percent_white: cachedBeforeWin,
          best_move_uci: cachedBestUci,
          best_move_san: cachedBestSan,
        })
          .then((cls) => {
            const canonicalColor =
              CLASSIFICATION_META[cls.classification]?.color || cls.color;
            setMoves((prev) =>
              prev.map((m) =>
                m.ply === newPly && m.uci === uci
                  ? {
                      ...m,
                      cp: cls.after_analysis.cp,
                      mate: cls.after_analysis.mate,
                      winPercentWhite: cls.after_analysis.win_percent_white,
                      classification: cls.classification,
                      symbol: cls.symbol,
                      color: canonicalColor,
                      bestMoveUci: cls.best_move_uci,
                      bestMoveSan: cls.best_move_san,
                      accuracy: cls.accuracy,
                      winLoss: cls.win_loss,
                    }
                  : m
              )
            );
          })
          .catch((err) => {
            console.error('Lỗi chấm điểm nước đi:', err);
            pushToast(
              'Không chấm điểm được nước vừa đi (engine đang bận).',
              'error'
            );
          });
      }

      return true;
    },
    [
      moves,
      currentPly,
      currentFen,
      initialFen,
      phase,
      isSpectator,
      activeMatch,
      whiteClockMs,
      blackClockMs,
      visibility.classifyLive,
      analysis,
      pushToast,
    ]
  );

  /**
   * Thực hiện nước đi của người dùng với kiểm tra lượt (chặn đi hộ AI / đối thủ Online)
   * và hộp thoại chọn quân phong cấp.
   */
  const tryMove = useCallback(
    (fromSq: string, toSq: string): boolean => {
      if (phase !== 'playing' || isSpectator) return false;
      if (activeMatch?.status === 'waiting') return false;
      if (
        (config.opponent === 'ai' || config.mode === 'online') &&
        chessInstance.turn() !== playerColor
      ) {
        return false;
      }
      const piece = chessInstance.get(fromSq as ChessSquare);
      if (piece && piece.type === 'p') {
        const lastRank = piece.color === 'w' ? '8' : '1';
        if (toSq[1] === lastRank) {
          setPendingPromo({ from: fromSq, to: toSq });
          return false;
        }
      }
      return executeMove(fromSq, toSq, 'q');
    },
    [
      chessInstance,
      config.opponent,
      config.mode,
      executeMove,
      phase,
      isSpectator,
      activeMatch,
      playerColor,
    ]
  );

  // ------------------ AI ------------------

  const triggerAiMove = useCallback(
    async (fenToPlay: string, engineOverride?: AssistantEngineConfig) => {
      // Training: cho phép chỉ định engine trợ lý (do người dùng cấu hình);
      // mặc định dùng bot của ván đấu (auto-move & vs_ai).
      const ai = engineOverride ?? aiPlayer?.ai;
      if (!ai || isSpectator) return;
      const checkGame = new Chess(fenToPlay);
      if (checkGame.isGameOver()) return;

      setIsAiThinking(true);
      try {
        const res = await requestAIMove({
          fen: fenToPlay,
          engine_type: ai.engine,
          elo: ai.elo,
          move_time: 0.45,
        });
        const promo = res.move_uci.length > 4 ? res.move_uci[4] : 'q';
        executeMove(res.from_square, res.to_square, promo);
      } catch (err) {
        console.error('Lỗi AI move:', err);
        pushToast(
          `AI không đi được nước này: ${
            err instanceof Error ? err.message : 'lỗi không xác định'
          }`,
          'error'
        );
      } finally {
        setIsAiThinking(false);
      }
    },
    [aiPlayer, isSpectator, executeMove, pushToast]
  );

  // Giữ triggerAiMove mới nhất qua ref: identity của nó đổi liên tục mỗi tick
  // đồng hồ (executeMove deps whiteClockMs/blackClockMs). Nếu để trực tiếp trong
  // deps của effect bên dưới, cleanup sẽ clearTimeout mỗi 250ms < 300ms delay
  // → timer không bao giờ fire → AI cầm Trắng "đóng băng" không đi nước đầu.
  // (react.dev: "Reading the latest props and state from an Effect")
  const triggerAiMoveRef = useRef(triggerAiMove);
  useEffect(() => {
    triggerAiMoveRef.current = triggerAiMove;
  }, [triggerAiMove]);

  // AI tự đi khi tới lượt (chỉ khi ván đang chơi ở màn hình Match)
  useEffect(() => {
    if (screen !== 'match' || activeTab !== 'play') return;
    if (phase !== 'playing' || isSpectator) return;
    if (config.opponent !== 'ai') return;
    if (isAiThinking) return;
    if (currentPly !== moves.length) return;

    let g: Chess;
    try {
      g = new Chess(currentFen);
    } catch {
      return;
    }
    if (g.isGameOver()) return;

    if (g.turn() !== playerColor) {
      const timer = setTimeout(() => {
        triggerAiMoveRef.current(currentFen);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [
    screen,
    activeTab,
    phase,
    isSpectator,
    config.opponent,
    playerColor,
    currentFen,
    currentPly,
    moves.length,
    isAiThinking,
  ]);

  // ------------------ Tương tác bàn cờ ------------------

  const handlePieceDrop = (
    sourceSquare: Square,
    targetSquare: Square,
    piece: string
  ): boolean => {
    if (activeTab === 'editor') {
      setEditorBoardMap((prev) => {
        const next = { ...prev };
        delete next[sourceSquare];
        next[targetSquare] = piece;
        return next;
      });
      return true;
    }

    if (isAiThinking || isSpectator) return false;
    return tryMove(sourceSquare, targetSquare);
  };

  const handleSquareClick = (square: Square) => {
    if (activeTab === 'editor') {
      if (editorTool === 'move') return;
      if (editorTool === 'erase') {
        setEditorBoardMap((prev) => {
          const next = { ...prev };
          delete next[square];
          return next;
        });
      } else {
        setEditorBoardMap((prev) => ({
          ...prev,
          [square]: editorTool,
        }));
      }
      return;
    }

    if (isAiThinking || isSpectator) return;

    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      const moved = tryMove(selectedSquare, square);
      if (moved) {
        setSelectedSquare(null);
        return;
      }
    }

    const pieceOnSq = chessInstance.get(square as ChessSquare);
    const canControlSide =
      (config.opponent !== 'ai' && config.mode !== 'online') ||
      pieceOnSq?.color === playerColor;
    if (
      phase === 'playing' &&
      pieceOnSq &&
      pieceOnSq.color === chessInstance.turn() &&
      canControlSide
    ) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  };

  // Mũi tên trên bàn cờ: trong reviewMode, hiển thị mũi tên nước đi đang chọn theo màu phân loại hoặc các nước gợi ý
  const customArrows: Arrow[] = useMemo(() => {
    const out: Arrow[] = [];
    if (activeTab === 'editor') return out;

    if (reviewMode) {
      if (reviewArrowMode === 'suggestions') {
        if (reviewLines && reviewLines.length > 0) {
          out.push(
            ...reviewLines.map(
              (line, idx) =>
                [
                  line.from_square as Square,
                  line.to_square as Square,
                  ARROW_COLORS[idx] || ARROW_COLORS[0],
                ] as Arrow
            )
          );
        }
      } else {
        if (currentPly > 0 && moves[currentPly - 1]) {
          const mv = moves[currentPly - 1];
          const arrowColor =
            (mv.classification && CLASSIFICATION_META[mv.classification]?.color) ||
            mv.color ||
            'rgba(56, 189, 248, 0.85)';
          out.push([mv.from as Square, mv.to as Square, arrowColor]);
        }
      }
      if (hintArrow) out.push(hintArrow);
      return out;
    }

    if (
      showArrows &&
      visibility.arrows &&
      analysis?.lines &&
      analysis.fen === currentFen
    ) {
      out.push(
        ...analysis.lines.map(
          (line, idx) =>
            [
              line.from_square as Square,
              line.to_square as Square,
              ARROW_COLORS[idx] || ARROW_COLORS[0],
            ] as Arrow
        )
      );
    }
    if (hintArrow) out.push(hintArrow);
    return out;
  }, [
    activeTab,
    reviewMode,
    reviewArrowMode,
    reviewLines,
    currentPly,
    moves,
    showArrows,
    visibility.arrows,
    analysis,
    currentFen,
    hintArrow,
  ]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (activeTab === 'editor') return styles;

    // Highlight nước đi vừa thực hiện kèm màu phân loại chuẩn semantic.ts (ISS-07)
    if (currentPly > 0 && moves[currentPly - 1]) {
      const last = moves[currentPly - 1];
      const moveColor =
        (last.classification && CLASSIFICATION_META[last.classification]?.color) ||
        last.color;
      if (reviewMode && reviewArrowMode === 'suggestions') {
        // Ở chế độ gợi ý, bàn cờ hiển thị thế cờ fenBefore (trước khi đi), chỉ highlight ô xuất phát
        styles[last.from] = { backgroundColor: squareOverlays.lastMoveFrom };
      } else {
        styles[last.from] = { backgroundColor: squareOverlays.lastMoveFrom };
        styles[last.to] = {
          backgroundColor: moveColor ? `${moveColor}48` : squareOverlays.lastMoveTo,
        };
      }
    }

    // Highlight ô đang chọn và các chấm gợi ý nước đi hợp lệ
    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: squareOverlays.selected,
      };
      try {
        const legalMoves = chessInstance.moves({
          square: selectedSquare as ChessSquare,
          verbose: true,
        });
        for (const m of legalMoves) {
          const hasPiece = chessInstance.get(m.to as ChessSquare);
          styles[m.to] = {
            background: hasPiece
              ? squareOverlays.legalCaptureRing
              : squareOverlays.legalDot,
          };
        }
      } catch {
        // ignore
      }
    }

    if (chessInstance.inCheck()) {
      const boardArr = chessInstance.board();
      for (const row of boardArr) {
        for (const cell of row) {
          if (cell && cell.type === 'k' && cell.color === chessInstance.turn()) {
            styles[cell.square] = {
              backgroundColor: squareOverlays.check,
            };
          }
        }
      }
    }

    return styles;
  }, [activeTab, currentPly, moves, reviewMode, reviewArrowMode, selectedSquare, chessInstance]);

  // ------------------ Hành động ván đấu ------------------

  const handleStartGame = () => {
    setGameOver(null);
    resetReview();
    setPlayers((prev) =>
      alignPlayersWithColor(prev, playerColor, config.opponent)
    );
    setCurrentPly(moves.length);
    setPhase('playing');
    setShowPreMatch(false);
    pushToast(
      `Bắt đầu ván (${modeLabel} · Phân tích: ${
        ANALYSIS_LEVEL_LABELS[config.analysis].label
      })`,
      'success'
    );
  };

  const openPreMatch = () => {
    if (isSpectator) {
      setScreen('home');
      return;
    }
    if (phase === 'playing' && moves.length > 0) {
      if (
        !window.confirm(
          'Về màn hình chuẩn bị? Ván hiện tại sẽ dừng lại (các nước đã đi vẫn được giữ).'
        )
      )
        return;
    }
    setActiveMatch(null);
    setPhase('setup');
    setGameOver(null);
    setShowPreMatch(true);
  };

  const handleNewGame = () => {
    setActiveMatch(null);
    setIsSpectator(false);
    resetClocks();
    setInitialFen(STARTING_FEN);
    setMoves([]);
    setCurrentPly(0);
    resetReview();
    setReviewMode(false);
    setGameOver(null);
    setSelectedSquare(null);
    setPendingPromo(null);
    setPhase('setup');
    setShowPreMatch(true);
    clearSavedGame();
  };

  const handleRematch = async () => {
    // Mọi ván đều phải lưu trên máy chủ: rematch LUÔN tạo record mới với hai
    // bên hoán đổi màu. Không còn path local — lỗi thì báo và giữ màn hình
    // kết thúc (không chơi ván không có biên bản CSDL).
    if (!currentUser) return;
    if (!activeMatch) {
      pushToast(
        'Không tìm thấy biên bản ván vừa kết thúc — không rematch được.',
        'error'
      );
      return;
    }
    try {
      // Trận online: đối thủ là người thật — tạo phòng chờ + mã phòng để họ
      // vào lại. Trận vs bot: chơi ngay.
      const isOnlineHuman =
        activeMatch.mode === 'online' &&
        activeMatch.white_user_id !== activeMatch.black_user_id;
      const res = await createMatchApi({
        mode: activeMatch.mode,
        status: isOnlineHuman ? 'waiting' : 'playing',
        is_rated: activeMatch.is_rated,
        white_user_id: activeMatch.black_user_id ?? currentUser.id,
        black_user_id: activeMatch.white_user_id ?? currentUser.id,
        ai_elo_override: activeMatch.ai_elo_override,
        analysis_level: activeMatch.analysis_level,
        allow_takeback: activeMatch.allow_takeback,
        allow_hints: activeMatch.allow_hints,
        time_control_type: activeMatch.time_control_type,
        initial_time_ms: activeMatch.initial_time_ms,
        increment_ms: activeMatch.increment_ms,
        preset_id: activeMatch.preset_id,
        initial_fen: activeMatch.initial_fen || STARTING_FEN,
        generate_room_code: isOnlineHuman,
      });
      hydrateMatchFromServer(res, currentUser);
      if (isOnlineHuman) {
        pushToast(
          `Đã tạo phòng rematch #${res.match.room_code}. Chia sẻ mã này cho đối thủ!`,
          'info'
        );
        return;
      }
      // Màu mới của mình = ngược màu cũ (server đã hoán đổi 2 bên)
      const myNewColor =
        activeMatch.white_user_id === currentUser.id ? 'b' : 'w';
      pushToast(
        `Rematch — đổi màu sang ${myNewColor === 'w' ? 'Trắng' : 'Đen'}!`,
        'success'
      );
    } catch (e) {
      console.error('Lỗi tạo rematch:', e);
      pushToast(
        e instanceof Error
          ? `Không tạo được rematch: ${e.message}`
          : 'Không tạo được rematch trên máy chủ.',
        'error'
      );
    }
  };

  const handleResign = () => {
    if (phase !== 'playing' || isSpectator) return;
    const resigning: 'w' | 'b' =
      config.opponent === 'ai' || config.mode === 'online'
        ? playerColor
        : chessInstance.turn();
    const name = players[resigning].name;
    if (!window.confirm(`${name} đầu hàng?`)) return;
    const winner = resigning === 'w' ? 'b' : 'w';
    const result = winner === 'w' ? '1-0' : '0-1';
    setGameOver({
      result,
      reason: 'Đầu hàng',
      winner,
    });
    setPhase('finished');
    setShowGameOver(true);

    if (activeMatch && activeMatch.status === 'playing') {
      // Result do server tính từ player_user_id (bên xin thua).
      const resigningUserId =
        resigning === 'w' ? activeMatch.white_user_id : activeMatch.black_user_id;
      finishMatchApi(activeMatch.id, 'resign', resigningUserId)
        .then((res) => {
          setActiveMatch(res.match);
          if (currentUser) refreshCurrentUser().catch(() => {});
        })
        .catch((err) => console.error('Lỗi lưu đầu hàng:', err));
    }
  };

  const handleTakeback = () => {
    if (!visibility.takeback || moves.length === 0 || isSpectator) return;
    const stepsBack =
      config.opponent === 'ai' &&
      chessInstance.turn() === playerColor &&
      moves.length >= 2
        ? 2
        : 1;
    const targetLen = Math.max(0, moves.length - stepsBack);
    setMoves((prev) => prev.slice(0, targetLen));
    setCurrentPly(targetLen);

    if (activeMatch && activeMatch.status === 'playing') {
      takebackMatchApi(activeMatch.id, targetLen).catch((err) =>
        console.error('Lỗi đồng bộ takeback:', err)
      );
    }
  };

  const canHint =
    visibility.hints &&
    !isSpectator &&
    phase === 'playing' &&
    !isAiThinking &&
    currentPly === moves.length &&
    chessInstance.turn() === playerColor;

  const handleHint = useCallback(async () => {
    if (!canHint) return;
    try {
      // Engine trợ lý do người dùng cấu hình: Maia (gợi ý kiểu người theo
      // Elo) hoặc Stockfish (nước tối ưu).
      let from: string;
      let to: string;
      if (assistantEngine.engine === 'maia') {
        const res = await requestAIMove({
          fen: currentFen,
          engine_type: 'maia',
          elo: assistantEngine.elo,
          move_time: 0.45,
        });
        from = res.from_square;
        to = res.to_square;
      } else {
        const res = await analyzePosition(currentFen, 12, 1);
        const line = res.lines[0];
        if (!line) {
          pushToast('Không có gợi ý cho thế cờ này.', 'info');
          return;
        }
        from = line.from_square;
        to = line.to_square;
      }
      setHintArrow([from as Square, to as Square, HINT_ARROW_COLOR]);
      window.setTimeout(() => setHintArrow(null), 4000);
    } catch {
      pushToast('Không lấy được gợi ý từ engine.', 'error');
    }
  }, [canHint, currentFen, pushToast, assistantEngine]);

  // ------------------ Review & PGN ------------------

  const handleOpenReview = async (runIfNeeded = false) => {
    setReviewMode(true);
    setShowGameOver(false);
    if (runIfNeeded && moves.length > 0 && !reviewResult && !isReviewing) {
      await handleRunGameReview();
    }
  };

  const handleTryAlternativeMove = useCallback(
    (plyBefore: number, uci: string) => {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? uci[4] : 'q';
      setIsSpectator(false);
      setActiveMatch(null);
      setReviewMode(false);
      setGameOver(null);
      setShowGameOver(false);
      setPhase('playing');
      setTimeout(() => {
        executeMove(from, to, promo, plyBefore);
      }, 0);
    },
    [executeMove]
  );

  const handleExportPgn = () => {
    if (moves.length === 0) {
      pushToast('Chưa có nước đi nào để xuất PGN.', 'info');
      return;
    }
    try {
      const pgn = buildPgn(initialFen, moves);
      downloadPgn(pgn);
      pushToast('Đã xuất PGN xuống máy.', 'success');
    } catch (err) {
      console.error('Lỗi xuất PGN:', err);
      pushToast('Không xuất được PGN.', 'error');
    }
  };

  const handleApplyCustomPosition = (fen: string, pgn?: string) => {
    const finish = (targetTurn?: 'w' | 'b') => {
      if (targetTurn) {
        handleChangePlayerColor(targetTurn);
      }
      setActiveMatch(null);
      setIsSpectator(false);
      setPhase('setup');
      setGameOver(null);
      resetReview();
      setReviewMode(false);
      setSelectedSquare(null);
      setPendingPromo(null);
      setShowPreMatch(true);
      setActiveTab('play');
      setScreen('match');
    };

    if (pgn) {
      try {
        const g = new Chess();
        g.loadPgn(pgn);
        const historyVerbose = g.history({ verbose: true });
        const startFen = g.getHeaders()['FEN'] || STARTING_FEN;
        const temp = new Chess(startFen);
        const builtMoves: MoveRecord[] = [];
        historyVerbose.forEach((mv, idx) => {
          const fenBefore = temp.fen();
          temp.move(mv);
          builtMoves.push({
            ply: idx + 1,
            moveNumber: Math.floor(idx / 2) + 1,
            turn: mv.color,
            uci: `${mv.from}${mv.to}${mv.promotion || ''}`,
            san: mv.san,
            from: mv.from,
            to: mv.to,
            fenBefore,
            fenAfter: temp.fen(),
          });
        });
        setInitialFen(startFen);
        setMoves(builtMoves);
        setCurrentPly(builtMoves.length);
        setEditorBoardMap(fenToBoardMap(startFen));
        finish();
        return;
      } catch {
        pushToast('PGN không hợp lệ, vui lòng kiểm tra lại cú pháp PGN.', 'error');
        return;
      }
    }

    let fenTurn: 'w' | 'b' = 'w';
    try {
      fenTurn = new Chess(fen).turn();
    } catch {
      // ignore
    }
    setInitialFen(fen);
    setMoves([]);
    setCurrentPly(0);
    setEditorBoardMap(fenToBoardMap(fen));
    finish(fenTurn);
  };

  const handleSelectStartingFen = (fen: string) => {
    if (fen === initialFen) return;
    if (moves.length > 0) {
      if (
        !window.confirm(
          'Đổi thế cờ xuất phát sẽ xóa biên bản hiện tại và bắt đầu ván mới từ đầu. Tiếp tục?'
        )
      ) {
        return;
      }
    }
    handleApplyCustomPosition(fen);
  };

  // ------------------ Render Gate: Auth ------------------

  if (authChecking) {
    return (
      <div className="min-h-screen w-screen bg-base text-ink flex items-center justify-center">
        <div className="text-xs font-mono text-ink-3">
          Đang xác thực phiên đăng nhập...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} errorMessage={loginError} />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // ------------------ Render Main Shell ------------------

  const displayedPosition =
    activeTab === 'editor'
      ? `${boardMapToFenPlacement(editorBoardMap)} w KQkq - 0 1`
      : reviewMode && reviewArrowMode === 'suggestions' && currentPly > 0 && moves[currentPly - 1]
      ? moves[currentPly - 1].fenBefore
      : currentFen;

  const themeColors = boardTheme;

  const topSide = boardOrientation === 'white' ? 'b' : 'w';
  const bottomSide = boardOrientation === 'white' ? 'w' : 'b';

  const playerCardProps = (side: 'w' | 'b') => ({
    player: players[side],
    side,
    isTurn:
      phase === 'playing' &&
      activeMatch?.status !== 'waiting' &&
      chessInstance.turn() === side,
    isThinking: isAiThinking && aiPlayer === players[side],
    rating: side === 'w' ? whiteRating : blackRating,
    clockMs: side === 'w' ? whiteClockMs : blackClockMs,
  });

  const capturedBarProps = (side: 'w' | 'b', dock: 'bottom' | 'top') => ({
    side,
    symbols: side === 'w' ? material.capturedByWhite : material.capturedByBlack,
    diff: side === 'w' ? material.diff : -material.diff,
    boardSize,
    dock,
  });

  return (
    <div className="min-h-screen md:h-screen w-screen overflow-y-auto md:overflow-hidden bg-base text-ink flex flex-col select-none">
      {/* Global Top Bar */}
      <AppHeader
        screen={screen}
        setScreen={setScreen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeMatch={activeMatch}
        isSpectator={isSpectator}
        phase={phase}
        config={config}
        status={status}
        chessInstance={chessInstance}
        currentFen={currentFen}
        setEditorBoardMap={setEditorBoardMap}
        currentUser={currentUser}
        notifications={notifications}
        unread={unread}
        markAllRead={markAllRead}
        onOpenNotificationMatch={handleOpenNotificationMatch}
        onOpenDm={handleOpenDm}
        onOpenChangePassword={() => setShowPasswordModal(true)}
        onLogout={handleLogout}
        modeLabel={modeLabel}
      />

      {/* Cảnh báo khi không kết nối được backend */}
      {backendError && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[11px] px-4 py-1.5">
          ⚠ {backendError}
        </div>
      )}

      {/* Màn hình 1: HOME SCREEN (Sảnh chính 2 cột) */}
      {screen === 'home' && (
        <HomeScreen
          currentUser={currentUser}
          presets={status?.presets || []}
          lc0Ready={status?.lc0_binary_ready}
          onOpenLiveMatch={handleOpenLiveMatch}
          onJoinMatchByCodeOrId={handleJoinMatchByCodeOrId}
          onCreateMatch={handleCreateMatchFromLobby}
          onOpenHistoryMatchReview={handleOpenHistoryMatchReview}
          onOpenDm={(u) => setDmTarget(u)}
          onOpenBoardEditor={() => {
            setEditorBoardMap(fenToBoardMap(currentFen));
            setActiveTab('editor');
            setScreen('match');
          }}
        />
      )}

      {/* Màn hình 2: ADMIN SCREEN (Quản lý tài khoản & hệ thống) — lazy load */}
      {screen === 'admin' && (
        <Suspense fallback={<LazyFallback />}>
          <AdminScreen
            currentUser={currentUser}
            onOpenMatch={handleOpenLiveMatch}
            onNotify={(msg, kind) => pushToast(msg, kind)}
          />
        </Suspense>
      )}

      {/* Màn hình: PHÒNG LAB (tổ chức trận AI vs AI & giải round-robin) — lazy load */}
      {screen === 'lab' && (
        <Suspense fallback={<LazyFallback />}>
          <LabScreen
            onOpenMatch={handleOpenLiveMatch}
            onNotify={(msg, kind) => pushToast(msg, kind)}
          />
        </Suspense>
      )}

      {/* Màn hình 3: MATCH SCREEN (Giao diện bàn cờ hiện tại) */}
      {screen === 'match' && (
        <MatchScreen
          boardStageRef={boardStageRef}
          boardSize={boardSize}
          showSideRails={showSideRails}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          reviewMode={reviewMode}
          setReviewMode={setReviewMode}
          topSide={topSide}
          bottomSide={bottomSide}
          displayedPosition={displayedPosition}
          boardOrientation={boardOrientation}
          customArrows={customArrows}
          customSquareStyles={customSquareStyles}
          themeColors={themeColors}
          onPieceDrop={handlePieceDrop}
          onSquareClick={handleSquareClick}
          pendingPromo={pendingPromo}
          chessInstance={chessInstance}
          onPromoPick={(p) => {
            const pp = pendingPromo;
            setPendingPromo(null);
            if (pp) executeMove(pp.from, pp.to, p);
          }}
          onPromoCancel={() => setPendingPromo(null)}
          playerCardProps={playerCardProps}
          capturedBarProps={capturedBarProps}
          activeMatch={activeMatch}
          phase={phase}
          showPreMatch={showPreMatch}
          setShowPreMatch={setShowPreMatch}
          showGameOver={showGameOver}
          setShowGameOver={setShowGameOver}
          onCopyRoomCode={() => {
            navigator.clipboard.writeText(activeMatch?.room_code || '');
            pushToast(`Đã sao chép mã phòng #${activeMatch?.room_code}!`, 'success');
          }}
          onReturnToLobby={() => setScreen('home')}
          editorBoardMap={editorBoardMap}
          setEditorBoardMap={setEditorBoardMap}
          editorTool={editorTool}
          setEditorTool={setEditorTool}
          presets={status?.presets || []}
          onApplyCustomPosition={handleApplyCustomPosition}
          moves={moves}
          currentPly={currentPly}
          setCurrentPly={setCurrentPly}
          reviewResult={reviewResult}
          isReviewing={isReviewing}
          reviewProgress={reviewProgress}
          onRunGameReview={() => handleRunGameReview()}
          onUpdateReviewLines={setReviewLines}
          onTryAlternativeMove={handleTryAlternativeMove}
          reviewArrowMode={reviewArrowMode}
          onChangeReviewArrowMode={setReviewArrowMode}
          config={config}
          visibility={visibility}
          isSpectator={isSpectator}
          modeLabel={modeLabel}
          onOpenConfig={openPreMatch}
          onResign={handleResign}
          onHint={handleHint}
          canHint={canHint}
          showEval={showEval}
          setShowEval={setShowEval}
          showArrows={showArrows}
          setShowArrows={setShowArrows}
          multipv={multipv}
          setMultipv={setMultipv}
          depth={depth}
          setDepth={setDepth}
          analysis={analysis}
          isAnalyzing={isAnalyzing}
          onPlaySuggestedMove={(uci) => {
            if (isSpectator) return;
            const from = uci.slice(0, 2);
            const to = uci.slice(2, 4);
            if (uci.length > 4) {
              executeMove(from, to, uci[4]);
            } else {
              tryMove(from, to);
            }
          }}
          onTriggerAiMoveNow={() => triggerAiMove(currentFen, assistantEngine)}
          isAiThinking={isAiThinking}
          assistantEngine={assistantEngine}
          setAssistantEngine={setAssistantEngine}
          currentUser={currentUser}
          players={players}
          onTakeback={handleTakeback}
          onExportPgn={handleExportPgn}
          onBranchFromHere={() => {
            if (isSpectator) return;
            setMoves((prev) => prev.slice(0, currentPly));
          }}
          onFlipBoard={() => setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))}
          onSwitchSides={() => {
            if (isSpectator) return;
            const nextColor = playerColor === 'w' ? 'b' : 'w';
            handleChangePlayerColor(nextColor);
          }}
          onNewGame={activeMatch ? () => setScreen('home') : handleNewGame}
          onOpenReview={handleOpenReview}
        />
      )}

      {/* Các Modals toàn cục */}
      <MatchModals
        screen={screen}
        activeTab={activeTab}
        showPreMatch={showPreMatch}
        setShowPreMatch={setShowPreMatch}
        phase={phase}
        config={config}
        players={players}
        playerColor={playerColor}
        initialFen={initialFen}
        presets={status?.presets || []}
        hasMoves={moves.length > 0}
        lc0Ready={status?.lc0_binary_ready}
        onChangeConfig={setConfig}
        onChangePlayers={setPlayers}
        onChangePlayerColor={handleChangePlayerColor}
        onSelectStartingFen={handleSelectStartingFen}
        onOpenBoardEditor={() => {
          setEditorBoardMap(fenToBoardMap(currentFen));
          setShowPreMatch(false);
          setActiveTab('editor');
        }}
        onStartGame={handleStartGame}
        showGameOver={showGameOver}
        setShowGameOver={setShowGameOver}
        gameOver={gameOver}
        reviewResult={reviewResult}
        activeMatch={activeMatch}
        onNewGame={handleNewGame}
        onRematch={handleRematch}
        onAnalyze={() => handleOpenReview(true)}
        onExportPgn={handleExportPgn}
        currentUser={currentUser}
        showPasswordModal={showPasswordModal}
        setShowPasswordModal={setShowPasswordModal}
        onPasswordChange={handlePasswordChange}
        toasts={toasts}
        dismissToast={dismissToast}
        dmTarget={dmTarget}
        setDmTarget={setDmTarget}
      />
    </div>
  );
};

export default App;
