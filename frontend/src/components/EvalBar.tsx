import React from 'react';

interface EvalBarProps {
  cp: number | null;
  mate: number | null;
  winPercentWhite: number;
  orientation: 'white' | 'black';
  enabled: boolean;
}

export const EvalBar: React.FC<EvalBarProps> = ({
  cp,
  mate,
  winPercentWhite,
  orientation,
  enabled,
}) => {
  if (!enabled) {
    return (
      <div className="w-5 h-full bg-zinc-900/60 border border-zinc-800/80 rounded-sm flex items-center justify-center text-[9px] text-zinc-600 select-none">
        –
      </div>
    );
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
      className="relative w-5 rounded-sm overflow-hidden border border-zinc-800 flex flex-col select-none"
      style={{ height: '100%' }}
      title={`Đánh giá: ${scoreText} (${winPercentWhite.toFixed(1)}%)`}
    >
      <div
        className={`w-full transition-all duration-500 ease-out ${
          topIsBlack ? 'bg-[#1c1c20]' : 'bg-[#e4e2dd]'
        }`}
        style={{ height: `${topHeightPercent}%` }}
      />
      <div
        className={`w-full flex-1 transition-all duration-500 ease-out ${
          topIsBlack ? 'bg-[#e4e2dd]' : 'bg-[#1c1c20]'
        }`}
      />

      {/* Vạch giữa 50% tối giản */}
      <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-500/40 pointer-events-none" />

      <div
        className={`absolute left-0 right-0 text-center text-[9px] font-mono font-medium tracking-tighter pointer-events-none ${
          (whiteAdvantage && topIsBlack) || (!whiteAdvantage && !topIsBlack)
            ? 'bottom-1.5 text-zinc-900'
            : 'top-1.5 text-zinc-300'
        }`}
      >
        {scoreText}
      </div>
    </div>
  );
};
