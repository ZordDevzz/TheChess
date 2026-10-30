import React, { useState, useEffect } from 'react';
import { PresetPosition } from '../types';
import { validateCustomFen } from '../api';
import { RotateCcw, Trash2, Eraser, Copy, Check } from 'lucide-react';
import { PieceIcon, PieceCode } from '../theme/pieces';
import { boardMapToFenPlacement, fenToBoardMap } from '../gameUtils';

export type EditorTool =
  | 'move'
  | 'erase'
  | 'wK'
  | 'wQ'
  | 'wR'
  | 'wB'
  | 'wN'
  | 'wP'
  | 'bK'
  | 'bQ'
  | 'bR'
  | 'bB'
  | 'bN'
  | 'bP';

interface BoardEditorProps {
  boardMap: Record<string, string>;
  onUpdateBoardMap: (newMap: Record<string, string>) => void;
  selectedTool: EditorTool;
  onSelectTool: (tool: EditorTool) => void;
  presets: PresetPosition[];
  onApplyPosition: (fen: string, pgn?: string) => void;
}

const WHITE_PIECES: Array<{ code: EditorTool }> = [
  { code: 'wK' },
  { code: 'wQ' },
  { code: 'wR' },
  { code: 'wB' },
  { code: 'wN' },
  { code: 'wP' },
];

const BLACK_PIECES: Array<{ code: EditorTool }> = [
  { code: 'bK' },
  { code: 'bQ' },
  { code: 'bR' },
  { code: 'bB' },
  { code: 'bN' },
  { code: 'bP' },
];

