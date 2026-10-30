import React, { useState } from 'react';
import {
  AnalysisResponse,
  FeatureVisibility,
  GameConfig,
  GamePhase,
  PVLine,
} from '../types';
import { ANALYSIS_LEVEL_LABELS } from '../gameUtils';
import { PV_RANK_COLORS } from '../theme/semantic';
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
export const PV_RANK_STYLES = PV_RANK_COLORS.map((dot, i) => ({
  dot,
  label: `Top ${i + 1}`,
  border: i === 0 ? 'rgba(16, 185, 129, 0.35)' : 'var(--c-line)',
}));

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
    return 'bg-accent text-accent-ink border-line-strong font-semibold';
  }
  if (cp <= -30) {
    return 'bg-card text-ink border-line-strong font-semibold';
  }
  return 'bg-inset text-ink-2 border-line-strong';
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
    <div className="shrink-0 border-b border-line bg-panel p-3.5 space-y-3 relative">
      {/* Dòng 1: chế độ hiện tại + hành động ván đấu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded bg-card border border-line-strong text-xs font-medium text-ink shrink-0">
            {modeLabel}
          </span>
          {phase === 'playing' && (
            <span className="text-xs text-ink-2 truncate">
              Phân tích: {ANALYSIS_LEVEL_LABELS[config.analysis].label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canHint && (
            <button
              onClick={onHint}
              className="px-2 py-1 rounded-md bg-inset hover:bg-card border border-line text-xs text-amber-300 flex items-center gap-1 transition cursor-pointer"
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
              className="px-2 py-1 rounded-md bg-inset hover:bg-card disabled:opacity-40 border border-line text-xs text-ink-2 transition cursor-pointer"
              title="Yêu cầu AI đi nước tiếp theo"
            >
              {isAiThinking ? '...' : 'AI đi'}
            </button>
          )}
          {phase === 'playing' && (
            <button
              onClick={onResign}
              className="p-1.5 rounded-md bg-inset hover:bg-card border border-line text-rose-400 transition cursor-pointer"
              title="Đầu hàng"
            >
              <Flag className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onOpenConfig}
            className="p-1.5 rounded-md bg-inset hover:bg-card border border-line text-ink-2 transition cursor-pointer"
            title="Cấu hình ván đấu / ván mới"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Đang thi đấu với phân tích tắt */}
      {analysisLocked ? (
        <div className="bg-inset border border-line rounded-md px-3 py-2.5 text-xs text-ink-2 leading-relaxed">
          🔒 Phân tích đã tắt theo cấu hình chế độ chơi — không có thông tin
          engine nào hiện ra trong lúc thi đấu. Mọi công cụ sẽ mở lại khi ván
          kết thúc hoặc khi bạn đổi cấu hình.
        </div>
      ) : (
        <>
          {/* Dòng 2: Tiêu đề Phân tích & Tùy chọn hiển thị */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-ink-2">
                <span className="font-medium text-ink">Phân tích nhánh</span>
                <span className="font-mono text-ink-2">
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
                        ? 'bg-card border-line-strong text-ink'
                        : 'bg-transparent border-line text-ink-2 hover:text-ink-2'
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
                        ? 'bg-card border-line-strong text-ink'
                        : 'bg-transparent border-line text-ink-2 hover:text-ink-2'
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
                        ? 'bg-card border-line-strong text-ink'
                        : 'bg-transparent border-line text-ink-2 hover:text-ink-2'
                    }`}
                    title="Cài đặt thông số phân tích"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Thanh tỷ lệ cơ hội thắng Trắng vs Đen + điểm số trực quan */}
            {showEval && analysis && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-ink-2">
                    Trắng: <strong>{analysis.win_percent_white.toFixed(1)}%</strong>
                  </span>
                  {analysis.lines[0] && (
                    <span
                      className={`px-1.5 py-0.2 rounded border text-[10px] tabular-nums ${getScoreBadgeClass(
                        analysis.lines[0]
                      )}`}
                      title="Điểm đánh giá thế cờ hiện tại"
                    >
                      {formatLineScore(analysis.lines[0])}
                    </span>
                  )}
                  <span className="text-ink-2">
                    Đen: <strong>{(100 - analysis.win_percent_white).toFixed(1)}%</strong>
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden bg-card flex">
                  <div
                    className="bg-accent transition-all duration-300"
                    style={{ width: `${analysis.win_percent_white}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Popover chỉnh MultiPV & Depth */}
          {openEngineSettings && visibility.arrows && (
            <div className="absolute left-3 right-3 top-20 z-30 bg-overlay border border-line-strong rounded-lg shadow-2xl p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-line pb-1.5">
                <span className="font-medium text-ink">Thông số phân tích</span>
                <button
                  onClick={() => setOpenEngineSettings(false)}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div>
                <div className="flex justify-between text-ink-2 mb-1 text-xs">
                  <span>Số nhánh (MultiPV)</span>
                  <span className="font-mono text-ink">{multipv}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={multipv}
                  onChange={(e) => onChangeMultipv(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-ink-2 mb-1 text-xs">
                  <span>Độ sâu (Depth)</span>
                  <span className="font-mono text-ink">{depth}</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={22}
                  value={depth}
                  onChange={(e) => onChangeDepth(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
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
                      className="bg-inset hover:bg-inset border rounded px-2.5 py-1 flex items-center justify-between gap-2 group transition"
                      style={{
                        borderColor:
                          i === 0 ? rankStyle.border : 'var(--c-line)',
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
                        <div className="truncate text-xs font-mono text-ink-2">
                          <span
                            className="font-semibold mr-1.5"
                            style={{ color: i === 0 ? PV_RANK_COLORS[0] : 'var(--c-ink)' }}
                          >
                            {line.move_san}
                          </span>
                          <span>{line.pv_san.slice(1).join(' ')}</span>
                        </div>
                      </div>
                      {phase === 'playing' && (
                        <button
                          onClick={() => onPlaySuggestedMove(line.move_uci)}
                          className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-card hover:bg-overlay text-ink text-[11px] flex items-center gap-0.5 shrink-0 transition cursor-pointer"
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
                <div className="text-xs text-ink-2 text-center py-2">
                  {analysis?.is_game_over
                    ? `Kết thúc (${analysis.result})`
                    : 'Đang phân tích...'}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-ink-2 text-center py-1">
              Mũi tên & gợi ý tắt ở mức “{ANALYSIS_LEVEL_LABELS[config.analysis].label}”.
            </div>
          )}
        </>
      )}
    </div>
  );
};
