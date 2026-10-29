import React from 'react';

interface CapturedStripProps {
  /** Bên đã ăn quân (hiển thị quân đối phương bị bắt) */
  side: 'w' | 'b';
  symbols: string[];
  /** Chênh lệch vật chất dương nghiêng về bên này */
  diff: number;
  /** Kích thước bàn cờ (px) — suy ra cỡ quân & bề rộng tối đa của dải */
  boardSize: number;
}

/**
 * Dải quân đối phương đã bị bắt, đặt trên-phải / dưới-trái cạnh bàn cờ
 * (ngay hàng với PlayerCard). Quân có kích thước ~1/3 quân cờ thật,
 * tự xuống hàng mới khi hết chỗ trong hàng hiện tại.
 */
export const CapturedStrip: React.FC<CapturedStripProps> = ({
  side,
  symbols,
  diff,
  boardSize,
}) => {
  // ~1/3 kích cỡ một ô (quân thật) trên bàn cờ
  const piecePx = Math.max(13, Math.round(boardSize / 8 / 3));
  const maxStripWidth = Math.round(boardSize * 0.52);

  return (
    <div
      className="flex flex-wrap items-center gap-x-1 gap-y-0.5 shrink-1 min-w-0 select-none"
      style={{ maxWidth: maxStripWidth }}
      title={
        side === 'w'
          ? 'Quân Đen mà bên Trắng đã bắt'
          : 'Quân Trắng mà bên Đen đã bắt'
      }
    >
      {symbols.map((s, i) => (
        <span
          key={i}
          className={`leading-none ${side === 'w' ? 'text-zinc-400' : 'text-zinc-100'}`}
          style={{ fontSize: piecePx }}
        >
          {s}
        </span>
      ))}
      {diff > 0 && (
        <span className="font-mono font-semibold text-emerald-400 text-xs leading-none shrink-0">
          +{diff}
        </span>
      )}
    </div>
  );
};