export const BoardEditor: React.FC<BoardEditorProps> = ({
  boardMap,
  onUpdateBoardMap,
  selectedTool,
  onSelectTool,
  presets,
  onApplyPosition,
}) => {
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [castling, setCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [epSquare, setEpSquare] = useState<string>('-');
  const [halfmove, setHalfmove] = useState<string>('0');
  const [fullmove, setFullmove] = useState<string>('1');
  const [fenInput, setFenInput] = useState('');
  const [pgnInput, setPgnInput] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] }>({
    valid: true,
    errors: [],
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const placement = boardMapToFenPlacement(boardMap);
    let castleStr = '';
    if (castling.K && boardMap['e1'] === 'wK' && boardMap['h1'] === 'wR') castleStr += 'K';
    if (castling.Q && boardMap['e1'] === 'wK' && boardMap['a1'] === 'wR') castleStr += 'Q';
    if (castling.k && boardMap['e8'] === 'bK' && boardMap['h8'] === 'bR') castleStr += 'k';
    if (castling.q && boardMap['e8'] === 'bK' && boardMap['a8'] === 'bR') castleStr += 'q';
    if (!castleStr) castleStr = '-';

    setFenInput(`${placement} ${turn} ${castleStr} ${epSquare} ${halfmove} ${fullmove}`);
  }, [boardMap, turn, castling, epSquare, halfmove, fullmove]);

  useEffect(() => {
    if (!fenInput.trim()) return;
    const timer = setTimeout(() => {
      validateCustomFen(fenInput)
        .then((res) => setValidation({ valid: res.valid, errors: res.errors }))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [fenInput]);

  const handleLoadFenString = (rawFen: string) => {
    setFenInput(rawFen);
    const parts = rawFen.trim().split(/\s+/);
    if (parts.length >= 1 && parts[0].split('/').length === 8) {
      onUpdateBoardMap(fenToBoardMap(rawFen));
      if (parts[1] === 'w' || parts[1] === 'b') setTurn(parts[1]);
      if (parts[2]) {
        setCastling({
          K: parts[2].includes('K'),
          Q: parts[2].includes('Q'),
          k: parts[2].includes('k'),
          q: parts[2].includes('q'),
        });
      }
      setEpSquare(parts[3] && /^([a-h][36]|-)$/.test(parts[3]) ? parts[3] : '-');
      setHalfmove(parts[4] && /^\d+$/.test(parts[4]) ? parts[4] : '0');
      setFullmove(parts[5] && /^\d+$/.test(parts[5]) ? parts[5] : '1');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-panel p-4 flex flex-col justify-between gap-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="text-xs font-semibold text-ink">Thiết lập bàn cờ</h3>
            <p className="text-xs text-ink-2 mt-0.5">
              Chọn quân cờ bên dưới rồi nhấn vào ô cờ để đặt hoặc xóa.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                handleLoadFenString(
                  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
                )
              }
              className="px-2 py-1 rounded bg-inset hover:bg-card border border-line text-xs text-ink-2 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Mặc định
            </button>
            <button
              onClick={() => onUpdateBoardMap({ e1: 'wK', e8: 'bK' })}
              className="px-2 py-1 rounded bg-inset hover:bg-card border border-line text-xs text-ink-2 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Xóa trống
            </button>
          </div>
        </div>

        {/* Công cụ con trỏ & tẩy */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onSelectTool('move')}
              className={`py-1.5 px-3 rounded text-xs font-medium border transition cursor-pointer ${
                selectedTool === 'move'
                  ? 'bg-accent border-line-strong text-accent-ink'
                  : 'bg-inset border-line text-ink-2 hover:text-ink'
              }`}
            >
              Kéo / Thả quân
            </button>
            <button
              onClick={() => onSelectTool('erase')}
              className={`py-1.5 px-3 rounded text-xs font-medium border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                selectedTool === 'erase'
                  ? 'bg-accent border-line-strong text-accent-ink'
                  : 'bg-inset border-line text-ink-2 hover:text-ink'
              }`}
            >
              <Eraser className="w-3 h-3" />
              Xóa ô cờ
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {WHITE_PIECES.map((p) => (
              <button
                key={p.code}
                onClick={() => onSelectTool(p.code)}
                className={`flex flex-col items-center justify-center py-1.5 rounded border transition cursor-pointer ${
                  selectedTool === p.code
                    ? 'bg-card border-line-strong text-ink'
                    : 'bg-inset border-line text-ink-2 hover:border-line-strong'
                }`}
              >
                <PieceIcon code={p.code as PieceCode} size={26} />
                <span className="text-[10px] font-mono text-ink-2 mt-1">{p.code}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-6 gap-1">
            {BLACK_PIECES.map((p) => (
              <button
                key={p.code}
                onClick={() => onSelectTool(p.code)}
                className={`flex flex-col items-center justify-center py-1.5 rounded border transition cursor-pointer ${
                  selectedTool === p.code
                    ? 'bg-card border-line-strong text-ink'
                    : 'bg-inset border-line text-ink-2 hover:border-line-strong'
                }`}
              >
                <PieceIcon code={p.code as PieceCode} size={26} />
                <span className="text-[10px] font-mono text-ink-2 mt-1">{p.code}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lượt đi & Nhập thành */}
        <div className="grid grid-cols-2 gap-3 bg-inset p-3 rounded-lg border border-line">
          <div>
            <label className="block text-xs text-ink-2 mb-1.5">Lượt đi</label>
            <div className="flex gap-1 bg-inset p-0.5 rounded border border-line">
              <button
                onClick={() => setTurn('w')}
                className={`flex-1 py-1 rounded text-xs font-medium cursor-pointer ${
                  turn === 'w' ? 'bg-accent text-accent-ink' : 'text-ink-2'
                }`}
              >
                Trắng
              </button>
              <button
                onClick={() => setTurn('b')}
                className={`flex-1 py-1 rounded text-xs font-medium cursor-pointer ${
                  turn === 'b' ? 'bg-accent text-accent-ink' : 'text-ink-2'
                }`}
              >
                Đen
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1.5">Nhập thành</label>
            <div className="grid grid-cols-2 gap-1 text-xs text-ink-2">
              {(
                [
                  ['K', 'W O-O'],
                  ['Q', 'W O-O-O'],
                  ['k', 'B O-O'],
                  ['q', 'B O-O-O'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={castling[key]}
                    onChange={(e) =>
                      setCastling((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="accent-accent"
                  />
                  <span className="font-mono text-[11px]">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Chọn thế cờ mẫu */}
        <div>
          <label className="block text-xs text-ink-2 mb-1">Thế cờ mẫu</label>
          <select
            onChange={(e) => {
              const found = presets.find((p) => p.id === e.target.value);
              if (found) handleLoadFenString(found.fen);
            }}
            defaultValue=""
            className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-line-strong"
          >
            <option value="" disabled>
              Chọn thế cờ khai cuộc / cờ tàn / chấp quân...
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.category}] {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* FEN & PGN */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-ink-2">FEN</label>
            <button
              onClick={() => {
                navigator.clipboard.writeText(fenInput);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
          <input
            type="text"
            value={fenInput}
            onChange={(e) => handleLoadFenString(e.target.value)}
            className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-line-strong"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-ink-2">Nhập PGN (Tùy chọn)</label>
          <textarea
            rows={2}
            value={pgnInput}
            onChange={(e) => setPgnInput(e.target.value)}
            placeholder="1. e4 e5 2. Nf3 Nc6..."
            className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-line-strong"
          />
        </div>

        {!validation.valid && (
          <div className="p-2.5 rounded bg-inset border border-line-strong text-xs text-ink-2 space-y-0.5">
            {validation.errors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        )}
      </div>

      <button
        disabled={!validation.valid && !pgnInput.trim()}
        onClick={() => onApplyPosition(fenInput, pgnInput.trim() || undefined)}
        className="w-full py-2 px-4 rounded-lg bg-accent hover:opacity-90 disabled:bg-inset disabled:text-ink-2 font-medium text-xs text-accent-ink transition cursor-pointer"
      >
        Áp dụng thế cờ
      </button>
    </div>
  );
};
