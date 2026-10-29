import React from 'react';

interface CapturedRailProps {
  /** Bên đã ăn quân (hiển thị quân đối phương bị bắt) */
  side: 'w' | 'b';
  symbols: string[];
  /** Chênh lệch vật chất dương nghiêng về bên này */
  diff: number;
  /** Kích thước bàn cờ (px) — suy ra cỡ quân và chiều cao rail */
  boardSize: number;
}

/**
 * Cột dọc hiển thị quân đối phương đã bị bắt, đặt 2 bên bàn cờ
 * trong bố cục 3 cột (rail trái · bàn cờ · rail phải).
 * Quân cỡ ~1/3 quân thật, xếp dọc và wrap sang cột kế khi hết chiều cao.
 */
export const CapturedRail: React.FC<CapturedRailProps> = ({
  side,
  symbols,
  diff,
  boardSize,
}) => {
  // ~1/3 kích cỡ một ô (quân thật) trên bàn cờ
  const piecePx = Math.max(13, Math.round(boardSize / 8 / 3));

  return (
    <div
      className="flex flex-col items-center gap-1 w-10 shrink-0 select-none"
      style={{ height: boardSize }}
      title={
        side === 'w'
          ? 'Quân Đen mà bên Trắng đã bắt'
          : 'Quân Trắng mà bên Đen đã bắt'
      }
    >
      {/* Ô màu xác định bên ăn quân */}
      <span
        className={`w-3 h-3 rounded-sm border shrink-0 ${
          side === 'w'
            ? 'bg-zinc-100 border-zinc-300'
            : 'bg-zinc-800 border-zinc-600'
        }`}
      />

      {/* Danh sách quân: xếp dọc, wrap sang cột mới khi hết chiều cao */}
      <div
        className="flex-1 min-h-0 w-full flex flex-col flex-wrap content-center gap-x-0.5 overflow-hidden"
        style={{ maxHeight: boardSize - 34 }}
      >
        {symbols.map((s, i) => (
          <span
            key={i}
            className={`leading-tight ${
              side === 'w' ? 'text-zinc-400' : 'text-zinc-100'
            }`}
            style={{ fontSize: piecePx }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Chênh lệch vật chất */}
      {diff > 0 && (
        <span className="shrink-0 font-mono font-semibold text-emerald-400 text-xs tabular-nums">
          +{diff}
        </span>
      )}
    </div>
  );
};
