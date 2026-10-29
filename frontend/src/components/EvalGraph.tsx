import React, { useState } from 'react';
import { GameReviewResult, MoveRecord } from '../types';
import { X } from 'lucide-react';

interface EvalGraphProps {
  moves: MoveRecord[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  reviewResult: GameReviewResult | null;
  isReviewing: boolean;
  onRunReview: () => void;
}

const CLASS_ORDER: Array<{
  key: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
  label: string;
  symbol: string;
  color: string;
}> = [
  { key: 'Best', label: 'Tốt nhất (Best)', symbol: '★', color: '#34d399' },
  { key: 'Excellent', label: 'Xuất sắc (Excellent)', symbol: '!', color: '#2dd4bf' },
  { key: 'Good', label: 'Hợp lý (Good)', symbol: '✓', color: '#60a5fa' },
  { key: 'Inaccuracy', label: 'Chưa chuẩn (Inaccuracy)', symbol: '?!', color: '#facc15' },
  { key: 'Mistake', label: 'Sai lầm (Mistake)', symbol: '?', color: '#fb923c' },
  { key: 'Blunder', label: 'Ngớ ngẩn (Blunder)', symbol: '??', color: '#f87171' },
];

export const EvalGraph: React.FC<EvalGraphProps> = ({
  moves,
  currentPly,
  onSelectPly,
  reviewResult,
  isReviewing,
  onRunReview,
}) => {
  const [showReviewModal, setShowReviewModal] = useState(false);
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
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="font-medium text-zinc-300">Biểu đồ lợi thế</span>
          {reviewResult && (
            <span className="font-mono text-emerald-400 font-semibold">
              W {reviewResult.white_accuracy}% · B {reviewResult.black_accuracy}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {reviewResult && (
            <button
              onClick={() => setShowReviewModal(true)}
              className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 cursor-pointer"
            >
              Chi tiết
            </button>
          )}
          <button
            onClick={async () => {
              await onRunReview();
              setShowReviewModal(true);
            }}
            disabled={isReviewing || moves.length === 0}
            className="px-2.5 py-0.5 rounded bg-zinc-200 hover:bg-white disabled:bg-zinc-900 disabled:text-zinc-600 text-[11px] font-medium text-zinc-950 transition cursor-pointer"
          >
            {isReviewing ? 'Đang chấm...' : 'Game Review'}
          </button>
        </div>
      </div>

      {/* Biểu đồ có chấm màu định hướng các bước ngoặt sai lầm (Inaccuracy / Mistake / Blunder) */}
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

      {/* Modal Tổng kết Game Review có màu phân cấp tiêu chí rõ ràng */}
      {showReviewModal && reviewResult && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowReviewModal(false)}
        >
          <div
            className="bg-[#121215] border border-zinc-800 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                Tổng kết chất lượng ván đấu
              </h3>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 items-center text-center py-3 bg-zinc-950 rounded-lg border border-zinc-800/80">
              <div>
                <div className="text-[11px] text-zinc-400">⬜ Trắng</div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {reviewResult.white_accuracy}%
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                Độ chính xác
              </div>
              <div>
                <div className="text-[11px] text-zinc-400">⬛ Đen</div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {reviewResult.black_accuracy}%
                </div>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/60 text-xs bg-zinc-950/50 px-3 py-1 rounded-lg border border-zinc-800/70">
              {CLASS_ORDER.map((item) => {
                const wCount = reviewResult.counts.w[item.key] ?? 0;
                const bCount = reviewResult.counts.b[item.key] ?? 0;
                return (
                  <div key={item.key} className="grid grid-cols-3 items-center py-2">
                    <span
                      className="text-center font-mono font-semibold"
                      style={{ color: wCount > 0 ? item.color : '#52525b' }}
                    >
                      {wCount}
                    </span>
                    <div className="flex items-center justify-center gap-2 text-zinc-300 text-[11px]">
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full font-mono text-[10px] font-bold text-zinc-950 shrink-0"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.symbol}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    <span
                      className="text-center font-mono font-semibold"
                      style={{ color: bCount > 0 ? item.color : '#52525b' }}
                    >
                      {bCount}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowReviewModal(false)}
              className="w-full py-2 rounded-lg bg-zinc-200 hover:bg-white text-xs font-medium text-zinc-950 transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
