import React from 'react';
import { GameReviewResult, MoveRecord } from '../types';

interface EvalGraphProps {
  moves: MoveRecord[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  reviewResult: GameReviewResult | null;
  isReviewing: boolean;
  onRunReview?: () => void;
  onOpenReview?: () => void;
  canReview?: boolean;
  /** Đặt khi nhúng bên trong chế độ phân tích (ẩn các nút trùng lặp) */
  embedded?: boolean;
}

/** Biểu đồ lợi thế + nút chạy/mở màn hình Game Review chi tiết. */
export const EvalGraph: React.FC<EvalGraphProps> = ({
  moves,
  currentPly,
  onSelectPly,
  reviewResult,
  isReviewing,
  onRunReview,
  onOpenReview,
  canReview = true,
  embedded = false,
}) => {
  const width = 460;
  const height = 76;

  const points = [
    { ply: 0, winWhite: 50, classification: undefined, color: undefined },
    ...moves.map((m) => ({
      ply: m.ply,
      winWhite: m.winPercentWhite ?? 50,
      classification: m.classification,
      color: m.color,
    })),
  ];

  const maxPly = Math.max(1, points.length - 1);
  const toX = (ply: number) => (ply / maxPly) * width;
  const toY = (winW: number) => height - 4 - ((winW / 100) * (height - 8));

  const lineCoords = points
    .map((p) => `${toX(p.ply).toFixed(1)},${toY(p.winWhite).toFixed(1)}`)
    .join(' ');
  const areaCoords = `0,${height} ${lineCoords} ${toX(
    points[points.length - 1].ply
  ).toFixed(1)},${height}`;

  return (
    <div className="shrink-0 bg-[#111114] p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
          <span className="font-medium text-zinc-300">Biểu đồ lợi thế</span>
          {reviewResult && (
            <span className="flex items-center gap-2 font-mono text-emerald-400 font-semibold shrink-0">
              <span className="flex items-center gap-1" title="Độ chính xác bên Trắng">
                <span className="w-2.5 h-2.5 rounded-sm bg-zinc-100 border border-zinc-300 inline-block" />
                {reviewResult.white_accuracy}%
              </span>
              <span className="text-zinc-600">·</span>
              <span className="flex items-center gap-1" title="Độ chính xác bên Đen">
                <span className="w-2.5 h-2.5 rounded-sm bg-zinc-800 border border-zinc-600 inline-block" />
                {reviewResult.black_accuracy}%
              </span>
            </span>
          )}
        </div>

        {!embedded && (
          <div className="flex items-center gap-1.5 shrink-0">
            {reviewResult && onOpenReview && (
              <button
                onClick={onOpenReview}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 cursor-pointer"
              >
                Chi tiết
              </button>
            )}
            {onRunReview && (
              <button
                onClick={onRunReview}
                disabled={isReviewing || moves.length === 0 || !canReview}
                title={
                  canReview
                    ? 'Chấm điểm toàn ván bằng engine'
                    : 'Bị tắt khi đang thi đấu (chế độ chơi với máy)'
                }
                className="px-2.5 py-0.5 rounded bg-zinc-200 hover:bg-white disabled:bg-zinc-900 disabled:text-zinc-600 text-xs font-medium text-zinc-950 transition cursor-pointer"
              >
                {isReviewing ? 'Đang chấm...' : 'Game Review'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Biểu đồ có chấm màu định hướng các bước ngoặt */}
      <div className="relative w-full h-16 bg-[#0b0b0d] rounded border border-zinc-800/70 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full cursor-pointer"
          onClick={(e) => {
            if (moves.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const targetPly = Math.round(relX * maxPly);
            onSelectPly(targetPly);
          }}
        >
          <polygon points={areaCoords} fill="rgba(228, 228, 231, 0.16)" />
          <line
            x1={0}
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke="#3f3f46"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <polyline fill="none" stroke="#e4e4e7" strokeWidth={1.8} points={lineCoords} />
          <line
            x1={toX(currentPly)}
            y1={0}
            x2={toX(currentPly)}
            y2={height}
            stroke="#38bdf8"
            strokeWidth={1.8}
          />
          {points.map((p) => {
            if (
              p.classification === 'Blunder' ||
              p.classification === 'Mistake' ||
              p.classification === 'Inaccuracy'
            ) {
              return (
                <circle
                  key={p.ply}
                  cx={toX(p.ply)}
                  cy={toY(p.winWhite)}
                  r={3.8}
                  fill={p.color || '#f87171'}
                  stroke="#09090b"
                  strokeWidth={1}
                />
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
};
