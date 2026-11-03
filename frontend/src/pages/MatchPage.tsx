import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Chess, Square as ChessSquare } from 'chess.js';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import {
  analyzePosition,
  appendMatchMoveApi,
  classifySingleMove,
  createMatchApi,
  finishMatchApi,
  getMatchApi,
  markNotificationsReadApi,
  pauseMatchApi,
  requestAIMove,
  resumeMatchApi,
  saveMatchReviewApi,
  takebackMatchApi,
} from '../api';
import {
  AssistantEngineConfig,
  GameOverInfo,
  GamePhase,
  GameConfig,
  MatchRecord,
  MatchWithDetailsResponse,
  MoveRecord,
  PlayerInfo,
  PVLine,
  UserRecord,
} from '../types';
import {
  STARTING_FEN,
  ANALYSIS_LEVEL_LABELS,
  MODE_PRESETS,
  alignPlayersWithColor,
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
} from '../gameUtils';
import type { EditorTool } from '../components/BoardEditor';
import {
  ARROW_COLORS,
  CLASSIFICATION_META,
  HINT_ARROW_COLOR,
} from '../theme/semantic';
import { squareOverlays } from '../theme/board';
import { useTheme } from '../theme/ThemeProvider';
import { useBoardSize } from '../hooks/useBoardSize';
import { useGameReview } from '../hooks/useGameReview';
import { useChessClock } from '../hooks/useChessClock';
import { useMatchSync } from '../hooks/useMatchSync';
import { useAnalysisController } from '../hooks/useAnalysisController';
import { useLiveClassification } from '../hooks/useLiveClassification';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApp } from '../context/AppContext';
import { soundManager } from '../utils/sound';
import { MatchScreen } from '../components/MatchScreen';
import { MatchModals } from '../components/MatchModals';

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

