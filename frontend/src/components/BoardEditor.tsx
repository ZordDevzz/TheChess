import React, { useState, useEffect } from 'react';
import { PresetPosition } from '../types';
import { validateCustomFen } from '../api';
import { RotateCcw, Trash2, Eraser, Copy, Check } from 'lucide-react';

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

const WHITE_PIECES: Array<{ code: EditorTool; symbol: string }> = [
  { code: 'wK', symbol: '♔' },
  { code: 'wQ', symbol: '♕' },
  { code: 'wR', symbol: '♖' },
  { code: 'wB', symbol: '♗' },
  { code: 'wN', symbol: '♘' },
  { code: 'wP', symbol: '♙' },
];

const BLACK_PIECES: Array<{ code: EditorTool; symbol: string }> = [
  { code: 'bK', symbol: '♚' },
  { code: 'bQ', symbol: '♛' },
  { code: 'bR', symbol: '♜' },
  { code: 'bB', symbol: '♝' },
  { code: 'bN', symbol: '♞' },
  { code: 'bP', symbol: '♟' },
];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function boardMapToFenPlacement(map: Record<string, string>): string {
  const rows: string[] = [];
  for (const r of RANKS) {
    let empty = 0;
    let rowStr = '';
    for (const f of FILES) {
      const sq = `${f}${r}`;
      const p = map[sq];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += String(empty);
          empty = 0;
        }
        const color = p[0];
        const role = p[1];
        rowStr += color === 'w' ? role.toUpperCase() : role.toLowerCase();
      }
    }
    if (empty > 0) rowStr += String(empty);
    rows.push(rowStr);
  }
  return rows.join('/');
}

export function fenToBoardMap(fen: string): Record<string, string> {
  const map: Record<string, string> = {};
  const placement = fen.trim().split(/\s+/)[0] || '';
  const rows = placement.split('/');
  if (rows.length !== 8) return map;

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    const rank = RANKS[rIdx];
    let fIdx = 0;
    for (const ch of rows[rIdx]) {
      if (fIdx >= 8) break;
      if (ch >= '1' && ch <= '8') {
        fIdx += parseInt(ch, 10);
      } else {
        const isUpper = ch === ch.toUpperCase();
        const color = isUpper ? 'w' : 'b';
        const role = ch.toUpperCase();
        map[`${FILES[fIdx]}${rank}`] = `${color}${role}`;
        fIdx++;
      }
    }
  }
  return map;
}

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

    setFenInput(`${placement} ${turn} ${castleStr} - 0 1`);
  }, [boardMap, turn, castling]);

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
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#111114] p-4 flex flex-col justify-between gap-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div>
            <h3 className="text-xs font-semibold text-zinc-100">Thiết lập bàn cờ</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
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
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Mặc định
            </button>
            <button
              onClick={() => onUpdateBoardMap({ e1: 'wK', e8: 'bK' })}
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1 cursor-pointer"
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
                  ? 'bg-zinc-200 border-zinc-200 text-zinc-950'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Kéo / Thả quân
            </button>
            <button
              onClick={() => onSelectTool('erase')}
              className={`py-1.5 px-3 rounded text-xs font-medium border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                selectedTool === 'erase'
                  ? 'bg-zinc-200 border-zinc-200 text-zinc-950'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
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
                    ? 'bg-zinc-800 border-zinc-400 text-white'
                    : 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span className="text-xl leading-none">{p.symbol}</span>
                <span className="text-[10px] font-mono text-zinc-400 mt-1">{p.code}</span>
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
                    ? 'bg-zinc-800 border-zinc-400 text-white'
                    : 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span className="text-xl leading-none">{p.symbol}</span>
                <span className="text-[10px] font-mono text-zinc-400 mt-1">{p.code}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lượt đi & Nhập thành */}
        <div className="grid grid-cols-2 gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Lượt đi</label>
            <div className="flex gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
              <button
                onClick={() => setTurn('w')}
                className={`flex-1 py-1 rounded text-xs font-medium cursor-pointer ${
                  turn === 'w' ? 'bg-zinc-200 text-zinc-950' : 'text-zinc-400'
                }`}
              >
                Trắng
              </button>
              <button
                onClick={() => setTurn('b')}
                className={`flex-1 py-1 rounded text-xs font-medium cursor-pointer ${
                  turn === 'b' ? 'bg-zinc-200 text-zinc-950' : 'text-zinc-400'
                }`}
              >
                Đen
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Nhập thành</label>
            <div className="grid grid-cols-2 gap-1 text-xs text-zinc-300">
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
                    className="accent-zinc-200"
                  />
                  <span className="font-mono text-[11px]">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Chọn thế cờ mẫu */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Thế cờ mẫu</label>
          <select
            onChange={(e) => {
              const found = presets.find((p) => p.id === e.target.value);
              if (found) handleLoadFenString(found.fen);
            }}
            defaultValue=""
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
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
            <label className="text-xs text-zinc-400">FEN</label>
            <button
              onClick={() => {
                navigator.clipboard.writeText(fenInput);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Đã chép' : 'Sao chép'}
            </button>
          </div>
          <input
            type="text"
            value={fenInput}
            onChange={(e) => handleLoadFenString(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-zinc-400">Nhập PGN (Tùy chọn)</label>
          <textarea
            rows={2}
            value={pgnInput}
            onChange={(e) => setPgnInput(e.target.value)}
            placeholder="1. e4 e5 2. Nf3 Nc6..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
        </div>

        {!validation.valid && (
          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-300 space-y-0.5">
            {validation.errors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        )}
      </div>

      <button
        disabled={!validation.valid && !pgnInput.trim()}
        onClick={() => onApplyPosition(fenInput, pgnInput.trim() || undefined)}
        className="w-full py-2 px-4 rounded-lg bg-zinc-100 hover:bg-white disabled:bg-zinc-900 disabled:text-zinc-400 font-medium text-xs text-zinc-950 transition cursor-pointer"
      >
        Áp dụng thế cờ
      </button>
    </div>
  );
};
