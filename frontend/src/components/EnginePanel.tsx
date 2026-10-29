import React, { useState } from 'react';
import { AnalysisResponse, PVLine } from '../types';
import {
  Eye,
  EyeOff,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react';

export type PlayMode = 'vs_ai' | 'pass_and_play' | 'sandbox';

interface EnginePanelProps {
  playMode: PlayMode;
  onChangePlayMode: (mode: PlayMode) => void;
  playerColor: 'w' | 'b';
  onChangePlayerColor: (color: 'w' | 'b') => void;
  aiEngine: 'maia' | 'stockfish';
  onChangeAiEngine: (eng: 'maia' | 'stockfish') => void;
  aiElo: number;
  onChangeAiElo: (elo: number) => void;
  showEval: boolean;
  onToggleEval: () => void;
  showArrows: boolean;
  onToggleArrows: () => void;
  multipv: number;
  onChangeMultipv: (n: number) => void;
  depth: number;
  onChangeDepth: (d: number) => void;
  analysis: AnalysisResponse | null;
  isAnalyzing: boolean;
  onPlaySuggestedMove: (uci: string) => void;
  onTriggerAiMoveNow: () => void;
  isAiThinking: boolean;
}

const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

// Màu định hướng đồng bộ giữa danh sách MultiPV và mũi tên trên bàn cờ
export const PV_RANK_STYLES = [
  { dot: '#10b981', label: 'Top 1', border: 'rgba(16, 185, 129, 0.35)' },
  { dot: '#38bdf8', label: 'Top 2', border: 'rgba(56, 189, 248, 0.25)' },
  { dot: '#f59e0b', label: 'Top 3', border: 'rgba(245, 158, 11, 0.25)' },
  { dot: '#a855f7', label: 'Top 4', border: 'rgba(168, 85, 247, 0.2)' },
  { dot: '#ec4899', label: 'Top 5', border: 'rgba(236, 72, 153, 0.2)' },
];

export const EnginePanel: React.FC<EnginePanelProps> = ({
  playMode,
  onChangePlayMode,
  playerColor,
  onChangePlayerColor,
  aiEngine,
  onChangeAiEngine,
  aiElo,
  onChangeAiElo,
  showEval,
  onToggleEval,
  showArrows,
  onToggleArrows,
  multipv,
  onChangeMultipv,
  depth,
  onChangeDepth,
  analysis,
  isAnalyzing,
  onPlaySuggestedMove,
  onTriggerAiMoveNow,
  isAiThinking,
}) => {
  const [openAiConfig, setOpenAiConfig] = useState(false);
  const [openEngineSettings, setOpenEngineSettings] = useState(false);

  const formatLineScore = (line: PVLine) => {
    if (line.mate !== null && line.mate !== undefined) {
      return line.mate > 0 ? `+M${line.mate}` : `-M${Math.abs(line.mate)}`;
    }
    if (line.cp !== null && line.cp !== undefined) {
      const val = (line.cp / 100).toFixed(2);
      return line.cp > 0 ? `+${val}` : val;
    }
    return '0.00';
  };

  // Định hướng thị giác cho điểm số: Trắng ưu thế (Sáng) vs Đen ưu thế (Tối) vs Chiếu hết (Xanh/Đỏ)
  const getScoreBadgeClass = (line: PVLine) => {
    if (line.mate !== null && line.mate !== undefined) {
      return line.mate > 0
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    const cp = line.cp ?? 0;
    if (cp >= 30) {
      return 'bg-zinc-100 text-zinc-950 border-zinc-200 font-semibold';
    }
    if (cp <= -30) {
      return 'bg-zinc-800 text-zinc-200 border-zinc-700 font-semibold';
    }
    return 'bg-zinc-900 text-zinc-300 border-zinc-700/80';
  };

  return (
    <div className="shrink-0 border-b border-zinc-800/80 bg-[#111114] p-3.5 space-y-3 relative">
      {/* Dòng 1: Chọn chế độ & Popover AI */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex bg-zinc-950 p-0.5 rounded-md border border-zinc-800/90 flex-1">
          {(
            [
              ['vs_ai', 'Đấu AI'],
              ['pass_and_play', '2 Người'],
              ['sandbox', 'Tự do'],
            ] as const
          ).map(([modeKey, label]) => (
            <button
              key={modeKey}
              onClick={() => onChangePlayMode(modeKey)}
              className={`flex-1 py-1 px-2 rounded text-[11px] font-medium transition cursor-pointer ${
                playMode === modeKey
                  ? 'bg-zinc-200 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setOpenAiConfig((v) => !v);
            setOpenEngineSettings(false);
          }}
          className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-200 flex items-center gap-1.5 shrink-0 transition cursor-pointer"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono">
            {aiEngine === 'maia' ? `Maia ${aiElo}` : `SF ${aiElo}`}
          </span>
          <span className="text-zinc-500">·</span>
          <span>{playerColor === 'w' ? 'Trắng' : 'Đen'}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500" />
        </button>

        <button
          onClick={onTriggerAiMoveNow}
          disabled={isAiThinking}
          className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-[11px] text-zinc-300 shrink-0 transition cursor-pointer"
          title="Yêu cầu AI đi nước tiếp theo"
        >
          {isAiThinking ? '...' : 'AI đi'}
        </button>
      </div>

      {/* Popover cài đặt AI Đối thủ */}
      {openAiConfig && (
        <div className="absolute left-3 right-3 top-12 z-30 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-4 space-y-3.5 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-medium text-zinc-100">Cấu hình đối thủ AI</span>
            <button
              onClick={() => setOpenAiConfig(false)}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              Đóng
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Quân của bạn</span>
            <div className="flex gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
              <button
                onClick={() => onChangePlayerColor('w')}
                className={`px-3 py-1 rounded text-[11px] font-medium cursor-pointer ${
                  playerColor === 'w'
                    ? 'bg-zinc-200 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Trắng
              </button>
              <button
                onClick={() => onChangePlayerColor('b')}
                className={`px-3 py-1 rounded text-[11px] font-medium cursor-pointer ${
                  playerColor === 'b'
                    ? 'bg-zinc-200 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Đen
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onChangeAiEngine('maia');
                if (aiElo > 1900 || aiElo < 1100) onChangeAiElo(1500);
              }}
              className={`p-2.5 rounded-md border text-left transition cursor-pointer ${
                aiEngine === 'maia'
                  ? 'bg-zinc-800/90 border-emerald-500/60 text-zinc-100'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="font-medium text-zinc-100 flex items-center justify-between">
                <span>Maia Chess</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                  Human-like
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                Huấn luyện từ kỳ thủ (1100–1900)
              </div>
            </button>
            <button
              onClick={() => {
                onChangeAiEngine('stockfish');
                if (aiElo < 1350) onChangeAiElo(1600);
              }}
              className={`p-2.5 rounded-md border text-left transition cursor-pointer ${
                aiEngine === 'stockfish'
                  ? 'bg-zinc-800/90 border-sky-500/60 text-zinc-100'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="font-medium text-zinc-100 flex items-center justify-between">
                <span>Stockfish 17</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
                  NNUE
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                Engine chuẩn UCI (1320–3190)
              </div>
            </button>
          </div>

          {aiEngine === 'maia' ? (
            <div>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-zinc-400">Hệ số Elo</span>
                <span className="font-mono text-emerald-400 font-semibold">{aiElo}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {MAIA_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => onChangeAiElo(lvl)}
                    className={`py-1 rounded text-[11px] font-mono border transition cursor-pointer ${
                      aiElo === lvl
                        ? 'bg-zinc-200 border-zinc-200 text-zinc-950 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-zinc-400">Giới hạn Elo</span>
                <span className="font-mono text-sky-400 font-semibold">
                  {aiElo >= 3190 ? 'Tối đa (3190+)' : aiElo}
                </span>
              </div>
              <input
                type="range"
                min={1320}
                max={3190}
                step={50}
                value={aiElo}
                onChange={(e) => onChangeAiElo(Number(e.target.value))}
                className="w-full accent-zinc-200 cursor-pointer"
              />
            </div>
          )}
        </div>
      )}

      {/* Dòng 2: Tiêu đề Phân tích & Tùy chọn hiển thị + Tỷ lệ Thắng/Hòa/Thua */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="font-medium text-zinc-200">Phân tích nhánh</span>
            <span className="font-mono text-zinc-500">
              d={depth} · {multipv} PV
            </span>
            {isAnalyzing && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onToggleEval}
              className={`px-2 py-0.5 rounded text-[11px] border flex items-center gap-1 transition cursor-pointer ${
                showEval
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                  : 'bg-transparent border-zinc-800/80 text-zinc-500 hover:text-zinc-400'
              }`}
            >
              {showEval ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Eval
            </button>
            <button
              onClick={onToggleArrows}
              className={`px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                showArrows
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                  : 'bg-transparent border-zinc-800/80 text-zinc-500 hover:text-zinc-400'
              }`}
            >
              Mũi tên
            </button>
            <button
              onClick={() => {
                setOpenEngineSettings((v) => !v);
                setOpenAiConfig(false);
              }}
              className={`p-1 rounded border transition cursor-pointer ${
                openEngineSettings
                  ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                  : 'bg-transparent border-zinc-800/80 text-zinc-500 hover:text-zinc-300'
              }`}
              title="Cài đặt thông số phân tích"
            >
              <SlidersHorizontal className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Thanh tỷ lệ cơ hội thắng Trắng vs Đen trực quan */}
        {showEval && analysis && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-zinc-300">
                Trắng: <strong>{analysis.win_percent_white.toFixed(1)}%</strong>
              </span>
              <span className="text-zinc-400">
                Đen: <strong>{(100 - analysis.win_percent_white).toFixed(1)}%</strong>
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-zinc-800 flex">
              <div
                className="bg-zinc-200 transition-all duration-300"
                style={{ width: `${analysis.win_percent_white}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Popover chỉnh MultiPV & Depth */}
      {openEngineSettings && (
        <div className="absolute left-3 right-3 top-20 z-30 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-3.5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
            <span className="font-medium text-zinc-100">Thông số phân tích</span>
            <button
              onClick={() => setOpenEngineSettings(false)}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              Đóng
            </button>
          </div>
          <div>
            <div className="flex justify-between text-zinc-400 mb-1 text-[11px]">
              <span>Số nhánh (MultiPV)</span>
              <span className="font-mono text-zinc-200">{multipv}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={multipv}
              onChange={(e) => onChangeMultipv(Number(e.target.value))}
              className="w-full accent-zinc-200 cursor-pointer"
            />
          </div>
          <div>
            <div className="flex justify-between text-zinc-400 mb-1 text-[11px]">
              <span>Độ sâu (Depth)</span>
              <span className="font-mono text-zinc-200">{depth}</span>
            </div>
            <input
              type="range"
              min={8}
              max={22}
              value={depth}
              onChange={(e) => onChangeDepth(Number(e.target.value))}
              className="w-full accent-zinc-200 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Danh sách các dòng gợi ý MultiPV có màu chỉ hướng ứng với mũi tên */}
      {showEval ? (
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {analysis && analysis.lines.length > 0 ? (
            analysis.lines.map((line, i) => {
              const rankStyle = PV_RANK_STYLES[i] || PV_RANK_STYLES[2];
              return (
                <div
                  key={line.rank}
                  className="bg-zinc-950/80 hover:bg-zinc-950 border rounded px-2.5 py-1 flex items-center justify-between gap-2 group transition"
                  style={{
                    borderColor: i === 0 ? rankStyle.border : 'rgba(39, 39, 42, 0.7)',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Chấm màu khớp với mũi tên trên bàn cờ */}
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: rankStyle.dot }}
                      title={`Nhánh #${i + 1}`}
                    />
                    <span
                      className={`px-1.5 py-0.5 rounded border font-mono text-[10px] shrink-0 tabular-nums ${getScoreBadgeClass(
                        line
                      )}`}
                    >
                      {formatLineScore(line)}
                    </span>
                    <div className="truncate text-[11px] font-mono text-zinc-400">
                      <span
                        className="font-semibold mr-1.5"
                        style={{ color: i === 0 ? '#34d399' : '#f4f4f5' }}
                      >
                        {line.move_san}
                      </span>
                      <span>{line.pv_san.slice(1).join(' ')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onPlaySuggestedMove(line.move_uci)}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] flex items-center gap-0.5 shrink-0 transition cursor-pointer"
                    title="Đi nước này"
                  >
                    <span>Đi</span>
                    <ArrowUpRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="text-[11px] text-zinc-600 text-center py-2">
              {analysis?.is_game_over
                ? `Kết thúc (${analysis.result})`
                : 'Đang phân tích...'}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-zinc-600 text-center py-1">
          Đã ẩn đánh giá thế cờ
        </div>
      )}
    </div>
  );
};
