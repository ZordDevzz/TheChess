import React from 'react';

interface CapturedRailProps {
  /** Bên đã ăn quân (hiển thị quân đối phương bị bắt) */
  side: 'w' | 'b';
  symbols: string[];
  /** Chênh lệch vật chất dương nghiêng về bên này */
  diff: number;
  height: number;
  /** Lớp vị trí bổ sung (đặt rail vào khoảng trống bên cạnh bàn cờ) */
  className?: string;
}

/**
 * Dải dọc hiển thị quân đối phương đã bị bắt, đặt trong khoảng trống
 * 2 bên bàn cờ. Quân lớn hơn trên, tự động xuống cột kế khi đầy chiều cao.
 */
export const CapturedRail: React.FC<CapturedRailProps> = ({
  side,
  symbols,
  diff,
  height,
  className = '',
}) => (
  <div
    className={`flex flex-col items-center gap-1 shrink-0 select-none ${className}`}
    style={{ height }}
    title={
      side === 'w'
        ? 'Quân Đen mà bên Trắng đã bắt'
        : 'Quân Trắng mà bên Đen đã bắt'
    }
  >
    {/* Ô màu phía trên xác định bên ăn quân */}
    <span
      className={`w-3 h-3 rounded-sm border shrink-0 ${
        side === 'w'
          ? 'bg-zinc-100 border-zinc-300'
          : 'bg-zinc-800 border-zinc-600'
      }`}
    />

    {/* Danh sách quân: xếp dọc, wrap sang cột mới khi hết chiều cao */}
    <div
      className="flex-1 min-h-0 w-7 flex flex-col flex-wrap content-start gap-x-0 overflow-hidden"
      style={{ maxHeight: height - 34 }}
    >
      {symbols.map((s, i) => (
        <span
          key={i}
          className={`text-xl leading-[1.35] ${
            side === 'w' ? 'text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {s}
        </span>
      ))}
    </div>

    {/* Chênh lệch vật chất */}
    <span
      className={`shrink-0 text-[11px] font-mono font-bold tabular-nums ${
        diff > 0 ? 'text-emerald-400' : 'text-zinc-700'
      }`}
    >
      {diff > 0 ? `+${diff}` : '·'}
    </span>
  </div>
);
