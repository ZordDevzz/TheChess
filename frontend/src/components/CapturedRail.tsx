import React from 'react';

interface CapturedStripProps {
  /** Bên đã ăn quân (hiển thị quân đối phương bị bắt) */
  side: 'w' | 'b';
  symbols: string[];
  /** Chênh lệch vật chất dương nghiêng về bên này */
  diff: number;
  /** Kích thước bàn cờ (px) — suy ra cỡ quân & bề rộng tối đa của dải */
  boardSize: number;
  /** Căn hàng: trái (dưới bàn) hay phải (trên bàn) */
  align?: 'left' | 'right';
}

/**
 * Dải ngang quân đối phương đã bị bắt, đặt phía người chơi tương ứng
 * (hàng riêng ngay trên/dưới bàn cờ). Quân cỡ ~1/3 quân cờ thật,
 * flex-wrap xuống hàng mới khi tràn.
 */
export const CapturedStrip: React.FC<CapturedStripProps> = ({
  side,
  symbols,
  diff,
  boardSize,
  align = 'left',
}) => {
  // ~1/3 kích cỡ một ô (quân thật) trên bàn cờ
  const piecePx = Math.max(13, Math.round(boardSize / 8 / 3));

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 select-none ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
      style={{ maxWidth: Math.round(boardSize * 0.62) }}
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
      {diff > 0 && (
        <span className="font-mono font-semibold text-emerald-400 text-xs leading-none shrink-0">
          +{diff}
        </span>
      )}
    </div>
  );
};
