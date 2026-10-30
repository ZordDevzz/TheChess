import React from 'react';
import { FeatureVisibility, GamePhase, MoveRecord } from '../types';
import { CLASSIFICATION_META } from '../theme/semantic';
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
  visibility: FeatureVisibility;
  onSelectPly: (ply: number) => void;
  onTakeback: () => void;
  onExportPgn: () => void;
  onBranchFromHere: () => void;
  onFlipBoard: () => void;
  onNewGame: () => void;
  onSwitchSides: () => void;
}

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  currentPly,
  phase,
  canTakeback,
  visibility,
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
    <div className="flex-1 min-h-0 flex flex-col border-b border-line bg-panel p-3.5 gap-2.5">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2 truncate" title="←/→: tua nước · Home/End: về đầu/cuối">
          Biên bản & Đánh giá nước đi ({moves.length})
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onExportPgn}
            disabled={moves.length === 0}
            className="px-2 py-0.5 rounded bg-inset hover:bg-card disabled:opacity-30 disabled:hover:bg-card border border-line text-xs text-ink-2 flex items-center gap-1 transition cursor-pointer"
            title="Xuất ván cờ ra file PGN"
          >
            <Download className="w-3 h-3 text-ink-2" />
            PGN
          </button>
          <button
            onClick={onFlipBoard}
            className="px-2 py-0.5 rounded bg-inset hover:bg-card border border-line text-xs text-ink-2 flex items-center gap-1 transition cursor-pointer"
            title="Xoay bàn cờ"
          >
            <FlipHorizontal className="w-3 h-3 text-ink-2" />
            Xoay
          </button>
          {visibility.switchSides && (
            <button
              onClick={onSwitchSides}
              className="px-2 py-0.5 rounded bg-inset hover:bg-card border border-line text-xs text-ink-2 flex items-center gap-1 transition cursor-pointer"
              title="Đổi bên với AI"
            >
              <RefreshCw className="w-3 h-3 text-ink-2" />
              Đổi bên
            </button>
          )}
          {visibility.newGame && (
            <button
              onClick={onNewGame}
              className="px-2 py-0.5 rounded bg-inset hover:bg-card border border-line text-xs text-ink-2 flex items-center gap-1 transition cursor-pointer"
              title="Ván mới (ván online: về Sảnh)"
            >
              <RotateCcw className="w-3 h-3 text-ink-2" />
              Ván mới
            </button>
          )}
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
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-accent-ink shrink-0"
              style={{ backgroundColor: currentMeta.color }}
            >
              {currentMove.symbol}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-ink">
                  {currentMove.moveNumber}
                  {currentMove.turn === 'w' ? '.' : '...'} {currentMove.san}
                </span>
                <span className="font-semibold" style={{ color: currentMeta.color }}>
                  {currentMeta.viLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-ink-2 mt-0.5 font-mono">
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
                  <span className="text-ink-2">· Độ chuẩn {currentMove.accuracy}%</span>
                )}
              </div>
            </div>
          </div>

          {currentMove.bestMoveSan &&
            currentMove.bestMoveUci !== currentMove.uci &&
            currentMove.classification !== 'Best' && (
              <div className="text-right shrink-0">
                <div className="text-[11px] text-ink-2">Nước tối ưu</div>
                <div className="text-xs font-mono font-bold text-emerald-400">
                  {currentMove.bestMoveSan}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Bảng PGN cuộn nội bộ có chỉ báo màu từng nước */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded border border-line bg-inset divide-y divide-line">
        {pairs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-ink-2 px-4 text-center">
            Chưa có nước đi.
          </div>
        ) : (
          pairs.map((pair) => (
            <div
              key={pair.moveNumber}
              className="grid grid-cols-7 items-center text-xs py-1 px-2.5 hover:bg-card"
            >
              <span className="col-span-1 text-ink-2 font-mono text-xs tabular-nums">
                {pair.moveNumber}.
              </span>

              {pair.white ? (
                <button
                  onClick={() => onSelectPly(pair.white!.ply)}
                  className={`col-span-3 text-left px-2 py-0.5 rounded font-mono text-xs flex items-center justify-between transition cursor-pointer ${
                    currentPly === pair.white.ply
                      ? 'bg-card text-ink font-semibold ring-1 ring-line-strong'
                      : 'text-ink-2 hover:bg-card'
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
                      ? 'bg-card text-ink font-semibold ring-1 ring-line-strong'
                      : 'text-ink-2 hover:bg-card'
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
            className="p-1.5 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 cursor-pointer"
            title="Về đầu trận"
          >
            <ChevronFirst className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
            disabled={currentPly === 0}
            className="p-1.5 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 cursor-pointer"
            title="Lùi 1 nước"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectPly(Math.min(moves.length, currentPly + 1))}
            disabled={currentPly >= moves.length}
            className="p-1.5 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 cursor-pointer"
            title="Tiến 1 nước"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSelectPly(moves.length)}
            disabled={currentPly >= moves.length}
            className="p-1.5 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 cursor-pointer"
            title="Tới nước cuối"
          >
            <ChevronLast className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {visibility.branchFromHere && phase === 'playing' && currentPly < moves.length && (
            <button
              onClick={onBranchFromHere}
              className="px-2.5 py-1 rounded bg-accent hover:opacity-90 text-accent-ink text-xs font-medium flex items-center gap-1 transition cursor-pointer"
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
            className="px-2.5 py-1 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 text-xs flex items-center gap-1 transition cursor-pointer"
          >
            <Undo2 className="w-3 h-3" />
            Đi lại
          </button>
        </div>
      </div>
    </div>
  );
};
