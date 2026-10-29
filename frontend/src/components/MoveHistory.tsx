import React from 'react';
import { GamePhase, MoveRecord } from '../types';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  GitBranch,
  Undo2,
  FlipHorizontal,
  RotateCcw,
  RefreshCw,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';

interface MoveHistoryProps {
  moves: MoveRecord[];
  currentPly: number;
  phase: GamePhase;
  canTakeback: boolean;
  onSelectPly: (ply: number) => void;
  onTakeback: () => void;
  onExportPgn: () => void;
  onBranchFromHere: () => void;
  onFlipBoard: () => void;
  onNewGame: () => void;
  onSwitchSides: () => void;
}

const CLASSIFICATION_META: Record<
  string,
  { viLabel: string; color: string; bg: string; border: string }
> = {
  Best: {
    viLabel: 'Tốt nhất (Best)',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
  },
  Excellent: {
    viLabel: 'Xuất sắc (Excellent)',
    color: '#2dd4bf',
    bg: 'rgba(45, 212, 191, 0.1)',
    border: 'rgba(45, 212, 191, 0.3)',
  },
  Good: {
    viLabel: 'Hợp lý (Good)',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.1)',
    border: 'rgba(96, 165, 250, 0.25)',
  },
  Inaccuracy: {
    viLabel: 'Chưa chuẩn (Inaccuracy)',
    color: '#facc15',
    bg: 'rgba(250, 204, 21, 0.12)',
    border: 'rgba(250, 204, 21, 0.35)',
  },
  Mistake: {
    viLabel: 'Sai lầm (Mistake)',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.35)',
  },
  Blunder: {
    viLabel: 'Nước ngớ ngẩn (Blunder)',
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.14)',
    border: 'rgba(248, 113, 113, 0.4)',
  },
};

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  currentPly,
  phase,
  canTakeback,
  onSelectPly,
  onTakeback,
  onExportPgn,
  onBranchFromHere,
  onFlipBoard,
  onNewGame,
  onSwitchSides,
}) => {
  const pairs: Array<{
    moveNumber: number;
    white?: MoveRecord;
    black?: MoveRecord;
  }> = [];

  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  const currentMove = currentPly > 0 ? moves[currentPly - 1] : null;
  const currentMeta =
    currentMove?.classification
      ? CLASSIFICATION_META[currentMove.classification]
      : null;

  const renderMoveBadge = (m: MoveRecord) => {
    if (!m.classification) return null;
    const meta = CLASSIFICATION_META[m.classification];
    if (!meta) return null;
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[11px] font-mono font-semibold"
        style={{
          color: meta.color,
          backgroundColor: meta.bg,
        }}
        title={`${meta.viLabel}${
          m.winLoss !== undefined && m.winLoss > 0 ? ` (-${m.winLoss}% Win)` : ''
        }`}
      >
        <span>{m.symbol}</span>
        {m.winLoss !== undefined && m.winLoss >= 4.5 && (
          <span className="text-[10px] opacity-90">-{m.winLoss.toFixed(0)}%</span>
        )}
      </span>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col border-b border-zinc-800/80 bg-[#0e0e11] p-3.5 gap-2.5">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-400 truncate" title="←/→: tua nước · Home/End: về đầu/cuối">
          Biên bản & Đánh giá nước đi ({moves.length})
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onExportPgn}
            disabled={moves.length === 0}
            className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-zinc-900 border border-zinc-800/90 text-xs text-zinc-300 flex items-center gap-1 transition cursor-pointer"
            title="Xuất ván cờ ra file PGN"
          >
            <Download className="w-3 h-3 text-zinc-400" />
            PGN
          </button>
          <button
            onClick={onFlipBoard}
            className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/90 text-xs text-zinc-300 flex items-center gap-1 transition cursor-pointer"
            title="Xoay bàn cờ"
          >
            <FlipHorizontal className="w-3 h-3 text-zinc-400" />
            Xoay
          </button>
          <button
            onClick={onSwitchSides}
            className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/90 text-xs text-zinc-300 flex items-center gap-1 transition cursor-pointer"
            title="Đổi bên với AI"
          >
            <RefreshCw className="w-3 h-3 text-zinc-400" />
            Đổi bên
          </button>
          <button
            onClick={onNewGame}
            className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/90 text-xs text-zinc-300 flex items-center gap-1 transition cursor-pointer"
            title="Về màn chuẩn bị & bắt đầu ván mới"
          >
            <RotateCcw className="w-3 h-3 text-zinc-400" />
            Ván mới
          </button>
        </div>
      </div>

      {/* Thẻ phân tích chi tiết nước đi đang chọn: Phân loại + Chỉ số Gain/Loss + Nước tối ưu */}
      {currentMove && currentMeta && (
        <div
          className="shrink-0 rounded-md px-3 py-2 flex items-center justify-between gap-2 text-xs border"
          style={{
            backgroundColor: currentMeta.bg,
            borderColor: currentMeta.border,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-zinc-950 shrink-0"
              style={{ backgroundColor: currentMeta.color }}
            >
              {currentMove.symbol}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-white">
                  {currentMove.moveNumber}
                  {currentMove.turn === 'w' ? '.' : '...'} {currentMove.san}
                </span>
                <span className="font-semibold" style={{ color: currentMeta.color }}>
                  {currentMeta.viLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-300 mt-0.5 font-mono">
                {currentMove.winLoss !== undefined && currentMove.winLoss > 1.0 ? (
                  <span className="flex items-center gap-0.5 text-rose-300">
                    <TrendingDown className="w-3 h-3" />
                    Mất {currentMove.winLoss.toFixed(1)}% cơ hội thắng
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    Giữ trọn ưu thế
                  </span>
                )}
                {currentMove.accuracy !== undefined && (
                  <span className="text-zinc-400">· Độ chuẩn {currentMove.accuracy}%</span>
                )}
              </div>
            </div>
          </div>

          {currentMove.bestMoveSan &&
            currentMove.bestMoveUci !== currentMove.uci &&
            currentMove.classification !== 'Best' && (
              <div className="text-right shrink-0">
                <div className="text-[11px] text-zinc-400">Nước tối ưu</div>
                <div className="text-xs font-mono font-bold text-emerald-400">
                  {currentMove.bestMoveSan}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Bảng PGN cuộn nội bộ có chỉ báo màu từng nước */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded border border-zinc-800/60 bg-[#0b0b0d] divide-y divide-zinc-900/60">
        {pairs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-zinc-400 px-4 text-center">
            Chưa có nước đi.
          </div>
        ) : (
          pairs.map((pair) => (
            <div
              key={pair.moveNumber}
              className="grid grid-cols-7 items-center text-xs py-1 px-2.5 hover:bg-zinc-900/40"
            >
              <span className="col-span-1 text-zinc-400 font-mono text-xs tabular-nums">
                {pair.moveNumber}.
              </span>

              {pair.white ? (
                <button
                  onClick={() => onSelectPly(pair.white!.ply)}
                  className={`col-span-3 text-left px-2 py-0.5 rounded font-mono text-xs flex items-center justify-between transition cursor-pointer ${
                    currentPly === pair.white.ply
                      ? 'bg-zinc-800 text-zinc-100 font-semibold ring-1 ring-zinc-600'
                      : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <span>{pair.white.san}</span>
                  {renderMoveBadge(pair.white)}
                </button>
              ) : (
                <span className="col-span-3" />
              )}

              {pair.black ? (
                <button
                  onClick={() => onSelectPly(pair.black!.ply)}
                  className={`col-span-3 text-left px-2 py-0.5 rounded font-mono text-xs flex items-center justify-between transition cursor-pointer ${
                    currentPly === pair.black.ply
                      ? 'bg-zinc-800 text-zinc-100 font-semibold ring-1 ring-zinc-600'
                      : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <span>{pair.black.san}</span>
                  {renderMoveBadge(pair.black)}
                </button>
              ) : (
                <span className="col-span-3" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Thanh điều hướng dưới cùng */}
      <div className="shrink-0 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectPly(0)}
            disabled={currentPly === 0}
            className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800/80 text-zinc-300 cursor-pointer"
            title="Về đầu trận"
          >
            <ChevronFirst className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
            disabled={currentPly === 0}
            className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800/80 text-zinc-300 cursor-pointer"
            title="Lùi 1 nước"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectPly(Math.min(moves.length, currentPly + 1))}
            disabled={currentPly >= moves.length}
            className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800/80 text-zinc-300 cursor-pointer"
            title="Tiến 1 nước"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectPly(moves.length)}
            disabled={currentPly >= moves.length}
            className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800/80 text-zinc-300 cursor-pointer"
            title="Tới nước cuối"
          >
            <ChevronLast className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {phase === 'playing' && currentPly < moves.length && (
            <button
              onClick={onBranchFromHere}
              className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Cắt nhánh và đánh tiếp từ bước này"
            >
              <GitBranch className="w-3 h-3" />
              Đánh từ #{currentPly}
            </button>
          )}
          <button
            onClick={onTakeback}
            disabled={moves.length === 0 || !canTakeback}
            title={
              canTakeback
                ? 'Đi lại nước vừa đi'
                : 'Đi lại bị tắt ở chế độ chơi này'
            }
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800/80 text-zinc-300 text-xs flex items-center gap-1 transition cursor-pointer"
          >
            <Undo2 className="w-3 h-3" />
            Đi lại
          </button>
        </div>
      </div>
    </div>
  );
};
