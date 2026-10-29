import React, { useState } from 'react';
import {
  AnalysisResponse,
  FeatureVisibility,
  GameConfig,
  GamePhase,
  PVLine,
} from '../types';
import { ANALYSIS_LEVEL_LABELS } from '../gameUtils';
import {
  Eye,
  EyeOff,
  SlidersHorizontal,
  Settings,
  Flag,
  Lightbulb,
  ArrowUpRight,
} from 'lucide-react';

interface EnginePanelProps {
  phase: GamePhase;
  config: GameConfig;
  visibility: FeatureVisibility;
  modeLabel: string;
  onOpenConfig: () => void;
  onResign: () => void;
  onHint: () => void;
  canHint: boolean;
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

// Màu định hướng đồng bộ giữa danh sách MultiPV và mũi tên trên bàn cờ
export const PV_RANK_STYLES = [
  { dot: '#10b981', label: 'Top 1', border: 'rgba(16, 185, 129, 0.35)' },
  { dot: '#38bdf8', label: 'Top 2', border: 'rgba(56, 189, 248, 0.25)' },
  { dot: '#f59e0b', label: 'Top 3', border: 'rgba(245, 158, 11, 0.25)' },
  { dot: '#a855f7', label: 'Top 4', border: 'rgba(168, 85, 247, 0.2)' },
  { dot: '#ec4899', label: 'Top 5', border: 'rgba(236, 72, 153, 0.2)' },
];

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

export const EnginePanel: React.FC<EnginePanelProps> = ({
  phase,
  config,
  visibility,
  modeLabel,
  onOpenConfig,
  onResign,
  onHint,
  canHint,
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
  const [openEngineSettings, setOpenEngineSettings] = useState(false);

  const analysisLocked = phase === 'playing' && !visibility.evalBar;

  return (
    <div className="shrink-0 border-b border-zinc-800/80 bg-[#111114] p-3.5 space-y-3 relative">
      {/* Dòng 1: chế độ hiện tại + hành động ván đấu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-100 shrink-0">
            {modeLabel}
          </span>
          {phase === 'playing' && (
            <span className="text-xs text-zinc-400 truncate">
              Phân tích: {ANALYSIS_LEVEL_LABELS[config.analysis].label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canHint && (
            <button
              onClick={onHint}
              className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-amber-300 flex items-center gap-1 transition cursor-pointer"
              title="Gợi ý nước đi tốt nhất"
            >
              <Lightbulb className="w-3 h-3" />
              Gợi ý
            </button>
          )}
          {config.opponent === 'ai' && phase === 'playing' && (
            <button
              onClick={onTriggerAiMoveNow}
              disabled={isAiThinking}
              className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-xs text-zinc-300 transition cursor-pointer"
              title="Yêu cầu AI đi nước tiếp theo"
            >
              {isAiThinking ? '...' : 'AI đi'}
            </button>
          )}
          {phase === 'playing' && (
            <button
              onClick={onResign}
              className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-rose-400 transition cursor-pointer"
              title="Đầu hàng"
            >
              <Flag className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onOpenConfig}
            className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition cursor-pointer"
            title="Cấu hình ván đấu / ván mới"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Đang thi đấu với phân tích tắt */}
      {analysisLocked ? (
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-md px-3 py-2.5 text-xs text-zinc-400 leading-relaxed">
          🔒 Phân tích đã tắt theo cấu hình chế độ chơi — không có thông tin
          engine nào hiện ra trong lúc thi đấu. Mọi công cụ sẽ mở lại khi ván
          kết thúc hoặc khi bạn đổi cấu hình.
        </div>
      ) : (
        <>
          {/* Dòng 2: Tiêu đề Phân tích & Tùy chọn hiển thị */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="font-medium text-zinc-200">Phân tích nhánh</span>
                <span className="font-mono text-zinc-400">
                  d={depth} · {multipv} PV
                </span>
                {isAnalyzing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>

              <div className="flex items-center gap-1">
                {visibility.evalBar && (
                  <button
                    onClick={onToggleEval}
                    className={`px-2 py-0.5 rounded text-xs border flex items-center gap-1 transition cursor-pointer ${
                      showEval
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                        : 'bg-transparent border-zinc-800/80 text-zinc-400 hover:text-zinc-400'
                    }`}
                  >
                    {showEval ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    Eval
                  </button>
                )}
                {visibility.arrows && (
                  <button
                    onClick={onToggleArrows}
                    className={`px-2 py-0.5 rounded text-xs border transition cursor-pointer ${
                      showArrows
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                        : 'bg-transparent border-zinc-800/80 text-zinc-400 hover:text-zinc-400'
                    }`}
                  >
                    Mũi tên
                  </button>
                )}
                {visibility.arrows && (
                  <button
                    onClick={() => setOpenEngineSettings((v) => !v)}
                    className={`p-1 rounded border transition cursor-pointer ${
                      openEngineSettings
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                        : 'bg-transparent border-zinc-800/80 text-zinc-400 hover:text-zinc-300'
                    }`}
                    title="Cài đặt thông số phân tích"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Thanh tỷ lệ cơ hội thắng Trắng vs Đen trực quan */}
            {showEval && analysis && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
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
          {openEngineSettings && visibility.arrows && (
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
                <div className="flex justify-between text-zinc-400 mb-1 text-xs">
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
                <div className="flex justify-between text-zinc-400 mb-1 text-xs">
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

          {/* Danh sách MultiPV (chỉ khi mức phân tích Đầy đủ) */}
          {visibility.arrows ? (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {analysis && analysis.lines.length > 0 ? (
                analysis.lines.map((line, i) => {
                  const rankStyle = PV_RANK_STYLES[i] || PV_RANK_STYLES[2];
                  return (
                    <div
                      key={line.rank}
                      className="bg-zinc-950/80 hover:bg-zinc-950 border rounded px-2.5 py-1 flex items-center justify-between gap-2 group transition"
                      style={{
                        borderColor:
                          i === 0 ? rankStyle.border : 'rgba(39, 39, 42, 0.7)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: rankStyle.dot }}
                          title={`Nhánh #${i + 1}`}
                        />
                        <span
                          className={`px-1.5 py-0.5 rounded border font-mono text-xs shrink-0 tabular-nums ${getScoreBadgeClass(
                            line
                          )}`}
                        >
                          {formatLineScore(line)}
                        </span>
                        <div className="truncate text-xs font-mono text-zinc-400">
                          <span
                            className="font-semibold mr-1.5"
                            style={{ color: i === 0 ? '#34d399' : '#f4f4f5' }}
                          >
                            {line.move_san}
                          </span>
                          <span>{line.pv_san.slice(1).join(' ')}</span>
                        </div>
                      </div>
                      {phase === 'playing' && (
                        <button
                          onClick={() => onPlaySuggestedMove(line.move_uci)}
                          className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-0.5 shrink-0 transition cursor-pointer"
                          title="Đi nước này"
                        >
                          <span>Đi</span>
                          <ArrowUpRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-zinc-400 text-center py-2">
                  {analysis?.is_game_over
                    ? `Kết thúc (${analysis.result})`
                    : 'Đang phân tích...'}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-zinc-400 text-center py-1">
              Mũi tên & gợi ý tắt ở mức “{ANALYSIS_LEVEL_LABELS[config.analysis].label}”.
            </div>
          )}
        </>
      )}
    </div>
  );
};
