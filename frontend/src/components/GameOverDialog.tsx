import React from 'react';
import { RefreshCw, Search, Download, X, Trophy, Handshake } from 'lucide-react';
import { GameOverInfo, PlayerInfo } from '../types';

interface GameOverDialogProps {
  open: boolean;
  gameOver: GameOverInfo | null;
  players: { w: PlayerInfo; b: PlayerInfo };
  accuracy: { w: number; b: number } | null;
  onNewGame: () => void;
  onRematch: () => void;
  onAnalyze: () => void;
  onExportPgn: () => void;
  onClose: () => void;
}

/** Modal kết thúc ván đấu: kết quả + lý do + 4 hành động (ván mới / rematch / phân tích / PGN). */
export const GameOverDialog: React.FC<GameOverDialogProps> = ({
  open,
  gameOver,
  players,
  accuracy,
  onNewGame,
  onRematch,
  onAnalyze,
  onExportPgn,
  onClose,
}) => {
  if (!open || !gameOver) return null;

  const isDraw = gameOver.winner === null;
  const winnerName = gameOver.winner === 'w' ? players.w.name : players.b.name;
  const loserName = gameOver.winner === 'w' ? players.b.name : players.w.name;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#121215] border border-zinc-800 rounded-xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Kết thúc ván đấu
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kết quả */}
        <div className="flex flex-col items-center gap-1.5 py-3">
          {isDraw ? (
            <Handshake className="w-9 h-9 text-zinc-300" />
          ) : (
            <Trophy
              className={`w-9 h-9 ${
                gameOver.winner === 'w' ? 'text-zinc-100' : 'text-amber-300'
              }`}
            />
          )}
          <div className="text-lg font-bold text-zinc-100">
            {isDraw ? 'Hòa' : `${winnerName} thắng`}
          </div>
          <div className="text-[11px] text-zinc-400">
            {gameOver.reason} · {gameOver.result}
            {!isDraw && ` · ${loserName} thua`}
          </div>
        </div>

        {/* Hai bên + accuracy (nếu đã review) */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {(['w', 'b'] as const).map((side) => (
            <div
              key={side}
              className={`bg-zinc-950 rounded-lg border px-2 py-2.5 ${
                gameOver.winner === side
                  ? 'border-emerald-600/60'
                  : 'border-zinc-800/80'
              }`}
            >
              <div className="text-[11px] text-zinc-400 truncate">
                {side === 'w' ? '⬜ Trắng' : '⬛ Đen'}
              </div>
              <div className="text-xs font-medium text-zinc-100 truncate mt-0.5">
                {players[side].name}
              </div>
              {accuracy && (
                <div className="text-[10px] font-mono text-emerald-400 mt-1">
                  {side === 'w' ? accuracy.w : accuracy.b}% chính xác
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Hành động */}
        <div className="space-y-2">
          <button
            onClick={onAnalyze}
            className="w-full py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            Phân tích ván đấu
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onNewGame}
              className="py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              Ván mới
            </button>
            <button
              onClick={onRematch}
              className="py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Đổi bên đánh lại
            </button>
          </div>
          <button
            onClick={onExportPgn}
            className="w-full py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3 h-3" />
            Xuất PGN
          </button>
        </div>
      </div>
    </div>
  );
};
