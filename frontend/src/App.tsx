import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chess, Square as ChessSquare } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import {
  analyzePosition,
  classifySingleMove,
  fetchStatus,
  getReviewJob,
  requestAIMove,
  startGameReview,
} from './api';
import {
  AnalysisResponse,
  EngineStatus,
  GameConfig,
  GameOverInfo,
  GamePhase,
  GameReviewResult,
  MoveRecord,
  PlayerInfo,
  PresetPosition,
} from './types';
import { EnginePanel } from './components/EnginePanel';
import { MoveHistory } from './components/MoveHistory';
import { EvalGraph } from './components/EvalGraph';
import { Toasts, useToasts } from './components/Toasts';
import { PromotionDialog } from './components/PromotionDialog';
import { PlayerCard } from './components/PlayerCard';
import { CapturedBar } from './components/CapturedRail';
import { PreMatchDialog } from './components/PreMatchDialog';
import { GameOverDialog } from './components/GameOverDialog';
import { ReviewScreen } from './components/ReviewScreen';
import {
  STARTING_FEN,
  ANALYSIS_LEVEL_LABELS,
  MODE_PRESETS,
  buildPgn,
  clearSavedGame,
  detectGameOver,
  downloadPgn,
  getMaterialInfo,
  loadSavedGame,
  makeDefaultPlayers,
  resolveFeatureVisibility,
  saveGame,
} from './gameUtils';
import {
  BoardEditor,
  EditorTool,
  fenToBoardMap,
  boardMapToFenPlacement,
} from './components/BoardEditor';

// Ván cờ đã lưu trong localStorage (nếu có), đọc một lần khi mount
const SAVED_GAME = loadSavedGame();

// Màu mũi tên đồng bộ với thứ hạng nhánh phân tích (Top 1: Xanh ngọc, Top 2: Xanh dương, Top 3: Vàng hổ phách)
const ARROW_COLORS = [
  'rgba(16, 185, 129, 0.82)',
  'rgba(56, 189, 248, 0.72)',
  'rgba(245, 158, 11, 0.68)',
  'rgba(168, 85, 247, 0.6)',
  'rgba(236, 72, 153, 0.55)',
];

const HINT_ARROW_COLOR = 'rgba(250, 204, 21, 0.92)';

const BOARD_THEMES: Record<
  'stone' | 'wood' | 'graphite',
  { name: string; light: string; dark: string }
> = {
  stone: { name: 'Warm Stone', light: '#dedbd2', dark: '#878278' },
  wood: { name: 'Classic Wood', light: '#eadbc8', dark: '#a98260' },
  graphite: { name: 'Graphite', light: '#cfd1d4', dark: '#5e6268' },
};

