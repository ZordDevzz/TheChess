import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  GameReviewResult,
  MoveRecord,
  PresetPosition,
} from './types';
import { EvalBar } from './components/EvalBar';
import { EnginePanel, PlayMode } from './components/EnginePanel';
import { MoveHistory } from './components/MoveHistory';
import { EvalGraph } from './components/EvalGraph';
import { Toasts, useToasts } from './components/Toasts';
import { PromotionDialog } from './components/PromotionDialog';
import {
  STARTING_FEN,
  buildPgn,
  clearSavedGame,
  downloadPgn,
  loadSavedGame,
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

  const [playMode, setPlayMode] = useState<PlayMode>('vs_ai');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>(
    SAVED_GAME?.playerColor ?? 'w'
  );
  const [aiEngine, setAiEngine] = useState<'maia' | 'stockfish'>('maia');
  const [aiElo, setAiElo] = useState<number>(1500);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [lastEngineUsed, setLastEngineUsed] = useState<string>('Maia 1500');

  const [showEval, setShowEval] = useState<boolean>(true);
  const [showArrows, setShowArrows] = useState<boolean>(true);
  const [multipv, setMultipv] = useState<number>(3);
  const [depth, setDepth] = useState<number>(15);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const [reviewResult, setReviewResult] = useState<GameReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);

  const [editorBoardMap, setEditorBoardMap] = useState<Record<string, string>>(() =>
    fenToBoardMap(STARTING_FEN)
  );
  const [editorTool, setEditorTool] = useState<EditorTool>('wQ');

  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState<number>(560);

  const { toasts, pushToast, dismissToast } = useToasts();

  // Tự động lưu ván cờ + thiết lập cơ bản vào localStorage
  useEffect(() => {
    saveGame({
      initialFen,
      movesUci: moves.map((m) => m.uci),
      currentPly,
      playerColor,
      boardTheme,
    });
  }, [initialFen, moves, currentPly, playerColor, boardTheme]);

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const availW = rect.width - 56;
      const availH = rect.height - 32;
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

  const currentFen =
    currentPly === 0 ? initialFen : moves[currentPly - 1]?.fenAfter || initialFen;

  const chessInstance = React.useMemo(() => {
    try {
      return new Chess(currentFen);
    } catch {
      return new Chess();
    }
  }, [currentFen]);

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

  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (activeTab === 'editor') return;
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
  }, [currentFen, depth, multipv, activeTab]);

  const executeMove = useCallback(
    (fromSq: string, toSq: string, promotion: string = 'q'): boolean => {
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
          pushToast('Không chấm điểm được nước vừa đi (engine đang bận).', 'error');
        });

      return true;
    },
    [moves, currentPly, currentFen, initialFen, pushToast]
  );

  /**
   * Thực hiện nước đi với kiểm tra phong cấp: nếu tốt tới hàng cuối,
   * mở hộp thoại chọn quân thay vì mặc định phong Hậu.
   */
  const tryMove = useCallback(
    (fromSq: string, toSq: string): boolean => {
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
    [chessInstance, executeMove]
  );

  const triggerAiMove = useCallback(
    async (fenToPlay: string) => {
      const checkGame = new Chess(fenToPlay);
      if (checkGame.isGameOver()) return;

      setIsAiThinking(true);
      try {
        const res = await requestAIMove({
          fen: fenToPlay,
          engine_type: aiEngine,
          elo: aiElo,
          move_time: 0.45,
        });
        setLastEngineUsed(res.engine_used);
        const promo = res.move_uci.length > 4 ? res.move_uci[4] : 'q';
        executeMove(res.from_square, res.to_square, promo);
      } catch (err) {
        console.error('Lỗi AI move:', err);
        pushToast(
          `AI không đi được nước này: ${err instanceof Error ? err.message : 'lỗi không xác định'}`,
          'error'
        );
      } finally {
        setIsAiThinking(false);
      }
    },
    [aiEngine, aiElo, executeMove, pushToast]
  );

  useEffect(() => {
    if (activeTab !== 'play') return;
    if (playMode !== 'vs_ai') return;
    if (isAiThinking) return;
    if (currentPly !== moves.length) return;

    let g: Chess;
    try {
      g = new Chess(currentFen);
    } catch {
      return;
    }
    if (g.isGameOver()) return;

    const currentTurn = g.turn();
    if (currentTurn !== playerColor) {
      const timer = setTimeout(() => {
        triggerAiMove(currentFen);
      }, 260);
      return () => clearTimeout(timer);
    }
  }, [
    activeTab,
    playMode,
    playerColor,
    currentFen,
    currentPly,
    moves.length,
    isAiThinking,
    triggerAiMove,
  ]);

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
    if (pieceOnSq && pieceOnSq.color === chessInstance.turn()) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  };

  const customArrows: Arrow[] = React.useMemo(() => {
    if (activeTab === 'editor' || !showArrows || !analysis || !analysis.lines) {
      return [];
    }
    return analysis.lines.map((line, idx) => [
      line.from_square as Square,
      line.to_square as Square,
      ARROW_COLORS[idx] || ARROW_COLORS[0],
    ]);
  }, [activeTab, showArrows, analysis]);

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

  const handleTakeback = () => {
    if (moves.length === 0) return;
    const stepsBack =
      playMode === 'vs_ai' &&
      chessInstance.turn() === playerColor &&
      moves.length >= 2
        ? 2
        : 1;
    const targetLen = Math.max(0, moves.length - stepsBack);
    setMoves((prev) => prev.slice(0, targetLen));
    setCurrentPly(targetLen);
  };

  const handleApplyCustomPosition = (fen: string, pgn?: string) => {
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
        setReviewResult(null);
        setSelectedSquare(null);
        setPendingPromo(null);
        setActiveTab('play');
        return;
      } catch {
        pushToast('PGN không hợp lệ, vui lòng kiểm tra lại cú pháp PGN.', 'error');
        return;
      }
    }

    setInitialFen(fen);
    setMoves([]);
    setCurrentPly(0);
    setReviewResult(null);
    setSelectedSquare(null);
    setPendingPromo(null);
    setEditorBoardMap(fenToBoardMap(fen));
    setActiveTab('play');
  };

  const handleRunGameReview = async () => {
    if (moves.length === 0) return;
    setIsReviewing(true);
    try {
      const start = await startGameReview({
        initial_fen: initialFen,
        moves_uci: moves.map((m) => m.uci),
        depth: 11,
      });

      // Poll tiến độ job đến khi xong
      let result = null;
      for (;;) {
        await new Promise((r) => setTimeout(r, 500));
        const job = await getReviewJob(start.job_id);
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
        `Game Review thất bại: ${err instanceof Error ? err.message : 'lỗi không xác định'}`,
        'error'
      );
    } finally {
      setIsReviewing(false);
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

  const evalCp = analysis?.cp ?? 0;
  const evalMate = analysis?.mate ?? null;
  const evalWinWhite = analysis?.win_percent_white ?? 50;

  const displayedPosition =
    activeTab === 'editor'
      ? `${boardMapToFenPlacement(editorBoardMap)} w KQkq - 0 1`
      : currentFen;

  const themeColors = BOARD_THEMES[boardTheme];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0c0c0e] text-zinc-200 flex flex-col select-none">
      {/* Top Bar tối giản */}
      <header className="h-11 shrink-0 border-b border-zinc-800/80 bg-[#111114] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold tracking-wide uppercase text-zinc-100">
            TheChess
          </span>

          <span className="text-zinc-700">/</span>

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
            <span className="hidden md:inline-block text-[11px] font-mono text-zinc-500 mr-1">
              {playMode === 'vs_ai' ? lastEngineUsed : 'Stockfish 17'}
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
          className="flex-1 min-w-0 min-h-0 h-full bg-[#0c0c0e] flex items-center justify-center gap-3 p-4 overflow-hidden"
        >
          {activeTab === 'play' && (
            <div style={{ height: boardSize }} className="shrink-0">
              <EvalBar
                cp={evalCp}
                mate={evalMate}
                winPercentWhite={evalWinWhite}
                orientation={boardOrientation}
                enabled={showEval}
              />
            </div>
          )}

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
          </div>
        </div>

        {/* Cột công cụ bên phải */}
        <aside className="w-full md:w-[390px] xl:w-[430px] shrink-0 h-full border-l border-zinc-800/80 bg-[#111114] flex flex-col overflow-hidden">
          {activeTab === 'editor' ? (
            <BoardEditor
              boardMap={editorBoardMap}
              onUpdateBoardMap={setEditorBoardMap}
              selectedTool={editorTool}
              onSelectTool={setEditorTool}
              presets={status?.presets || []}
              onApplyPosition={handleApplyCustomPosition}
            />
          ) : (
            <>
              <EnginePanel
                playMode={playMode}
                onChangePlayMode={setPlayMode}
                playerColor={playerColor}
                onChangePlayerColor={(c) => {
                  setPlayerColor(c);
                  setBoardOrientation(c === 'w' ? 'white' : 'black');
                }}
                aiEngine={aiEngine}
                onChangeAiEngine={setAiEngine}
                aiElo={aiElo}
                onChangeAiElo={setAiElo}
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
                    // Nước gợi ý có sẵn quân phong cấp trong UCI
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
                onNewGame={() => {
                  setInitialFen(STARTING_FEN);
                  setMoves([]);
                  setCurrentPly(0);
                  setReviewResult(null);
                  setSelectedSquare(null);
                  setPendingPromo(null);
                  clearSavedGame();
                }}
              />

              <EvalGraph
                moves={moves}
                currentPly={currentPly}
                onSelectPly={(ply) => setCurrentPly(ply)}
                reviewResult={reviewResult}
                isReviewing={isReviewing}
                onRunReview={handleRunGameReview}
              />
            </>
          )}
        </aside>
      </div>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
