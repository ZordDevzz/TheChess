import React from 'react';

const PROMO_PIECES: Array<{ piece: 'q' | 'r' | 'b' | 'n'; name: string; white: string; black: string }> = [
  { piece: 'q', name: 'Hậu', white: '♕', black: '♛' },
  { piece: 'r', name: 'Xe', white: '♖', black: '♜' },
  { piece: 'b', name: 'Tượng', white: '♗', black: '♝' },
  { piece: 'n', name: 'Mã', white: '♘', black: '♞' },
];

interface PromotionDialogProps {
  color: 'w' | 'b';
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

/** Overlay chọn quân phong cấp hiện ngay trên bàn cờ. */
export const PromotionDialog: React.FC<PromotionDialogProps> = ({
  color,
  onPick,
  onCancel,
}) => (
  <div
    className="absolute inset-0 z-20 bg-black/65 backdrop-blur-[2px] flex items-center justify-center"
    onClick={onCancel}
  >
    <div
      className="bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-3.5 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[11px] font-medium text-zinc-200 text-center">
        Chọn quân phong cấp
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PROMO_PIECES.map((p) => (
          <button
            key={p.piece}
            onClick={() => onPick(p.piece)}
            className="flex flex-col items-center justify-center w-14 h-16 rounded-md border bg-zinc-950 border-zinc-800 hover:border-zinc-400 hover:bg-zinc-900 transition cursor-pointer"
          >
            <span className="text-3xl leading-none">
              {color === 'w' ? p.white : p.black}
            </span>
            <span className="text-[9px] font-mono text-zinc-400 mt-1.5">
              {p.name}
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={onCancel}
        className="w-full py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
      >
        Hủy nước đi
      </button>
    </div>
  </div>
);