export const App: React.FC = () => {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'play' | 'editor'>('play');
  const [boardTheme, setBoardTheme] = useState<'stone' | 'wood' | 'graphite'>(
    SAVED_GAME?.boardTheme ?? 'stone'
  );

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
  const [players, setPlayers] = useState<{ w: PlayerInfo; b: PlayerInfo }>(
    SAVED_GAME?.players ?? makeDefaultPlayers()
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
  const [hintArrow, setHintArrow] = useState<Arrow | null>(null);

  // --- Người chơi / AI ---
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>(
    SAVED_GAME?.playerColor ?? 'w'
  );
  const [isAiThinking, setIsAiThinking] = useState(false);

  // --- Phân tích ---
  const [showEval, setShowEval] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [multipv, setMultipv] = useState<number>(3);
  const [depth, setDepth] = useState<number>(15);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // --- Game Review ---
  const [reviewResult, setReviewResult] = useState<GameReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [reviewProgress, setReviewProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // --- Board Editor ---
  const [editorBoardMap, setEditorBoardMap] = useState<Record<string, string>>(
    () => fenToBoardMap(STARTING_FEN)
  );
  const [editorTool, setEditorTool] = useState<EditorTool>('wQ');

  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState<number>(560);

  const { toasts, pushToast, dismissToast } = useToasts();

  // ------------------ Derived ------------------

  const currentFen =
    currentPly === 0 ? initialFen : moves[currentPly - 1]?.fenAfter || initialFen;

  const chessInstance = React.useMemo(() => {
    try {
      return new Chess(currentFen);
    } catch {
      return new Chess();
    }
  }, [currentFen]);

  const visibility = useMemo(
    () => resolveFeatureVisibility(config, phase),
    [config, phase]
  );

  const modeLabel =
    MODE_PRESETS.find((m) => m.id === config.mode)?.label ?? config.mode;

  const aiSide: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
  const aiPlayer =
    config.opponent === 'ai' && players[aiSide]?.type === 'ai'
      ? players[aiSide]
      : null;

  const material = useMemo(() => getMaterialInfo(currentFen), [currentFen]);

  const analysisEnabled =
    activeTab === 'play' &&
    (phase === 'finished' || (phase === 'playing' && config.analysis !== 'off'));

  // ------------------ Effects ------------------

  // Tự động lưu ván cờ + trạng thái vào localStorage
  useEffect(() => {
    saveGame({
      initialFen,
      movesUci: moves.map((m) => m.uci),
      currentPly,
      playerColor,
      boardTheme,
      phase,
      config,
      players,
      gameOver,
    });
  }, [initialFen, moves, currentPly, playerColor, boardTheme, phase, config, players, gameOver]);

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const availH = rect.height - 64; // trừ 2 PlayerCard + gap
      // Bar 2 bên rộng 28% board mỗi bar -> giải B * (1 + 0.56) <= W - gap/padding
      const availW = (rect.width - 60) / 1.56;
      const optimal = Math.max(280, Math.floor(Math.min(availW, availH)));
      setBoardSize(optimal);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

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

  // Phân tích live — chỉ chạy khi được phép theo chế độ chơi + phase
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!analysisEnabled) {
      setAnalysis(null);
      setIsAnalyzing(false);
      return;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsAnalyzing(true);
    analyzePosition(currentFen, depth, multipv, controller.signal)
      .then((res) => {
        setAnalysis(res);
        setIsAnalyzing(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setIsAnalyzing(false);
        }
      });

    return () => controller.abort();
  }, [currentFen, depth, multipv, activeTab, analysisEnabled]);

  // Phát hiện kết thúc ván
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
    (fromSq: string, toSq: string, promotion: string = 'q'): boolean => {
      if (phase !== 'playing') return false;

      let baseMoves = moves;
      let baseFen = currentFen;
      if (currentPly < moves.length) {
        baseMoves = moves.slice(0, currentPly);
        baseFen = currentPly === 0 ? initialFen : baseMoves[currentPly - 1].fenAfter;
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

      // Chỉ chấm điểm nước ngay khi mức phân tích cho phép
      if (visibility.classifyLive) {
        classifySingleMove({
          fen_before: baseFen,
          move_uci: uci,
          depth: 11,
        })
          .then((cls) => {
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
                      color: cls.color,
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
    [moves, currentPly, currentFen, initialFen, phase, visibility.classifyLive, pushToast]
  );

  /**
   * Thực hiện nước đi với kiểm tra phong cấp: nếu tốt tới hàng cuối,
   * mở hộp thoại chọn quân thay vì mặc định phong Hậu.
   */
  const tryMove = useCallback(
    (fromSq: string, toSq: string): boolean => {
      if (phase !== 'playing') return false;
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
    [chessInstance, executeMove, phase]
  );

  // ------------------ AI ------------------

  const triggerAiMove = useCallback(
    async (fenToPlay: string) => {
      if (!aiPlayer?.ai) return;
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
    [aiPlayer, executeMove, pushToast]
  );

  // AI tự đi khi tới lượt (chỉ khi ván đang chơi)
  useEffect(() => {
    if (activeTab !== 'play') return;
    if (phase !== 'playing') return;
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
    activeTab,
    phase,
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

    if (isAiThinking) return false;
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

    if (isAiThinking) return;

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
    if (
      phase === 'playing' &&
      pieceOnSq &&
      pieceOnSq.color === chessInstance.turn()
    ) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  };

  const customArrows: Arrow[] = React.useMemo(() => {
    const out: Arrow[] = [];
    if (
      activeTab !== 'editor' &&
      showArrows &&
      visibility.arrows &&
      analysis?.lines
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
  }, [activeTab, showArrows, visibility.arrows, analysis, hintArrow]);

  const customSquareStyles = React.useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (activeTab === 'editor') return styles;

    // Highlight nước đi vừa thực hiện kèm màu phân loại (Best/Mistake/Blunder)
    if (currentPly > 0 && moves[currentPly - 1]) {
      const last = moves[currentPly - 1];
      styles[last.from] = { backgroundColor: 'rgba(180, 165, 115, 0.34)' };
      styles[last.to] = {
        backgroundColor: last.color
          ? `${last.color}48`
          : 'rgba(180, 165, 115, 0.48)',
      };
    }

    // Highlight ô đang chọn và các chấm gợi ý nước đi hợp lệ
    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: 'rgba(90, 125, 105, 0.45)',
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
              ? 'radial-gradient(circle, transparent 60%, rgba(30, 35, 32, 0.42) 64%)'
              : 'radial-gradient(circle, rgba(30, 35, 32, 0.36) 19%, transparent 21%)',
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
              backgroundColor: 'rgba(190, 65, 65, 0.6)',
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
    setReviewResult(null);
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
    if (phase === 'playing' && moves.length > 0) {
      if (
        !window.confirm(
          'Về màn hình chuẩn bị? Ván hiện tại sẽ dừng lại (các nước đã đi vẫn được giữ).'
        )
      )
        return;
    }
    setPhase('setup');
    setGameOver(null);
    setShowPreMatch(true);
  };

  const handleNewGame = () => {
    setInitialFen(STARTING_FEN);
    setMoves([]);
    setCurrentPly(0);
    setReviewResult(null);
    setGameOver(null);
    setSelectedSquare(null);
    setPendingPromo(null);
    setPhase('setup');
    setShowPreMatch(true);
    clearSavedGame();
  };

  const handleRematch = () => {
    setPlayers({ w: players.b, b: players.w });
    const nextColor = playerColor === 'w' ? 'b' : 'w';
    setPlayerColor(nextColor);
    setBoardOrientation(nextColor === 'w' ? 'white' : 'black');
    setMoves([]);
    setCurrentPly(0);
    setReviewResult(null);
    setGameOver(null);
    setSelectedSquare(null);
    setPendingPromo(null);
    setShowGameOver(false);
    setPhase('playing');
  };

  const handleResign = () => {
    if (phase !== 'playing') return;
    const resigning: 'w' | 'b' =
      config.opponent === 'ai' ? playerColor : chessInstance.turn();
    const name = players[resigning].name;
    if (!window.confirm(`${name} đầu hàng?`)) return;
    const winner = resigning === 'w' ? 'b' : 'w';
    setGameOver({
      result: winner === 'w' ? '1-0' : '0-1',
      reason: 'Đầu hàng',
      winner,
    });
    setPhase('finished');
    setShowGameOver(true);
  };

  const handleTakeback = () => {
    if (!visibility.takeback || moves.length === 0) return;
    const stepsBack =
      config.opponent === 'ai' &&
      chessInstance.turn() === playerColor &&
      moves.length >= 2
        ? 2
        : 1;
    const targetLen = Math.max(0, moves.length - stepsBack);
    setMoves((prev) => prev.slice(0, targetLen));
    setCurrentPly(targetLen);
  };

  const canHint =
    visibility.hints &&
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

  const handleRunGameReview = async () => {
    if (moves.length === 0) return;
    setIsReviewing(true);
    setReviewProgress({ done: 0, total: moves.length });
    try {
      const start = await startGameReview({
        initial_fen: initialFen,
        moves_uci: moves.map((m) => m.uci),
        depth: 11,
      });

      let result = null;
      for (;;) {
        await new Promise((r) => setTimeout(r, 500));
        const job = await getReviewJob(start.job_id);
        setReviewProgress(job.progress);
        if (job.status === 'done' && job.result) {
          result = job.result;
          break;
        }
        if (job.status === 'error') {
          throw new Error(job.error || 'Lỗi không xác định khi review');
        }
      }

      const res = result;
      setReviewResult(res);
      setMoves((prev) =>
        prev.map((m) => {
          const reviewed = res.moves.find((rm) => rm.ply === m.ply);
          if (!reviewed) return m;
          return {
            ...m,
            cp: reviewed.cp,
            mate: reviewed.mate,
            winPercentWhite: reviewed.win_percent_white,
            classification: reviewed.classification,
            symbol: reviewed.symbol,
            color: reviewed.color,
            bestMoveUci: reviewed.best_move_uci,
            bestMoveSan: reviewed.best_move_san,
            accuracy: reviewed.accuracy,
            winLoss: reviewed.win_loss,
          };
        })
      );
    } catch (err) {
      console.error('Lỗi Game Review:', err);
      pushToast(
        `Game Review thất bại: ${
          err instanceof Error ? err.message : 'lỗi không xác định'
        }`,
        'error'
      );
    } finally {
      setIsReviewing(false);
      setReviewProgress(null);
    }
  };

  const handleOpenReview = async (runIfNeeded = false) => {
    setReviewMode(true);
    setShowGameOver(false);
    if (runIfNeeded && moves.length > 0 && !reviewResult && !isReviewing) {
      await handleRunGameReview();
    }
  };

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
    const finish = () => {
      setPhase('setup');
      setGameOver(null);
      setReviewResult(null);
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

    setInitialFen(fen);
    setMoves([]);
    setCurrentPly(0);
    setEditorBoardMap(fenToBoardMap(fen));
    finish();
  };

  // ------------------ Render ------------------

  const displayedPosition =
    activeTab === 'editor'
      ? `${boardMapToFenPlacement(editorBoardMap)} w KQkq - 0 1`
      : currentFen;

  const themeColors = BOARD_THEMES[boardTheme];

  const topSide = boardOrientation === 'white' ? 'b' : 'w';
  const bottomSide = boardOrientation === 'white' ? 'w' : 'b';

  const playerCardProps = (side: 'w' | 'b') => ({
    player: players[side],
    side,
    isTurn: phase === 'playing' && chessInstance.turn() === side,
    isThinking: isAiThinking && aiPlayer === players[side],
  });

  const capturedBarProps = (side: 'w' | 'b', dock: 'bottom' | 'top') => ({
    side,
    symbols: side === 'w' ? material.capturedByWhite : material.capturedByBlack,
    diff: side === 'w' ? material.diff : -material.diff,
    boardSize,
    dock,
  });

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0c0c0e] text-zinc-200 flex flex-col select-none">
      {/* Top Bar tối giản */}
      <header className="h-11 shrink-0 border-b border-zinc-800/80 bg-[#111114] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold tracking-wide uppercase text-zinc-100">
            TheChess
          </span>

          <span className="text-zinc-400">/</span>

          <div className="flex items-center gap-2 truncate">
            <span
              className={`w-2 h-2 rounded-full shrink-0 border ${
                chessInstance.turn() === 'w'
                  ? 'bg-zinc-100 border-zinc-300'
                  : 'bg-zinc-700 border-zinc-500'
              }`}
            />
            <span className="text-xs text-zinc-400 truncate">
              {activeTab === 'editor'
                ? 'Thiết lập thế cờ tùy chỉnh'
                : phase === 'setup'
                ? 'Chuẩn bị ván đấu'
                : chessInstance.isCheckmate()
                ? `Chiếu hết · ${chessInstance.turn() === 'w' ? 'Đen' : 'Trắng'} thắng`
                : chessInstance.isDraw()
                ? 'Ván cờ hòa'
                : `Lượt ${chessInstance.turn() === 'w' ? 'Trắng' : 'Đen'}${
                    chessInstance.inCheck() ? ' · Chiếu!' : ''
                  }`}
            </span>
          </div>
        </div>

        {/* Cụm công cụ phải tối giản */}
        <div className="flex items-center gap-2 shrink-0">
          {status?.stockfish_ready && (
            <span className="hidden md:inline-block text-[11px] font-mono text-zinc-400 mr-1">
              {modeLabel}
              {phase === 'playing'
                ? ` · ${ANALYSIS_LEVEL_LABELS[config.analysis].label}`
                : ''}
            </span>
          )}

          {/* Đổi màu bàn cờ dịu mắt */}
          <select
            value={boardTheme}
            onChange={(e) => setBoardTheme(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-800/90 rounded px-2 py-1 text-[11px] text-zinc-400 focus:outline-none cursor-pointer"
            title="Chất liệu bàn cờ"
          >
            <option value="stone">Bàn cờ: Đá trầm</option>
            <option value="wood">Bàn cờ: Gỗ cổ điển</option>
            <option value="graphite">Bàn cờ: Xám chì</option>
          </select>

          {status?.presets && (
            <select
              onChange={(e) => {
                const p: PresetPosition | undefined = status.presets.find(
                  (item) => item.id === e.target.value
                );
                if (p) handleApplyCustomPosition(p.fen);
              }}
              defaultValue="standard"
              className="bg-zinc-950 border border-zinc-800/90 rounded px-2.5 py-1 text-[11px] text-zinc-300 focus:outline-none cursor-pointer max-w-[190px] truncate"
            >
              {status.presets.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-200">
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <div className="inline-flex bg-zinc-950 p-0.5 rounded border border-zinc-800/90">
            <button
              onClick={() => setActiveTab('play')}
              className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
                activeTab === 'play'
                  ? 'bg-zinc-200 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Bàn đấu
            </button>
            <button
              onClick={() => {
                setEditorBoardMap(fenToBoardMap(currentFen));
                setActiveTab('editor');
              }}
              className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-zinc-200 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Xếp cờ
            </button>
          </div>
        </div>
      </header>

      {/* Cảnh báo khi không kết nối được backend */}
      {backendError && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[11px] px-4 py-1.5">
          ⚠ {backendError}
        </div>
      )}

      {/* Bố cục chính không cuộn */}
      <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row overflow-hidden">
        {/* Vùng bàn cờ trung tâm */}
        <div
          ref={boardStageRef}
          className="relative flex-1 min-w-0 min-h-0 h-full bg-[#0c0c0e] flex items-center justify-center p-4 overflow-hidden"
        >
          {activeTab === 'play' && (
            /* 3 cột: bar quân bắt trái (đáy) · cột giữa (tên + bàn + tên) · bar phải (đỉnh) */
            <div className="flex items-center gap-3">
              <CapturedBar {...capturedBarProps(bottomSide, 'bottom')} />

              <div className="flex flex-col items-center gap-1.5">
                {/* Trên: thẻ người chơi của bên ở trên bàn */}
                <div style={{ width: boardSize }}>
                  <PlayerCard {...playerCardProps(topSide)} />
                </div>

              <div
                style={{ width: boardSize, height: boardSize }}
                className="relative rounded-sm overflow-hidden shadow-2xl border border-zinc-800/90 shrink-0"
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

                  {/* Overlay khi ván chưa bắt đầu */}
                  {phase === 'setup' && !showPreMatch && (
                    <div className="absolute inset-0 z-10 bg-black/45 flex items-center justify-center">
                      <button
                        onClick={() => setShowPreMatch(true)}
                        className="px-4 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold shadow-2xl transition cursor-pointer"
                      >
                        ⚙ Chuẩn bị &amp; Bắt đầu ván đấu
                      </button>
                    </div>
                  )}

                  {/* Nút mở lại tổng kết sau khi đóng modal */}
                  {phase === 'finished' && !showGameOver && !reviewMode && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                      <button
                        onClick={() => setShowGameOver(true)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-100/95 hover:bg-white text-zinc-950 text-[11px] font-semibold shadow-2xl transition cursor-pointer"
                      >
                        🏆 Xem tổng kết ván đấu
                      </button>
                    </div>
                  )}
                </div>

                {/* Dưới: thẻ người chơi của bên ở dưới bàn */}
                <div style={{ width: boardSize }}>
                  <PlayerCard {...playerCardProps(bottomSide)} />
                </div>
              </div>

              <CapturedBar {...capturedBarProps(topSide, 'top')} />
            </div>
          )}

          {activeTab === 'editor' && (
            <div
              style={{ width: boardSize, height: boardSize }}
              className="relative rounded-sm overflow-hidden shadow-2xl border border-zinc-800/90 shrink-0"
            >
              <Chessboard
                id="TheChessStudioBoard"
                boardWidth={boardSize}
                position={displayedPosition}
                boardOrientation={boardOrientation}
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                customDarkSquareStyle={{ backgroundColor: themeColors.dark }}
                customLightSquareStyle={{ backgroundColor: themeColors.light }}
                animationDuration={160}
              />
            </div>
          )}
        </div>

        {/* Cột công cụ bên phải */}
        <aside className="w-full md:w-[460px] xl:w-[540px] shrink-0 h-full border-l border-zinc-800/80 bg-[#111114] flex flex-col overflow-hidden">
          {activeTab === 'editor' ? (
            <BoardEditor
              boardMap={editorBoardMap}
              onUpdateBoardMap={setEditorBoardMap}
              selectedTool={editorTool}
              onSelectTool={setEditorTool}
              presets={status?.presets || []}
              onApplyPosition={handleApplyCustomPosition}
            />
          ) : reviewMode ? (
            <>
              <ReviewScreen
                onClose={() => setReviewMode(false)}
                moves={moves}
                currentPly={currentPly}
                onSelectPly={(ply) => setCurrentPly(ply)}
                reviewResult={reviewResult}
                isReviewing={isReviewing}
                reviewProgress={reviewProgress}
                onRunReview={handleRunGameReview}
              />

              <EvalGraph
                moves={moves}
                currentPly={currentPly}
                onSelectPly={(ply) => setCurrentPly(ply)}
                reviewResult={reviewResult}
                isReviewing={isReviewing}
                embedded
              />
            </>
          ) : (
            <>
              <EnginePanel
                phase={phase}
                config={config}
                visibility={visibility}
                modeLabel={modeLabel}
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
                onSelectPly={(ply) => setCurrentPly(ply)}
                onTakeback={handleTakeback}
                onExportPgn={handleExportPgn}
                onBranchFromHere={() => {
                  setMoves((prev) => prev.slice(0, currentPly));
                }}
                onFlipBoard={() =>
                  setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))
                }
                onSwitchSides={() => {
                  const nextColor = playerColor === 'w' ? 'b' : 'w';
                  setPlayerColor(nextColor);
                  setBoardOrientation(nextColor === 'w' ? 'white' : 'black');
                }}
                onNewGame={handleNewGame}
              />

              {(phase !== 'playing' || config.analysis === 'full') && (
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

      {/* Màn chuẩn bị ván đấu */}
      {activeTab === 'play' && (
        <PreMatchDialog
          open={showPreMatch && phase === 'setup'}
          config={config}
          players={players}
          playerColor={playerColor}
          hasMoves={moves.length > 0}
          onChangeConfig={setConfig}
          onChangePlayers={setPlayers}
          onChangePlayerColor={(c) => {
            setPlayerColor(c);
            setBoardOrientation(c === 'w' ? 'white' : 'black');
          }}
          onStart={handleStartGame}
          onClose={() => setShowPreMatch(false)}
        />
      )}

      {/* Modal kết thúc ván đấu */}
      <GameOverDialog
        open={showGameOver && !!gameOver}
        gameOver={gameOver}
        players={players}
        accuracy={
          reviewResult
            ? { w: reviewResult.white_accuracy, b: reviewResult.black_accuracy }
            : null
        }
        onNewGame={handleNewGame}
        onRematch={handleRematch}
        onAnalyze={() => handleOpenReview(true)}
        onExportPgn={handleExportPgn}
        onClose={() => setShowGameOver(false)}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