export const MatchPage: React.FC = () => {
  const { matchId } = useParams<{ matchId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { currentUser, refreshCurrentUser } = useAuth();
  const { pushToast } = useToast();
  const { status, refreshNotifications } = useApp();
  const { boardTheme } = useTheme();

  const tabParam = searchParams.get('tab');
  const reviewParam = searchParams.get('review') === '1';

  const [activeTab, setActiveTab] = useState<'play' | 'editor'>(
    tabParam === 'editor' ? 'editor' : 'play'
  );

  useEffect(() => {
    if (tabParam === 'editor' && activeTab !== 'editor') {
      setActiveTab('editor');
    } else if (!tabParam && activeTab === 'editor') {
      setActiveTab('play');
    }
  }, [tabParam, activeTab]);

  // --- Trạng thái ván đấu ---
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
  const phaseRef = useRef<GamePhase>(phase);
  const lastFinishedMatchRef = useRef<MatchRecord | null>(null);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
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
    (SAVED_GAME?.phase ?? 'setup') === 'setup' && !matchId
  );
  const [showGameOver, setShowGameOver] = useState(
    SAVED_GAME?.phase === 'finished'
  );
  const [reviewMode, setReviewMode] = useState(reviewParam);
  useEffect(() => {
    if (reviewParam && !reviewMode) {
      setReviewMode(true);
    }
  }, [reviewParam, reviewMode]);
  const [reviewArrowMode, setReviewArrowMode] = useState<'played' | 'suggestions'>('played');
  const [reviewLines, setReviewLines] = useState<PVLine[] | null>(null);
  const [hintArrow, setHintArrow] = useState<Arrow | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Engine trợ lý cho nút "AI đi" (training) & "Gợi ý"
  const [assistantEngine, setAssistantEngine] = useState<AssistantEngineConfig>(() => {
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
      window.localStorage.setItem('thechess_assistant', JSON.stringify(assistantEngine));
    } catch {
      // ignore
    }
  }, [assistantEngine]);

  // --- Board Editor ---
  const [editorBoardMap, setEditorBoardMap] = useState<Record<string, string>>(() =>
    fenToBoardMap(STARTING_FEN)
  );
  const [editorTool, setEditorTool] = useState<EditorTool>('wQ');

  const { boardStageRef, boardSize, showSideRails } = useBoardSize(
    activeTab,
    `match-${matchId || 'local'}`
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
    activeTab === 'play' &&
    (isSpectator ||
      phase === 'finished' ||
      (phase === 'playing' && config.analysis !== 'off'));

  // Hết giờ — cập nhật trạng thái ván đấu
  const handleClockTimeout = useCallback(
    (info: GameOverInfo) => {
      setGameOver(info);
      setPhase('finished');
      setShowGameOver(true);
      soundManager.playGameOver(
        info.result === '1-0' || info.result === '0-1' || info.result === '1/2-1/2'
          ? info.result
          : '1/2-1/2',
        playerColor
      );
    },
    [playerColor]
  );

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
    screen: 'match',
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

  // Phân loại realtime cho nước đi ĐỒNG BỘ TỪ SERVER
  useLiveClassification({
    enabled: activeTab === 'play' && (isSpectator || visibility.classifyLive),
    moves,
    setMoves,
  });

  const handleChangePlayerColor = useCallback(
    (nextColor: 'w' | 'b') => {
      setPlayerColor(nextColor);
      setBoardOrientation(nextColor === 'w' ? 'white' : 'black');
      setPlayers((prev) => alignPlayersWithColor(prev, nextColor, config.opponent));
    },
    [config.opponent]
  );

  // --- Quản lý tạm dừng (Time-out) khi mất kết nối ---
  const [dismissedPausePromptForMatchId, setDismissedPausePromptForMatchId] =
    useState<string | null>(null);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);

  const mySide = activeMatch
    ? activeMatch.white_user_id === currentUser?.id
      ? 'w'
      : activeMatch.black_user_id === currentUser?.id
      ? 'b'
      : null
    : null;
  const oppSide = mySide === 'w' ? 'b' : mySide === 'b' ? 'w' : null;

  const isOpponentDisconnected = Boolean(
    activeMatch &&
      phase === 'playing' &&
      !activeMatch.is_paused &&
      !isSpectator &&
      oppSide &&
      players[oppSide]?.type === 'human' &&
      (oppSide === 'w' ? !activeMatch.white_connected : !activeMatch.black_connected)
  );

  useEffect(() => {
    if (!isOpponentDisconnected && dismissedPausePromptForMatchId) {
      setDismissedPausePromptForMatchId(null);
    }
  }, [isOpponentDisconnected, dismissedPausePromptForMatchId]);

  const showPausePrompt =
    isOpponentDisconnected &&
    dismissedPausePromptForMatchId !== activeMatch?.id;

  const handleConfirmPause = useCallback(async () => {
    if (!activeMatch) return;
    try {
      const res = await pauseMatchApi(activeMatch.id);
      setActiveMatch(res.match);
      pushToast('Ván đấu đã được tạm dừng.', 'info');
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Không thể tạm dừng ván đấu',
        'error'
      );
    }
  }, [activeMatch, pushToast]);

  const handleDismissPausePrompt = useCallback(() => {
    if (activeMatch) {
      setDismissedPausePromptForMatchId(activeMatch.id);
    }
  }, [activeMatch]);

  const handleResumeMatch = useCallback(async () => {
    if (!activeMatch) return;
    try {
      const res = await resumeMatchApi(activeMatch.id);
      setActiveMatch(res.match);
      setResumeCountdown(null);
      pushToast('Ván đấu đã tiếp tục!', 'success');
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Không thể tiếp tục ván đấu',
        'error'
      );
    }
  }, [activeMatch, pushToast]);

  // Đếm ngược 3s khi cả hai người chơi kết nối lại trong ván PvP đang tạm dừng
  const bothConnectedInPausedPvp = Boolean(
    activeMatch &&
      activeMatch.is_paused &&
      phase === 'playing' &&
      players.w.type === 'human' &&
      players.b.type === 'human' &&
      activeMatch.white_connected &&
      activeMatch.black_connected
  );

  const handleResumeMatchRef = useRef(handleResumeMatch);
  useEffect(() => {
    handleResumeMatchRef.current = handleResumeMatch;
  }, [handleResumeMatch]);

  useEffect(() => {
    if (!bothConnectedInPausedPvp) {
      setResumeCountdown(null);
      return;
    }
    // Bắt đầu đếm ngược từ 3
    setResumeCountdown(3);
    const interval = setInterval(() => {
      setResumeCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleResumeMatchRef.current();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [bothConnectedInPausedPvp]);

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
      const isSystemMatch = res.white_player?.is_bot && res.black_player?.is_bot;
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

      const hasBotPlayer = Boolean(res.white_player?.is_bot || res.black_player?.is_bot);
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
        const winner = m.result === '1-0' ? 'w' : m.result === '0-1' ? 'b' : null;
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
        if (participant) {
          markNotificationsReadApi({ kind: 'turn' })
            .then(() => refreshNotifications())
            .catch(() => {});
        }
      }

      setActiveTab('play');
    },
    [resetReview, syncClockFromServer, refreshNotifications]
  );

  // Load match from server if matchId is present in URL
  const loadedMatchIdRef = useRef<string | null>(null);
  const consumedRouterMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!matchId) {
      loadedMatchIdRef.current = null;
      return;
    }
    if (!currentUser) return;

    // Tránh re-hydrate đè lên ván đấu đang diễn ra/kết thúc khi currentUser cập nhật
    if (loadedMatchIdRef.current === matchId) return;

    // Check if matchData was passed via router navigation state (chỉ dùng 1 lần duy nhất khi vừa chuyển trang)
    const routerState = location.state as { matchData?: MatchWithDetailsResponse } | null;
    if (
      routerState?.matchData &&
      routerState.matchData.match.id === matchId &&
      consumedRouterMatchIdRef.current !== matchId
    ) {
      consumedRouterMatchIdRef.current = matchId;
      loadedMatchIdRef.current = matchId;
      hydrateMatchFromServer(routerState.matchData, currentUser, { openReview: reviewParam });
      try {
        window.history.replaceState({}, document.title);
      } catch {
        // ignore
      }
      return;
    }

    let isMounted = true;
    getMatchApi(matchId)
      .then((res) => {
        if (!isMounted) return;
        loadedMatchIdRef.current = matchId;
        hydrateMatchFromServer(res, currentUser, { openReview: reviewParam });
      })
      .catch((err) => {
        console.error('Lỗi tải ván đấu từ server:', err);
        pushToast('Không thể tải ván đấu từ máy chủ.', 'error');
        navigate('/');
      });

    return () => {
      isMounted = false;
    };
  }, [matchId, currentUser?.id, hydrateMatchFromServer, navigate, pushToast, reviewParam]);

  // Polling / WebSocket đồng bộ ván đấu (useMatchSync)
  useMatchSync({
    screen: 'match',
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

  // Lưu ván cờ local vào localStorage
  useEffect(() => {
    if (activeMatch) return; // Ván server lưu trên DB
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
  }, [
    activeMatch,
    initialFen,
    moves,
    currentPly,
    playerColor,
    phase,
    config,
    players,
    gameOver,
  ]);


  // Tự động lưu Game Review vào DB khi hoàn tất chấm điểm
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

  // Hiển thị dialog kết thúc optimistic
  useEffect(() => {
    if (phase !== 'playing') return;
    if (currentPly !== moves.length) return;
    const info = detectGameOver(currentFen);
    if (info) {
      setGameOver(info);
      setPhase('finished');
      setShowGameOver(true);
      setHintArrow(null);
      soundManager.playGameOver(
        info.result === '1-0' || info.result === '0-1' || info.result === '1/2-1/2'
          ? info.result
          : '1/2-1/2',
        playerColor
      );
    }
  }, [phase, currentFen, currentPly, moves.length, playerColor]);

  // Phím tắt điều hướng ván cờ: ← → Home End
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (activeTab !== 'play') return;
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
  }, [activeTab, moves.length]);

  // ------------------ Nước đi ------------------

  const executeMove = useCallback(
    (
      fromSq: string,
      toSq: string,
      promotion: string = 'q',
      basePlyOverride?: number
    ): boolean => {
      if (phase !== 'playing' || isSpectator) return false;
      if (activeMatch?.status === 'waiting' || activeMatch?.is_paused) return false;

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
          soundManager.playError();
          return false;
        }
      }
      if (!moveObj) {
        soundManager.playError();
        return false;
      }

      const isCapture = Boolean(moveObj.captured || moveObj.san.includes('x'));
      const isCheckmate = Boolean(game.isCheckmate() || moveObj.san.includes('#'));
      const isCheck = Boolean(game.isCheck() || moveObj.san.includes('+'));
      const isCastle = Boolean(moveObj.san.startsWith('O-O'));
      soundManager.playMove({ isCapture, isCheck, isCheckmate, isCastle });

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

      // Đồng hồ Fischer
      let nextMoverClock: number | null = null;
      if (activeMatch && activeMatch.initial_time_ms != null) {
        const inc = activeMatch.increment_ms || 0;
        if (moverTurn === 'w') {
          nextMoverClock = Math.max(0, (whiteClockMs ?? activeMatch.initial_time_ms) + inc);
          setWhiteClockMs(nextMoverClock);
          turnStartClockRef.current = blackClockMs ?? activeMatch.initial_time_ms;
        } else {
          nextMoverClock = Math.max(0, (blackClockMs ?? activeMatch.initial_time_ms) + inc);
          setBlackClockMs(nextMoverClock);
          turnStartClockRef.current = whiteClockMs ?? activeMatch.initial_time_ms;
        }
      }

      // Đồng bộ nước đi lên Backend DB
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

      // Chấm điểm nước đi realtime
      if (visibility.classifyLive) {
        const prevMove = baseMoves[baseMoves.length - 1];
        const cachedBeforeWin =
          analysis?.fen === baseFen ? analysis.win_percent_white : prevMove?.winPercentWhite;
        const cachedBestUci =
          analysis?.fen === baseFen ? analysis.lines[0]?.move_uci ?? null : undefined;
        const cachedBestSan =
          analysis?.fen === baseFen ? analysis.lines[0]?.move_san ?? null : undefined;

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
            pushToast('Không chấm điểm được nước vừa đi (engine đang bận).', 'error');
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
      lastTurnStartRef,
      setWhiteClockMs,
      setBlackClockMs,
      turnStartClockRef,
    ]
  );

  const tryMove = useCallback(
    (fromSq: string, toSq: string): boolean => {
      if (phase !== 'playing' || isSpectator) return false;
      if (activeMatch?.status === 'waiting' || activeMatch?.is_paused) return false;
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
        if (phaseRef.current !== 'playing') return;
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

  const triggerAiMoveRef = useRef(triggerAiMove);
  useEffect(() => {
    triggerAiMoveRef.current = triggerAiMove;
  }, [triggerAiMove]);

  useEffect(() => {
    if (activeTab !== 'play') return;
    if (phase !== 'playing' || isSpectator) return;
    if (activeMatch?.is_paused) return;
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
    activeTab,
    phase,
    isSpectator,
    activeMatch?.is_paused,
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

    if (isAiThinking || isSpectator || activeMatch?.is_paused) return;

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

  const customArrows: Arrow[] = useMemo(() => {
    const out: Arrow[] = [];
    if (activeTab === 'editor') return out;

    if (reviewMode) {
      if (reviewArrowMode === 'suggestions') {
        if (reviewLines && reviewLines.length > 0) {
          out.push(
            ...reviewLines
              .filter((line) => line.from_square && line.to_square && line.from_square !== line.to_square)
              .map(
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
          if (mv.from && mv.to && mv.from !== mv.to) {
            const arrowColor =
              (mv.classification && CLASSIFICATION_META[mv.classification]?.color) ||
              mv.color ||
              'rgba(56, 189, 248, 0.85)';
            out.push([mv.from as Square, mv.to as Square, arrowColor]);
          }
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
        ...analysis.lines
          .filter((line) => line.from_square && line.to_square && line.from_square !== line.to_square)
          .map(
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

    if (currentPly > 0 && moves[currentPly - 1]) {
      const last = moves[currentPly - 1];
      const moveColor =
        (last.classification && CLASSIFICATION_META[last.classification]?.color) ||
        last.color;
      if (reviewMode && reviewArrowMode === 'suggestions') {
        styles[last.from] = { backgroundColor: squareOverlays.lastMoveFrom };
      } else {
        styles[last.from] = { backgroundColor: squareOverlays.lastMoveFrom };
        styles[last.to] = {
          backgroundColor: moveColor ? `${moveColor}48` : squareOverlays.lastMoveTo,
        };
      }
    }

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

  const handleStartGame = async () => {
    if (!currentUser) return;

    setGameOver(null);
    resetReview();

    const chosenColor: 'w' | 'b' = playerColor;
    let whiteId = currentUser.id;
    let blackId = currentUser.id;
    let matchStatus: 'waiting' | 'playing' = 'playing';

    const useBotOpponent =
      config.mode === 'vs_ai' ||
      (config.mode === 'training' && config.opponent === 'ai');

    const oppSide = playerColor === 'w' ? 'b' : 'w';
    const aiSettings = players[oppSide]?.ai ?? {
      engine: 'maia' as const,
      elo: 1500,
    };

    if (config.mode === 'online') {
      matchStatus = 'waiting';
      whiteId = currentUser.id;
      blackId = currentUser.id;
    } else if (useBotOpponent) {
      const nearestMaia = Math.min(
        1900,
        Math.max(1100, Math.round((aiSettings.elo || 1500) / 100) * 100)
      );
      const botId =
        aiSettings.engine === 'stockfish'
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

    const analysisLevel = config.mode === 'online' ? 'off' : config.analysis;
    const allowTakeback = config.mode === 'online' ? false : config.allowTakeback;
    const allowHints = config.mode === 'online' ? false : config.allowHints;

    const nonStandardPresets = (status?.presets || []).filter(
      (p) => p.id !== 'standard' && p.fen !== STARTING_FEN
    );
    const matchedPreset = nonStandardPresets.find((p) => p.fen === initialFen);
    const prev = lastFinishedMatchRef.current ?? activeMatch;

    try {
      const res = await createMatchApi({
        mode: config.mode,
        status: matchStatus,
        is_rated: config.mode === 'vs_ai',
        white_user_id: whiteId,
        black_user_id: blackId,
        ai_elo_override: useBotOpponent ? aiSettings.elo : null,
        analysis_level: analysisLevel,
        allow_takeback: allowTakeback,
        allow_hints: allowHints,
        time_control_type: prev?.time_control_type || 'untimed',
        initial_time_ms: prev?.initial_time_ms || null,
        increment_ms: prev?.increment_ms || 0,
        preset_id: matchedPreset?.id ?? null,
        initial_fen: initialFen || STARTING_FEN,
        generate_room_code: config.mode === 'online',
      });

      setShowPreMatch(false);
      hydrateMatchFromServer(res, currentUser);

      if (res.match.status === 'waiting') {
        pushToast(
          `Đã tạo phòng chờ #${res.match.room_code}. Chia sẻ mã này cho đối thủ!`,
          'info'
        );
      } else {
        pushToast(
          `Bắt đầu ván (${modeLabel} · Phân tích: ${
            ANALYSIS_LEVEL_LABELS[config.analysis].label
          })`,
          'success'
        );
      }

      navigate(`/match/${res.match.id}`, { replace: true, state: { matchData: res } });
    } catch (err) {
      console.error('Lỗi khởi tạo ván đấu:', err);
      pushToast(
        err instanceof Error ? err.message : 'Không thể tạo ván đấu trên máy chủ.',
        'error'
      );
    }
  };

  const openPreMatch = () => {
    if (isSpectator) {
      navigate('/');
      return;
    }
    if (phase === 'playing' && moves.length > 0) {
      if (
        !window.confirm(
          'Về màn hình chuẩn bị? Ván hiện tại sẽ dừng lại (các nước đã đi vẫn được giữ).'
        )
      ) {
        return;
      }
    }
    lastFinishedMatchRef.current = activeMatch;
    setActiveMatch(null);
    setPhase('setup');
    setGameOver(null);
    setShowPreMatch(true);
  };

  const handleNewGame = () => {
    lastFinishedMatchRef.current = activeMatch;
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
    if (matchId) {
      navigate('/play');
    }
  };

  const handleRematch = async () => {
    if (!currentUser) return;
    if (!activeMatch) {
      pushToast('Không tìm thấy biên bản ván vừa kết thúc — không rematch được.', 'error');
      return;
    }
    try {
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
      navigate(`/match/${res.match.id}`, { state: { matchData: res } });

      if (isOnlineHuman) {
        pushToast(
          `Đã tạo phòng rematch #${res.match.room_code}. Chia sẻ mã này cho đối thủ!`,
          'info'
        );
        return;
      }
      const myNewColor = activeMatch.white_user_id === currentUser.id ? 'b' : 'w';
      pushToast(`Rematch — đổi màu sang ${myNewColor === 'w' ? 'Trắng' : 'Đen'}!`, 'success');
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
    soundManager.playGameOver(result, playerColor);

    if (activeMatch && activeMatch.status === 'playing') {
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
      config.opponent === 'ai' && chessInstance.turn() === playerColor && moves.length >= 2
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

  const topSide: 'w' | 'b' = boardOrientation === 'white' ? 'b' : 'w';
  const bottomSide: 'w' | 'b' = boardOrientation === 'white' ? 'w' : 'b';

  const displayedFen =
    reviewMode && reviewArrowMode === 'suggestions' && currentPly > 0
      ? moves[currentPly - 1]?.fenBefore || initialFen
      : currentFen;

  const playerCardProps = (side: 'w' | 'b') => {
    const isDisconnected =
      activeMatch != null &&
      phase === 'playing' &&
      players[side].type === 'human' &&
      (side === 'w' ? !activeMatch.white_connected : !activeMatch.black_connected);

    return {
      player: players[side],
      side,
      isTurn:
        phase === 'playing' &&
        activeMatch?.status !== 'waiting' &&
        chessInstance.turn() === side,
      isThinking: isAiThinking && aiPlayer === players[side],
      isDisconnected,
      rating: side === 'w' ? whiteRating : blackRating,
      clockMs: side === 'w' ? whiteClockMs : blackClockMs,
    };
  };

  const capturedBarProps = (side: 'w' | 'b', dock: 'bottom' | 'top') => ({
    side,
    symbols: side === 'w' ? material.capturedByWhite : material.capturedByBlack,
    diff: side === 'w' ? material.diff : -material.diff,
    boardSize,
    dock,
  });

  if (!currentUser) return null;

  // Khi đang nạp ván từ server (đặc biệt khi vào ván lịch sử kèm ?review=1),
  // hiển thị spinner chờ hydrate dữ liệu thay vì vội vàng render ReviewScreen trên dữ liệu rác.
  const isMatchHydrating = Boolean(matchId && loadedMatchIdRef.current !== matchId);
  if (isMatchHydrating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-base text-ink gap-3">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-ink-3">
          {reviewParam ? 'Đang chuẩn bị dữ liệu phân tích...' : 'Đang tải ván đấu...'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col min-h-0 relative">
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
        displayedPosition={displayedFen}
        boardOrientation={boardOrientation}
        customArrows={customArrows}
        customSquareStyles={customSquareStyles}
        themeColors={boardTheme}
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
        onReturnToLobby={() => navigate('/')}
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
        onNewGame={handleNewGame}
        onOpenReview={handleOpenReview}
        onResumeMatch={activeMatch?.is_paused ? handleResumeMatch : undefined}
      />

      {currentUser && (
        <MatchModals
          screen="match"
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
          showPausePrompt={showPausePrompt}
          onConfirmPause={handleConfirmPause}
          onDismissPausePrompt={handleDismissPausePrompt}
          resumeCountdown={resumeCountdown}
        />
      )}
    </div>
  );
};

export default MatchPage;
