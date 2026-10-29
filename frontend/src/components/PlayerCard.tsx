import React from 'react';
import { Bot } from 'lucide-react';
import { PlayerInfo } from '../types';

interface PlayerCardProps {
  player: PlayerInfo;
  side: 'w' | 'b';
  isTurn: boolean;
  isThinking?: boolean;
  /** Ký hiệu quân đối phương đã bị bắt */
  capturedSymbols: string[];
  /** Chênh lệch vật chất (>0 = bên này đang hơn) */
  materialDiff: number;
}

/** Thẻ người chơi hiển thị tên, loại (người/AI), quân bắt được và chênh lệch vật chất. */
export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  side,
  isTurn,
  isThinking,
  capturedSymbols,
  materialDiff,
}) => (
  <div
    className={`w-full flex items-center gap-2 px-2.5 py-1 rounded-md border text-[11px] transition ${
      isTurn
        ? 'bg-zinc-800/80 border-zinc-600'
        : 'bg-zinc-950/70 border-zinc-800/80'
    }`}
    style={{ maxWidth: 'min(100%, 560px)' }}
  >
    {/* Ô màu quân + chấm lượt */}
    <span
      className={`w-3.5 h-3.5 rounded-sm border shrink-0 ${
        side === 'w'
          ? 'bg-zinc-100 border-zinc-300'
          : 'bg-zinc-800 border-zinc-600'
      }`}
    />
    <span
      className={`font-medium truncate ${
        isTurn ? 'text-zinc-100' : 'text-zinc-300'
      }`}
    >
      {player.name}
    </span>
    {player.type === 'ai' && (
      <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
        <Bot className="w-2.5 h-2.5" />
        AI
      </span>
    )}
    {isThinking && (
      <span className="shrink-0 text-[9px] text-emerald-400 animate-pulse font-mono">
        đang nghĩ…
      </span>
    )}

    <span className="flex-1" />

    {/* Quân đã bắt + chênh lệch vật chất */}
    {capturedSymbols.length > 0 && (
      <span className="text-zinc-500 tracking-tighter leading-none truncate">
        {capturedSymbols.join('')}
      </span>
    )}
    {materialDiff > 0 && (
      <span className="shrink-0 font-mono font-semibold text-emerald-400">
        +{materialDiff}
      </span>
    )}
    {isTurn && !isThinking && (
      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
    )}
  </div>
);
