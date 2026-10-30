import React, { useEffect } from 'react';
import { PieceIcon, PieceCode } from '../theme/pieces';

const PROMO_PIECES: Array<{
  piece: 'q' | 'r' | 'b' | 'n';
  name: string;
}> = [
  { piece: 'q', name: 'Hậu' },
  { piece: 'r', name: 'Xe' },
  { piece: 'b', name: 'Tượng' },
  { piece: 'n', name: 'Mã' },
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
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="absolute inset-0 z-20 bg-black/65 backdrop-blur-[2px] flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chọn quân phong cấp"
        className="bg-overlay border border-line-strong rounded-lg shadow-2xl p-3.5 space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-medium text-ink text-center">
          Chọn quân phong cấp
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {PROMO_PIECES.map((p) => (
            <button
              key={p.piece}
              onClick={() => onPick(p.piece)}
              className="flex flex-col items-center justify-center w-14 h-16 rounded-md border bg-inset border-line hover:border-line-strong hover:bg-card transition cursor-pointer"
            >
              <PieceIcon
                code={`${color}${p.piece.toUpperCase()}` as PieceCode}
                size={34}
              />
              <span className="text-[10px] font-mono text-ink-2 mt-1">
                {p.name}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full py-1 rounded text-[11px] text-ink-3 hover:text-ink transition cursor-pointer"
        >
          Hủy nước đi
        </button>
      </div>
    </div>
  );
};
