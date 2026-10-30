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
  GameOverInfo,
  GamePhase,
  MatchRecord,
  MatchWithDetailsResponse,
  MoveRecord,
  PlayerInfo,
  PVLine,
  UserRecord,
} from './types';
import { EnginePanel } from './components/EnginePanel';
import { MoveHistory } from './components/MoveHistory';
import { EvalGraph } from './components/EvalGraph';
import { Toasts, useToasts, ToastItem, ToastKind } from './components/Toasts';
import { PromotionDialog } from './components/PromotionDialog';
import { PlayerCard } from './components/PlayerCard';
import { CapturedBar } from './components/CapturedRail';
import { PreMatchDialog } from './components/PreMatchDialog';
import { GameOverDialog } from './components/GameOverDialog';
import { LoginScreen, ChangePasswordModal } from './components/LoginScreen';
import { UserDropdownMenu } from './components/UserDropdownMenu';
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
const ReviewScreen = React.lazy(() =>
  import('./components/ReviewScreen').then((m) => ({ default: m.ReviewScreen }))
);
const BoardEditor = React.lazy(() =>
  import('./components/BoardEditor').then((m) => ({ default: m.BoardEditor }))
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
  const [reviewLines, setReviewLines] = useState<PVLine[] | null>(null);
  const [hintArrow, setHintArrow] = useState<Arrow | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

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

  // Phát hiện kết thúc ván trên bàn cờ
  useEffect(() => {
    if (phase !== 'playing') return;
    if (currentPly !== moves.length) return;
    const info = detectGameOver(currentFen);
    if (info) {
      setGameOver(info);
      setPhase('finished');
      setShowGameOver(true);
      setHintArrow(null);

      if (activeMatch && activeMatch.status === 'playing' && !isSpectator) {
        finishMatchApi(activeMatch.id, info.result, info.reason)
          .then((res) => {
            setActiveMatch(res.match);
            if (currentUser) {
              refreshCurrentUser().catch(() => {});
            }
          })
          .catch((err) => console.error('Lỗi lưu kết quả ván đấu:', err));
      }
    }
  }, [
    phase,
    currentFen,
    currentPly,
    moves.length,
    activeMatch,
    isSpectator,
    currentUser,
    refreshCurrentUser,
  ]);

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
    async (fenToPlay: string) => {
      if (!aiPlayer?.ai || isSpectator) return;
      const checkGame = new Chess(fenToPlay);
      if (checkGame.isGameOver()) return;

      setIsAiThinking(true);
      try {
        const res = await requestAIMove({
          fen: fenToPlay,
          engine_type: aiPlayer.ai.engine,
          elo: aiPlayer.ai.elo,
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
        triggerAiMove(currentFen);
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
    triggerAiMove,
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

  // Mũi tên trên bàn cờ: khi ở ReviewScreen (reviewMode), ưu tiên hiển thị các nhánh thay thế từ thế cờ trước nước đang chọn (ISS-04)
  const customArrows: Arrow[] = useMemo(() => {
    const out: Arrow[] = [];
    if (activeTab === 'editor') return out;

    if (reviewMode && reviewLines && reviewLines.length > 0) {
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
      return out;
    }

    if (showArrows && visibility.arrows && analysis?.lines) {
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
    reviewLines,
    showArrows,
    visibility.arrows,
    analysis,
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
      styles[last.from] = { backgroundColor: squareOverlays.lastMoveFrom };
      styles[last.to] = {
        backgroundColor: moveColor ? `${moveColor}48` : squareOverlays.lastMoveTo,
      };
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
  }, [activeTab, currentPly, moves, selectedSquare, chessInstance]);

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

  const handleRematch = () => {
    const nextColor = playerColor === 'w' ? 'b' : 'w';
    handleChangePlayerColor(nextColor);
    setActiveMatch(null);
    setIsSpectator(false);
    setMoves([]);
    setCurrentPly(0);
    resetReview();
    setReviewMode(false);
    setGameOver(null);
    setSelectedSquare(null);
    setPendingPromo(null);
    setShowGameOver(false);
    setPhase('playing');
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
      finishMatchApi(activeMatch.id, result, 'resign')
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
      const res = await analyzePosition(currentFen, 12, 1);
      const line = res.lines[0];
      if (!line) {
        pushToast('Không có gợi ý cho thế cờ này.', 'info');
        return;
      }
      setHintArrow([
        line.from_square as Square,
        line.to_square as Square,
        HINT_ARROW_COLOR,
      ]);
      window.setTimeout(() => setHintArrow(null), 4000);
    } catch {
      pushToast('Không lấy được gợi ý từ engine.', 'error');
    }
  }, [canHint, currentFen, pushToast]);

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
      {/* Global Top Bar (cao 44px / h-11) */}
      <header className="h-11 shrink-0 border-b border-line bg-panel px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setScreen('home')}
            className="font-display text-sm font-semibold text-ink hover:text-accent tracking-tight transition cursor-pointer shrink-0"
            title="Về Sảnh chính"
          >
            TheChess
          </button>

          {/* Thanh điều hướng chính (Primary Navigation) đặt trực tiếp trên Topbar */}
          <nav
            aria-label="Điều hướng chính"
            className="inline-flex items-center bg-inset p-0.5 rounded-md border border-line shrink-0"
          >
            <button
              type="button"
              onClick={() => setScreen('home')}
              className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
                screen === 'home'
                  ? 'bg-accent text-accent-ink font-semibold'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Sảnh câu lạc bộ
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('play');
                setScreen('match');
              }}
              className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
                screen === 'match' && activeTab === 'play'
                  ? 'bg-accent text-accent-ink font-semibold'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Bàn đấu
            </button>
            <button
              type="button"
              onClick={() => {
                setEditorBoardMap(fenToBoardMap(currentFen));
                setActiveTab('editor');
                setScreen('match');
              }}
              className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
                screen === 'match' && activeTab === 'editor'
                  ? 'bg-accent text-accent-ink font-semibold'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Xếp cờ
            </button>
            <button
              type="button"
              onClick={() => setScreen('lab')}
              className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
                screen === 'lab'
                  ? 'bg-accent text-accent-ink font-semibold'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Phòng Lab
            </button>
          </nav>

          <span className="hidden sm:inline text-ink-3">/</span>

          <div className="hidden sm:flex items-center gap-2 truncate">
            {screen === 'home' ? (
              <span className="text-xs text-ink-2 truncate">
                Trực tiếp &amp; Tạo trận
              </span>
            ) : screen === 'admin' ? (
              <span className="text-xs text-ink-2 truncate">
                Quản trị tài khoản
              </span>
            ) : screen === 'lab' ? (
              <span className="text-xs text-ink-2 truncate">
                AI vs AI · engine thật
              </span>
            ) : (
              <>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 border border-line-strong ${
                    chessInstance.turn() === 'w' ? 'bg-sq-w' : 'bg-sq-b'
                  }`}
                />
                <span className="text-xs text-ink-2 truncate">
                  {activeTab === 'editor'
                    ? 'Thiết lập thế cờ tùy chỉnh'
                    : activeMatch?.status === 'waiting'
                    ? `Phòng chờ #${activeMatch.room_code} · Đang đợi đối thủ`
                    : isSpectator
                    ? `Đang xem trực tiếp${
                        activeMatch?.room_code
                          ? ` #${activeMatch.room_code}`
                          : ''
                      }`
                    : phase === 'setup'
                    ? 'Chuẩn bị ván đấu'
                    : chessInstance.isCheckmate()
                    ? `Chiếu hết · ${
                        chessInstance.turn() === 'w' ? 'Đen' : 'Trắng'
                      } thắng`
                    : chessInstance.isDraw()
                    ? 'Ván cờ hòa'
                    : `Lượt ${chessInstance.turn() === 'w' ? 'Trắng' : 'Đen'}${
                        chessInstance.inCheck() ? ' · Chiếu!' : ''
                      }`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Cụm công cụ phải tối giản */}
        <div className="flex items-center gap-2 shrink-0">
          {screen === 'match' && status?.stockfish_ready && (
            <span className="hidden md:inline-block text-[11px] font-mono text-ink-2 mr-1">
              {isSpectator ? 'Khán giả · Live Eval' : modeLabel}
              {!isSpectator && phase === 'playing'
                ? ` · ${ANALYSIS_LEVEL_LABELS[config.analysis].label}`
                : ''}
            </span>
          )}

          {/* Giao diện & chất liệu bàn */}
          <ThemePicker />

          {/* Menu Tài khoản & Link Admin UI */}
          <UserDropdownMenu
            user={currentUser}
            currentScreen={screen}
            onNavigate={setScreen}
            onOpenChangePassword={() => setShowPasswordModal(true)}
            onLogout={handleLogout}
          />
        </div>
      </header>

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
        <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row md:overflow-hidden">
          {/* Vùng bàn cờ trung tâm — tận dụng tối đa chiều dọc */}
          <div
            ref={boardStageRef}
            className="relative flex-1 min-w-0 min-h-[360px] md:min-h-0 md:h-full bg-base flex items-center justify-center px-2 py-1.5 overflow-hidden"
          >
            {activeTab === 'play' && (
              /* Đối xứng 3 cột trên màn hình rộng: rail trái (bottomSide) · cột giữa (tên + bàn + tên) · rail phải (topSide) */
              <div className="h-full flex items-center justify-center gap-2">
                {showSideRails && (
                  <div className="hidden sm:block">
                    <CapturedBar {...capturedBarProps(bottomSide, 'bottom')} />
                  </div>
                )}

                <div className="h-full flex flex-col items-center justify-center gap-1.5">
                  {/* Trên: thẻ người chơi của bên ở trên bàn */}
                  <div style={{ width: boardSize }} className="shrink-0">
                    <PlayerCard
                      {...playerCardProps(topSide)}
                      capturedSymbols={
                        !showSideRails
                          ? capturedBarProps(topSide, 'top').symbols
                          : undefined
                      }
                      materialDiff={
                        !showSideRails
                          ? capturedBarProps(topSide, 'top').diff
                          : undefined
                      }
                    />
                  </div>

                  <div
                    style={{ width: boardSize, height: boardSize }}
                    className="relative rounded-md overflow-hidden shadow-2xl border border-line shrink-0"
                  >
                    <Chessboard
                      id="TheChessStudioBoard"
                      boardWidth={boardSize}
                      position={displayedPosition}
                      boardOrientation={boardOrientation}
                      onPieceDrop={handlePieceDrop}
                      onSquareClick={handleSquareClick}
                      customArrows={customArrows}
                      customSquareStyles={customSquareStyles}
                      customPieces={cburnettPieces}
                      customDarkSquareStyle={{ backgroundColor: themeColors.dark }}
                      customLightSquareStyle={{ backgroundColor: themeColors.light }}
                      animationDuration={160}
                    />
                    {pendingPromo && (
                      <PromotionDialog
                        color={chessInstance.turn()}
                        onPick={(p) => {
                          const pp = pendingPromo;
                          setPendingPromo(null);
                          if (pp) executeMove(pp.from, pp.to, p);
                        }}
                        onCancel={() => setPendingPromo(null)}
                      />
                    )}

                    {/* Overlay Phòng chờ (Waiting Room) khi tạo trận đấu người trực tuyến */}
                    {activeMatch?.status === 'waiting' && (
                      <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="w-full max-w-xs bg-panel border border-line rounded-xl p-5 text-center shadow-2xl">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-semibold uppercase tracking-wider mb-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Đang chờ đối thủ vào bàn
                          </div>
                          <div className="text-xs text-ink-2 mb-3">
                            Gửi mã phòng bên dưới cho bạn bè để vào đấu trực tiếp:
                          </div>
                          <div className="font-mono text-2xl font-bold tracking-widest text-accent bg-inset border border-line rounded-lg py-2.5 mb-3 select-all">
                            #{activeMatch.room_code}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  activeMatch.room_code || ''
                                );
                                pushToast(
                                  `Đã sao chép mã phòng #${activeMatch.room_code}!`,
                                  'success'
                                );
                              }}
                              className="flex-1 py-2 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold transition cursor-pointer"
                            >
                              Sao chép mã phòng
                            </button>
                            <button
                              type="button"
                              onClick={() => setScreen('home')}
                              className="px-3 py-2 rounded-lg bg-inset hover:bg-card border border-line text-xs text-ink-2 hover:text-ink transition cursor-pointer"
                            >
                              Về sảnh
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Overlay khi ván chưa bắt đầu */}
                    {phase === 'setup' && !showPreMatch && (
                      <div className="absolute inset-0 z-10 bg-black/45 flex items-center justify-center">
                        <button
                          onClick={() => setShowPreMatch(true)}
                          className="px-4 py-2.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold shadow-2xl transition cursor-pointer"
                        >
                          Chuẩn bị &amp; Bắt đầu ván đấu
                        </button>
                      </div>
                    )}

                    {/* Nút mở lại tổng kết sau khi đóng modal */}
                    {phase === 'finished' && !showGameOver && !reviewMode && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                        <button
                          onClick={() => setShowGameOver(true)}
                          className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-[11px] font-semibold shadow-2xl transition cursor-pointer"
                        >
                          Xem tổng kết ván đấu
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dưới: thẻ người chơi của bên ở dưới bàn */}
                  <div style={{ width: boardSize }} className="shrink-0">
                    <PlayerCard
                      {...playerCardProps(bottomSide)}
                      capturedSymbols={
                        !showSideRails
                          ? capturedBarProps(bottomSide, 'bottom').symbols
                          : undefined
                      }
                      materialDiff={
                        !showSideRails
                          ? capturedBarProps(bottomSide, 'bottom').diff
                          : undefined
                      }
                    />
                  </div>
                </div>

                {showSideRails && (
                  <div className="hidden sm:block">
                    <CapturedBar {...capturedBarProps(topSide, 'top')} />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'editor' && (
              <div
                style={{ width: boardSize, height: boardSize }}
                className="relative rounded-md overflow-hidden shadow-2xl border border-line shrink-0"
              >
                <Chessboard
                  id="TheChessStudioBoard"
                  boardWidth={boardSize}
                  position={displayedPosition}
                  boardOrientation={boardOrientation}
                  onPieceDrop={handlePieceDrop}
                  onSquareClick={handleSquareClick}
                  customPieces={cburnettPieces}
                  customDarkSquareStyle={{ backgroundColor: themeColors.dark }}
                  customLightSquareStyle={{ backgroundColor: themeColors.light }}
                  animationDuration={160}
                />
              </div>
            )}
          </div>

          {/* Cột công cụ bên phải — tự động mở rộng khi bật chế độ ReviewScreen (ISS-09) */}
          <aside
            className={`w-full ${
              reviewMode
                ? 'md:w-[460px] lg:w-[500px] xl:w-[560px]'
                : 'md:w-[390px] lg:w-[430px] xl:w-[480px]'
            } shrink-0 min-h-[420px] md:min-h-0 md:h-full border-t md:border-t-0 md:border-l border-line bg-panel flex flex-col overflow-hidden transition-[width] duration-200`}
          >
            {activeTab === 'editor' ? (
              <Suspense fallback={<LazyFallback />}>
                <BoardEditor
                  boardMap={editorBoardMap}
                  onUpdateBoardMap={setEditorBoardMap}
                  selectedTool={editorTool}
                  onSelectTool={setEditorTool}
                  presets={status?.presets || []}
                  onApplyPosition={handleApplyCustomPosition}
                />
              </Suspense>
            ) : reviewMode ? (
              <Suspense fallback={<LazyFallback />}>
                <ReviewScreen
                  onClose={() => setReviewMode(false)}
                  moves={moves}
                  currentPly={currentPly}
                  onSelectPly={(ply) => setCurrentPly(ply)}
                  reviewResult={reviewResult}
                  isReviewing={isReviewing}
                  reviewProgress={reviewProgress}
                  onRunReview={handleRunGameReview}
                  onUpdateReviewLines={setReviewLines}
                  onTryAlternativeMove={handleTryAlternativeMove}
                />

                <EvalGraph
                  moves={moves}
                  currentPly={currentPly}
                  onSelectPly={(ply) => setCurrentPly(ply)}
                  reviewResult={reviewResult}
                  isReviewing={isReviewing}
                  embedded
                />
              </Suspense>
            ) : (
              <>
                <EnginePanel
                  phase={phase}
                  config={config}
                  visibility={visibility}
                  modeLabel={isSpectator ? 'Đang xem trực tiếp' : modeLabel}
                  onOpenConfig={openPreMatch}
                  onResign={handleResign}
                  onHint={handleHint}
                  canHint={canHint}
                  showEval={showEval}
                  onToggleEval={() => setShowEval((v) => !v)}
                  showArrows={showArrows}
                  onToggleArrows={() => setShowArrows((v) => !v)}
                  multipv={multipv}
                  onChangeMultipv={setMultipv}
                  depth={depth}
                  onChangeDepth={setDepth}
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
                  onTriggerAiMoveNow={() => triggerAiMove(currentFen)}
                  isAiThinking={isAiThinking}
                />

                <MoveHistory
                  moves={moves}
                  currentPly={currentPly}
                  phase={phase}
                  canTakeback={visibility.takeback}
                  visibility={visibility}
                  onSelectPly={(ply) => setCurrentPly(ply)}
                  onTakeback={handleTakeback}
                  onExportPgn={handleExportPgn}
                  onBranchFromHere={() => {
                    if (isSpectator) return;
                    setMoves((prev) => prev.slice(0, currentPly));
                  }}
                  onFlipBoard={() =>
                    setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))
                  }
                  onSwitchSides={() => {
                    if (isSpectator) return;
                    const nextColor = playerColor === 'w' ? 'b' : 'w';
                    handleChangePlayerColor(nextColor);
                  }}
                  onNewGame={
                    activeMatch
                      ? () => setScreen('home')
                      : handleNewGame
                  }
                />

                {visibility.evalGraph && (
                  <EvalGraph
                    moves={moves}
                    currentPly={currentPly}
                    onSelectPly={(ply) => setCurrentPly(ply)}
                    reviewResult={reviewResult}
                    isReviewing={isReviewing}
                    onRunReview={() => handleOpenReview(true)}
                    onOpenReview={() => handleOpenReview(false)}
                    canReview={visibility.reviewButton}
                  />
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {/* Màn chuẩn bị ván đấu (dùng khi tinh chỉnh sâu trong MatchScreen) */}
      {screen === 'match' && activeTab === 'play' && (
        <PreMatchDialog
          open={showPreMatch && phase === 'setup'}
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
          onStart={handleStartGame}
          onClose={() => setShowPreMatch(false)}
        />
      )}

      {/* Modal kết thúc ván đấu */}
      {screen === 'match' && (
        <GameOverDialog
          open={showGameOver && !!gameOver}
          gameOver={gameOver}
          players={players}
          accuracy={
            reviewResult
              ? { w: reviewResult.white_accuracy, b: reviewResult.black_accuracy }
              : activeMatch?.white_accuracy != null &&
                activeMatch?.black_accuracy != null
              ? {
                  w: activeMatch.white_accuracy,
                  b: activeMatch.black_accuracy,
                }
              : null
          }
          onNewGame={handleNewGame}
          onRematch={handleRematch}
          onAnalyze={() => handleOpenReview(true)}
          onExportPgn={handleExportPgn}
          onClose={() => setShowGameOver(false)}
        />
      )}

      {/* Modal đổi mật khẩu (bắt buộc lần đầu hoặc chủ động từ UserDropdownMenu) */}
      <ChangePasswordModal
        open={currentUser.must_change_password || showPasswordModal}
        mandatory={currentUser.must_change_password}
        currentDisplayName={currentUser.display_name}
        onSubmit={handlePasswordChange}
        onClose={
          currentUser.must_change_password
            ? undefined
            : () => setShowPasswordModal(false)
        }
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
