import React from 'react';
import { Bot } from 'lucide-react';
import { PlayerInfo } from '../types';
import { formatClockMs } from './HomeScreen';
import { PieceIcon, PieceCode } from '../theme/pieces';

interface PlayerCardProps {
  player: PlayerInfo;
  side: 'w' | 'b';
  isTurn: boolean;
  isThinking?: boolean;
  rating?: number | null;
  clockMs?: number | null;
  capturedSymbols?: string[];
  materialDiff?: number;
}

/** Thẻ người chơi hiển thị tên, loại (người/AI), Elo, quân ăn được và đồng hồ đếm ngược Fischer. */
export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  side,
  isTurn,
  isThinking,
  rating,
  clockMs,
  capturedSymbols,
  materialDiff,
}) => {
  const isLowClock = clockMs != null && clockMs < 20_000;

  return (
    <div
      aria-label={`${player.name} (${side === 'w' ? 'Quân Trắng' : 'Quân Đen'})${
        isTurn ? ' - Đang đến lượt đi' : ''
      }`}
      className={`w-full h-10 flex items-center gap-2 px-3 rounded-md border text-xs transition ${
        isTurn ? 'bg-card border-line-strong shadow-xs' : 'bg-inset border-line'
      }`}
    >
      {/* Ô màu quân */}
      <span
        className={`w-4 h-4 rounded-sm border shrink-0 ${
          side === 'w'
            ? 'bg-sq-w border-line-strong'
            : 'bg-sq-b border-line-strong'
        }`}
      />
      <span
        className={`font-semibold text-[13px] truncate ${
          isTurn ? 'text-ink' : 'text-ink-2'
        }`}
      >
        {player.name}
      </span>
      {rating != null && (
        <span className="shrink-0 font-mono text-[11px] text-ink-3">
          ({rating})
        </span>
      )}
      {player.type === 'ai' && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
          <Bot className="w-2.5 h-2.5" />
          AI
        </span>
      )}
      {isThinking && (
        <span className="shrink-0 text-[10px] text-emerald-400 animate-pulse font-mono">
          đang nghĩ…
        </span>
      )}

      {/* Hiển thị quân đã ăn & điểm lợi thế ngay trong thẻ khi ẩn cột bên hông */}
      {capturedSymbols && capturedSymbols.length > 0 && (
        <div className="hidden xs:flex items-center gap-0.5 ml-1 overflow-hidden">
          {capturedSymbols.slice(0, 10).map((raw, idx) => (
            <span
              key={`${raw}-${idx}`}
              className="inline-flex shrink-0"
              style={{ marginLeft: idx === 0 ? 0 : -6 }}
            >
              <PieceIcon code={raw as PieceCode} size={15} />
            </span>
          ))}
        </div>
      )}
      {materialDiff != null && materialDiff > 0 && (
        <span className="shrink-0 px-1 py-0.5 rounded bg-card border border-line font-mono font-semibold text-emerald-400 text-[10px] leading-none">
          +{materialDiff}
        </span>
      )}

      <span className="flex-1" />

      {clockMs != null && (
        <span
          className={`shrink-0 px-2.5 py-0.5 rounded font-mono text-xs font-semibold tabular-nums border ${
            isLowClock
              ? 'bg-red-500/20 border-red-500/40 text-red-300 animate-pulse'
              : isTurn
              ? 'bg-accent text-accent-ink border-accent'
              : 'bg-inset border-line text-ink-2'
          }`}
        >
          {formatClockMs(clockMs)}
        </span>
      )}

      {isTurn && !isThinking && (
        <span className="shrink-0 w-2 h-2 rounded-full bg-accent animate-pulse" />
      )}
    </div>
  );
};
