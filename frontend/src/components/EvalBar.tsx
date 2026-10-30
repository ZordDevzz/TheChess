import React from 'react';

interface EvalBarProps {
  cp: number | null;
  mate: number | null;
  winPercentWhite: number;
  orientation: 'white' | 'black';
  enabled: boolean;
}

/** "Đũa thần" eval dọc sát bàn: nghiêng về bên nào đang thắng. */
export const EvalBar: React.FC<EvalBarProps> = ({
  cp,
  mate,
  winPercentWhite,
  orientation,
  enabled,
}) => {
  if (!enabled) {
    return null;
  }

  const clampedWin = Math.max(2, Math.min(98, winPercentWhite));

  let scoreText = '0.0';
  if (mate !== null && mate !== undefined) {
    scoreText = mate === 0 ? '#' : `M${Math.abs(mate)}`;
  } else if (cp !== null && cp !== undefined) {
    const pawns = (cp / 100).toFixed(1);
    scoreText = cp > 0 ? `+${pawns}` : pawns;
  }

  const whiteAdvantage = winPercentWhite >= 50;
  const topIsBlack = orientation === 'white';
  const topHeightPercent = topIsBlack ? 100 - clampedWin : clampedWin;

  return (
    <div
      className="relative w-5 rounded-sm overflow-hidden border border-line flex flex-col select-none shadow-lg"
      style={{ height: '100%' }}
      title={`Đánh giá: ${scoreText} (${winPercentWhite.toFixed(1)}%)`}
      role="meter"
      aria-valuenow={Math.round(winPercentWhite)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Tỷ lệ thắng nghiêng về Trắng"
    >
      <div
        className={`w-full transition-all duration-500 ease-out ${
          topIsBlack ? 'bg-sq-b' : 'bg-sq-w'
        }`}
        style={{ height: `${topHeightPercent}%` }}
      />
      <div
        className={`w-full flex-1 transition-all duration-500 ease-out ${
          topIsBlack ? 'bg-sq-w' : 'bg-sq-b'
        }`}
      />

      {/* Vạch giữa 50% */}
      <div className="absolute top-1/2 left-0 right-0 h-px bg-ink-3/60 pointer-events-none" />

      <div
        className={`absolute left-0 right-0 text-center text-[9px] font-mono font-medium tracking-tighter pointer-events-none ${
          (whiteAdvantage && topIsBlack) || (!whiteAdvantage && !topIsBlack)
            ? 'bottom-1.5 text-ink-3'
            : 'top-1.5 text-ink-3'
        }`}
      >
        {scoreText}
      </div>
    </div>
  );
};
