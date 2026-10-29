import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Search, Loader2 } from 'lucide-react';
import { analyzePosition } from '../api';
import {
  AnalysisResponse,
  GameReviewResult,
  MoveRecord,
} from '../types';

interface ReviewScreenProps {
  onClose: () => void;
  moves: MoveRecord[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  reviewResult: GameReviewResult | null;
  isReviewing: boolean;
  reviewProgress: { done: number; total: number } | null;
  onRunReview: () => void;
}

const CLASS_ORDER: Array<{
  key: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
  label: string;
  symbol: string;
  color: string;
}> = [
  { key: 'Best', label: 'Tốt nhất', symbol: '★', color: '#34d399' },
  { key: 'Excellent', label: 'Xuất sắc', symbol: '!', color: '#2dd4bf' },
  { key: 'Good', label: 'Hợp lý', symbol: '✓', color: '#60a5fa' },
  { key: 'Inaccuracy', label: 'Chưa chuẩn', symbol: '?!', color: '#facc15' },
  { key: 'Mistake', label: 'Sai lầm', symbol: '?', color: '#fb923c' },
  { key: 'Blunder', label: 'Ngớ ngẩn', symbol: '??', color: '#f87171' },
];

const PV_RANK_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a855f7', '#ec4899'];

function formatScore(line: { cp: number | null; mate: number | null }): string {
  if (line.mate !== null && line.mate !== undefined) {
    return line.mate > 0 ? `+M${line.mate}` : `-M${Math.abs(line.mate)}`;
  }
  if (line.cp !== null && line.cp !== undefined) {
    const val = (line.cp / 100).toFixed(2);
    return line.cp > 0 ? `+${val}` : val;
  }
  return '0.00';
}

/**
 * Chế độ "Phân tích ván đấu" của sidebar: tổng quan accuracy + thống kê,
 * danh sách nước có badge, panel chi tiết từng nước với phân tích lại
 * thế cờ theo yêu cầu (PV lines). Bàn cờ bên trái vẫn đồng bộ theo nước chọn.
 */
export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  onClose,
  moves,
  currentPly,
  onSelectPly,
  reviewResult,
  isReviewing,
  reviewProgress,
  onRunReview,
}) => {
  const [detail, setDetail] = useState<AnalysisResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedMove = currentPly > 0 ? moves[currentPly - 1] : null;

  // Đổi nước chọn -> xóa phân tích chi tiết cũ
  useEffect(() => {
    setDetail(null);
  }, [currentPly]);

  const runDetailAnalysis = async () => {
    if (!selectedMove) return;
    setDetailLoading(true);
    try {
      const res = await analyzePosition(selectedMove.fenBefore, 14, 3);
      setDetail(res);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Win% trước nước đi (suy ra từ sau + mức mất)
  const afterWin = selectedMove?.winPercentWhite;
  const winLoss = selectedMove?.winLoss;
  const beforeWin =
    afterWin !== undefined && winLoss !== undefined
      ? selectedMove!.turn === 'w'
        ? afterWin + winLoss
        : afterWin - winLoss
      : null;

  // Danh sách nước theo cặp
  const pairs: Array<{ moveNumber: number; white?: MoveRecord; black?: MoveRecord }> =
    [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  const renderMoveCell = (m?: MoveRecord) =>
    m ? (
      <button
        onClick={() => onSelectPly(m.ply)}
        className={`text-left px-2 py-1 rounded font-mono text-xs flex items-center justify-between gap-1.5 w-full transition cursor-pointer ${
          currentPly === m.ply
            ? 'bg-zinc-700 text-zinc-50 font-semibold ring-1 ring-zinc-500'
            : 'text-zinc-300 hover:bg-zinc-800/70'
        }`}
      >
        <span className="truncate">{m.san}</span>
        {m.classification && m.color && (
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: m.color }}
            title={m.classification}
          />
        )}
      </button>
    ) : (
      <span />
    );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#111114] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100 shrink-0">
            Phân tích ván đấu
          </h3>
          {isReviewing ? (
            <span className="flex items-center gap-1 text-xs font-mono text-emerald-400 truncate">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              {reviewProgress
                ? `${reviewProgress.done}/${reviewProgress.total} nước`
                : 'Đang chấm...'}
            </span>
          ) : reviewResult ? (
            <span className="text-xs font-mono text-zinc-400 truncate">
              W {reviewResult.white_accuracy}% · B {reviewResult.black_accuracy}%
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRunReview}
            disabled={isReviewing || moves.length === 0}
            className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-white disabled:bg-zinc-900 disabled:text-zinc-600 text-xs font-medium text-zinc-950 transition cursor-pointer"
          >
            {isReviewing
              ? 'Đang chấm...'
              : reviewResult
              ? 'Chấm lại'
              : 'Chấm điểm'}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
            title="Thoát chế độ phân tích"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {moves.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-600 px-6 text-center">
          Chưa có nước đi nào để phân tích.
        </div>
      ) : (
        <>
          {/* Tổng quan: accuracy + thống kê nước đi */}
          <div className="shrink-0 p-3 space-y-2.5 border-b border-zinc-800/80">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-zinc-950 rounded-lg border border-zinc-800/80 py-2">
                <div className="text-[11px] text-zinc-400">⬜ Trắng</div>
                <div className="text-xl font-mono font-bold text-emerald-400">
                  {reviewResult ? `${reviewResult.white_accuracy}%` : '—'}
                </div>
              </div>
              <div className="bg-zinc-950 rounded-lg border border-zinc-800/80 py-2">
                <div className="text-[11px] text-zinc-400">⬛ Đen</div>
                <div className="text-xl font-mono font-bold text-emerald-400">
                  {reviewResult ? `${reviewResult.black_accuracy}%` : '—'}
                </div>
              </div>
            </div>
            {reviewResult ? (
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                {CLASS_ORDER.map((item) => {
                  const wCount = reviewResult.counts.w[item.key] ?? 0;
                  const bCount = reviewResult.counts.b[item.key] ?? 0;
                  return (
                    <div key={item.key} className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full font-mono text-[10px] font-bold text-zinc-950 shrink-0"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.symbol}
                      </span>
                      <span className="text-zinc-400 truncate flex-1">
                        {item.label}
                      </span>
                      <span className="font-mono text-zinc-300 shrink-0">
                        {wCount}·{bCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              !isReviewing && (
                <div className="text-xs text-zinc-500 leading-relaxed text-center py-1">
                  Chưa có dữ liệu. Bấm <strong className="text-zinc-300">Chấm điểm</strong>{' '}
                  để engine đánh giá từng nước.
                </div>
              )
            )}
          </div>

          {/* Hai pane: danh sách nước | chi tiết */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
            {/* Danh sách nước */}
            <div className="min-h-0 overflow-y-auto border-r border-zinc-800/60">
              {pairs.map((pair) => (
                <div
                  key={pair.moveNumber}
                  className="grid grid-cols-[2.4rem_1fr_1fr] items-center gap-1.5 px-2.5 py-1 border-b border-zinc-900/60 hover:bg-zinc-900/30"
                >
                  <span className="text-zinc-600 font-mono text-[11px] tabular-nums">
                    {pair.moveNumber}.
                  </span>
                  {renderMoveCell(pair.white)}
                  {renderMoveCell(pair.black)}
                </div>
              ))}
            </div>

            {/* Chi tiết nước đang chọn */}
            <div className="min-h-0 overflow-y-auto p-3 space-y-3">
              {!selectedMove ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-600 text-center px-3">
                  Chọn một nước trong danh sách (hoặc bấm ←/→) để xem chi tiết.
                </div>
              ) : !selectedMove.classification ? (
                <div className="space-y-3 text-center py-4">
                  <div className="font-mono text-sm text-zinc-200">
                    {selectedMove.moveNumber}
                    {selectedMove.turn === 'w' ? '.' : '...'} {selectedMove.san}
                  </div>
                  <div className="text-xs text-zinc-500 leading-relaxed">
                    Nước này chưa được chấm điểm. Bấm{' '}
                    <strong className="text-zinc-300">Chấm điểm</strong> để xem phân
                    loại &amp; độ chính xác từng nước.
                  </div>
                </div>
              ) : (
                <>
                  {/* Header nước đi + điều hướng */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-zinc-950 shrink-0"
                        style={{ backgroundColor: selectedMove.color }}
                      >
                        {selectedMove.symbol}
                      </span>
                      <span className="font-mono font-bold text-white text-sm truncate">
                        {selectedMove.moveNumber}
                        {selectedMove.turn === 'w' ? '.' : '...'} {selectedMove.san}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onSelectPly(Math.max(1, currentPly - 1))}
                        disabled={currentPly <= 1}
                        className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 text-zinc-300 cursor-pointer"
                        title="Nước trước"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          onSelectPly(Math.min(moves.length, currentPly + 1))
                        }
                        disabled={currentPly >= moves.length}
                        className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 text-zinc-300 cursor-pointer"
                        title="Nước sau"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Thanh win% trước/sau */}
                  {beforeWin !== null && afterWin !== undefined && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                        <span>Trước: {beforeWin.toFixed(1)}%</span>
                        <span>Sau: {afterWin.toFixed(1)}%</span>
                      </div>
                      <div className="relative w-full h-3.5 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                        <div
                          className="absolute inset-y-0 bg-zinc-200"
                          style={{ width: `${beforeWin}%` }}
                        />
                        <div
                          className="absolute inset-y-0 w-[2px] bg-sky-400"
                          style={{ left: `${afterWin}%` }}
                          title={`Sau khi đi: ${afterWin.toFixed(1)}%`}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono">
                        <span
                          className={
                            (selectedMove.winLoss ?? 0) > 1
                              ? 'text-rose-300'
                              : 'text-emerald-300'
                          }
                        >
                          Mất {(selectedMove.winLoss ?? 0).toFixed(1)}% cơ hội thắng
                        </span>
                        <span className="text-zinc-400">
                          Chuẩn {selectedMove.accuracy}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Nước tối ưu */}
                  {selectedMove.bestMoveSan &&
                    selectedMove.bestMoveUci !== selectedMove.uci && (
                      <div className="bg-zinc-950 rounded-md border border-zinc-800/80 px-3 py-2 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">
                          Nước tối ưu
                        </span>
                        <span className="text-[13px] font-mono font-bold text-emerald-400">
                          {selectedMove.bestMoveSan}
                        </span>
                      </div>
                    )}

                  {/* Phân tích lại thế cờ */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-600">
                        Phân tích thế cờ trước nước này
                      </span>
                      <button
                        onClick={runDetailAnalysis}
                        disabled={detailLoading}
                        className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1 disabled:opacity-50 transition cursor-pointer"
                      >
                        {detailLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Search className="w-3 h-3" />
                        )}
                        {detail ? 'Phân tích lại' : 'Phân tích'}
                      </button>
                    </div>
                    {detail?.lines.map((line, i) => (
                      <div
                        key={line.rank}
                        className="bg-zinc-950/80 border border-zinc-800/70 rounded px-2 py-1.5 flex items-center gap-2"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: PV_RANK_COLORS[i] ?? '#10b981',
                          }}
                        />
                        <span className="font-mono text-[11px] text-zinc-300 shrink-0 tabular-nums">
                          {formatScore(line)}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400 truncate">
                          <span className="font-semibold text-zinc-200 mr-1">
                            {line.move_san}
                          </span>
                          {line.pv_san.slice(1).join(' ')}
                        </span>
                      </div>
                    ))}
                    {detail && detail.lines.length === 0 && (
                      <div className="text-[11px] text-zinc-600 text-center py-1">
                        Thế cờ đã kết thúc ({detail.result}).
                      </div>
                    )}
                    {detail && (
                      <div className="text-[10px] text-zinc-600 text-right font-mono">
                        depth ~{detail.lines[0]?.depth ?? '—'} · MultiPV{' '}
                        {detail.lines.length}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
