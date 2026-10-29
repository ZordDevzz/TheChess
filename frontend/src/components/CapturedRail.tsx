import React from 'react';

interface CapturedBarProps {
  /** Bên đã ăn quân (hiển thị quân đối phương bị bắt) */
  side: 'w' | 'b';
  symbols: string[];
  /** Chênh lệch vật chất dương nghiêng về bên này */
  diff: number;
  /** Kích thước bàn cờ (px) — suy ra cỡ quân & chiều cao bar */
  boardSize: number;
  /** Vị trí neo trong cột: đáy (cột trái) hay đỉnh (cột phải) */
  dock?: 'bottom' | 'top';
}

/**
 * Bar ngang quân đối phương đã bị bắt, nằm trong cột bên cạnh bàn cờ:
 * cột trái docked đáy (người chơi dưới), cột phải docked đỉnh (trên).
 * Quân cỡ ~1/3 quân cờ thật, xếp theo hàng ngang và flex-wrap
 * xuống hàng mới khi tràn bề rộng bar.
 */
export const CapturedBar: React.FC<CapturedBarProps> = ({
  side,
  symbols,
  diff,
  boardSize,
  dock = 'bottom',
}) => {
  // ~1/3 kích cỡ một ô (quân thật) trên bàn cờ
  const piecePx = Math.max(13, Math.round(boardSize / 8 / 3));
  // Bề rộng bar: đủ cho ~5-6 quân một hàng trong khoảng trống 2 bên bàn
  const barWidth = Math.max(96, Math.round(boardSize * 0.28));

  return (
    <div
      className="flex flex-col shrink-0 select-none"
      style={{ width: barWidth, height: boardSize }}
    >
      {/* Khoảng giãn để neo bar về đỉnh hoặc đáy cột */}
      {dock === 'top' && <div className="flex-1" />}

      <div
        className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 ${
          dock === 'top' ? 'justify-end' : 'justify-start'
        }`}
        title={
          side === 'w'
            ? 'Quân Đen mà bên Trắng đã bắt'
            : 'Quân Trắng mà bên Đen đã bắt'
        }
      >
        {symbols.map((s, i) => (
          <span
            key={i}
            className={`leading-none ${
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
        <span
          className={`font-mono font-semibold text-emerald-400 text-xs leading-none shrink-0 mt-0.5 ${
            dock === 'top' ? 'self-end' : 'self-start'
          }`}
        >
          +{diff}
        </span>
      )}

      {dock === 'bottom' && <div className="flex-1" />}
    </div>
  );
};
