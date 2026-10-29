import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
} from 'lucide-react';
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

/** Màu cho mức mất cơ hội thắng của một nước */
function winLossClass(winLoss: number): string {
  if (winLoss >= 5) return 'text-rose-400';
  if (winLoss >= 2) return 'text-orange-300';
  if (winLoss >= 0.5) return 'text-amber-300';
  return 'text-zinc-400';
}

/** Chip định hướng bên chơi: ô màu + nhãn Trắng/Đen */
const SideChip: React.FC<{ side: 'w' | 'b'; children?: React.ReactNode }> = ({
  side,
  children,
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      className={`w-2.5 h-2.5 rounded-sm border inline-block shrink-0 ${
        side === 'w'
          ? 'bg-zinc-100 border-zinc-300'
          : 'bg-zinc-800 border-zinc-600'
      }`}
    />
    {children}
  </span>
);

/** Tiêu đề khối phân tách */
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
      {children}
    </span>
    <span className="flex-1 h-px bg-zinc-800/80" />
  </div>
);

/**
 * Chế độ "Phân tích ván đấu" của sidebar. Gồm các khối phân tách rõ ràng:
 * tổng quan (accuracy + thống kê), bảng nước đi có sticky header & % mất
 * cơ hội, và khối chi tiết nước đang chọn với các nước thay thế + gain.
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
  const detailPlyRef = useRef<number>(-1);

  const selectedMove = currentPly > 0 ? moves[currentPly - 1] : null;

  // Đổi nước chọn -> tự phân tích thế cờ trước nước đó (MultiPV gợi ý thay thế)
  useEffect(() => {
    setDetail(null);
    const mv = currentPly > 0 ? moves[currentPly - 1] : null;
    if (!mv) {
      detailPlyRef.current = -1;
      setDetailLoading(false);
      return;
    }
    detailPlyRef.current = currentPly;
    let cancelled = false;
    setDetailLoading(true);
    analyzePosition(mv.fenBefore, 14, 3)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        // bỏ qua — người dùng có thể bấm "Phân tích lại"
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPly]);

  const runDetailAnalysis = async () => {
    if (!selectedMove) return;
    detailPlyRef.current = currentPly;
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

  // Win% (theo góc nhìn Trắng) trước nước đi, suy ra từ sau + mức mất
  const afterWin = selectedMove?.winPercentWhite;
  const winLoss = selectedMove?.winLoss;
  const beforeWin =
    afterWin !== undefined && winLoss !== undefined
      ? selectedMove!.turn === 'w'
        ? afterWin + winLoss
        : afterWin - winLoss
      : null;

  // Góc nhìn bên đi nước: gain dương = nước tốt hơn nước đã đi
  const moverWin = (winWhite: number) =>
    selectedMove!.turn === 'w' ? winWhite : 100 - winWhite;
  const playedMoverWin =
    afterWin !== undefined ? moverWin(afterWin) : null;

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
        className={`text-left px-2 py-1 rounded font-mono text-xs flex items-center gap-1.5 w-full transition cursor-pointer ${
          currentPly === m.ply
            ? 'bg-zinc-700 text-zinc-50 font-semibold ring-1 ring-zinc-500'
            : 'text-zinc-300 hover:bg-zinc-800/70'
        }`}
      >
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${
            m.color ? '' : 'bg-transparent'
          }`}
          style={m.color ? { backgroundColor: m.color } : undefined}
          title={m.classification}
        />
        <span className="truncate">{m.san}</span>
        <span className="flex-1" />
        {m.winLoss !== undefined && (
          <span
            className={`shrink-0 text-[10px] font-mono tabular-nums ${winLossClass(
              m.winLoss
            )}`}
            title={`Mất ${m.winLoss.toFixed(1)}% cơ hội thắng`}
          >
            −{m.winLoss.toFixed(1)}
          </span>
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
            <span className="flex items-center gap-2.5 text-xs font-mono text-zinc-300 truncate">
              <SideChip side="w">{reviewResult.white_accuracy}%</SideChip>
              <span className="text-zinc-400">·</span>
              <SideChip side="b">{reviewResult.black_accuracy}%</SideChip>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRunReview}
            disabled={isReviewing || moves.length === 0}
            className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-white disabled:bg-zinc-900 disabled:text-zinc-400 text-xs font-medium text-zinc-950 transition cursor-pointer"
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
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-400 px-6 text-center">
          Chưa có nước đi nào để phân tích.
        </div>
      ) : (
        <>
          {/* ===== KHỐI 1: Tổng quan ===== */}
          <div className="shrink-0 p-3 space-y-2.5 border-b border-zinc-800/80 bg-zinc-950/40">
            <SectionTitle>Tổng quan</SectionTitle>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-zinc-950 rounded-lg border border-zinc-800/80 py-2">
                <div className="text-[11px] text-zinc-400 flex items-center justify-center">
                  <SideChip side="w">
                    <span className="text-zinc-300">Trắng</span>
                  </SideChip>
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {reviewResult ? `${reviewResult.white_accuracy}%` : '—'}
                </div>
              </div>
              <div className="bg-zinc-950 rounded-lg border border-zinc-800/80 py-2">
                <div className="text-[11px] text-zinc-400 flex items-center justify-center">
                  <SideChip side="b">
                    <span className="text-zinc-300">Đen</span>
                  </SideChip>
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {reviewResult ? `${reviewResult.black_accuracy}%` : '—'}
                </div>
              </div>
            </div>
            {reviewResult ? (
              <div className="bg-zinc-950 rounded-lg border border-zinc-800/80 px-2.5 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {CLASS_ORDER.map((item) => {
                  const wCount = reviewResult.counts.w[item.key] ?? 0;
                  const bCount = reviewResult.counts.b[item.key] ?? 0;
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      <span
                        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full font-mono text-[10px] font-bold text-zinc-950 shrink-0"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.symbol}
                      </span>
                      <span className="text-zinc-400 truncate flex-1">
                        {item.label}
                      </span>
                      <span className="font-mono text-zinc-300 shrink-0 flex items-center gap-1">
                        <SideChip side="w">
                          <span className="tabular-nums">{wCount}</span>
                        </SideChip>
                        <SideChip side="b">
                          <span className="tabular-nums">{bCount}</span>
                        </SideChip>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              !isReviewing && (
                <div className="text-xs text-zinc-400 leading-relaxed text-center py-1">
                  Chưa có dữ liệu. Bấm{' '}
                  <strong className="text-zinc-300">Chấm điểm</strong> để engine
                  đánh giá từng nước.
                </div>
              )
            )}
          </div>

          {/* ===== Hai pane: bảng nước | chi tiết ===== */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
            {/* KHỐI 2: Bảng nước đi với sticky header */}
            <div className="min-h-0 flex flex-col border-r border-zinc-800/60">
              <div className="shrink-0 sticky top-0 z-10 bg-[#15151a] grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1.5 px-2.5 py-1.5 border-b border-zinc-800/80">
                <span className="text-[10px] font-mono text-zinc-400">#</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-zinc-100 border border-zinc-400 inline-block" />
                  Trắng
                </span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-zinc-800 border border-zinc-600 inline-block" />
                  Đen
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {pairs.map((pair) => (
                  <div
                    key={pair.moveNumber}
                    className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1.5 px-2.5 py-1 border-b border-zinc-900/60 hover:bg-zinc-900/30"
                  >
                    <span className="text-zinc-400 font-mono text-[11px] tabular-nums">
                      {pair.moveNumber}.
                    </span>
                    {renderMoveCell(pair.white)}
                    {renderMoveCell(pair.black)}
                  </div>
                ))}
              </div>
            </div>

            {/* KHỐI 3: Chi tiết nước đang chọn */}
            <div className="min-h-0 overflow-y-auto p-3 space-y-3">
              {!selectedMove ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400 text-center px-3">
                  Chọn một nước trong bảng (hoặc bấm ←/→) để xem chi tiết.
                </div>
              ) : (
                <>
                  {/* Khối: nước đang chọn */}
                  <div className="bg-zinc-950/60 rounded-lg border border-zinc-800/80 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {selectedMove.classification ? (
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-zinc-950 shrink-0"
                            style={{ backgroundColor: selectedMove.color }}
                          >
                            {selectedMove.symbol}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-zinc-400 shrink-0 border border-zinc-700"
                            title="Chưa chấm điểm"
                          >
                            ?
                          </span>
                        )}
                        <span className="font-mono font-bold text-white text-sm truncate">
                          {selectedMove.moveNumber}
                          {selectedMove.turn === 'w' ? '.' : '...'}{' '}
                          {selectedMove.san}
                        </span>
                        <span className="text-[11px] text-zinc-400 shrink-0 flex items-center gap-1">
                          (<SideChip side={selectedMove.turn} />)
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

                    {beforeWin !== null && afterWin !== undefined ? (
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
                            Mất {(selectedMove.winLoss ?? 0).toFixed(1)}% cơ hội
                            thắng
                          </span>
                          {selectedMove.accuracy !== undefined && (
                            <span className="text-zinc-400">
                              Chuẩn {selectedMove.accuracy}%
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-400 leading-relaxed">
                        Nước này chưa được chấm điểm. Bấm{' '}
                        <strong className="text-zinc-300">Chấm điểm</strong> để
                        xem phân loại &amp; độ chính xác.
                      </div>
                    )}
                  </div>

                  {/* Khối: các nước thay thế + gain */}
                  <div className="bg-zinc-950/60 rounded-lg border border-zinc-800/80 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
                        Các nước thay thế
                      </span>
                      <button
                        onClick={runDetailAnalysis}
                        disabled={detailLoading}
                        className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1 disabled:opacity-50 transition cursor-pointer"
                        title="Chạy lại engine cho thế cờ trước nước này"
                      >
                        {detailLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Phân tích lại
                      </button>
                    </div>

                    {detailLoading && !detail ? (
                      <div className="text-[11px] text-zinc-400 font-mono text-center py-3 flex items-center justify-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang phân tích thế cờ...
                      </div>
                    ) : detail && detail.lines.length > 0 ? (
                      <>
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 gap-y-1 items-center text-[10px] uppercase tracking-wide text-zinc-400 px-0.5 pb-1 border-b border-zinc-900">
                          <span />
                          <span>Nước</span>
                          <span className="text-right">Điểm</span>
                          <span className="text-right w-[4.5rem]">
                            Gain
                          </span>
                        </div>
                        {detail.lines.map((line, i) => {
                          const isPlayed = line.move_uci === selectedMove.uci;
                          const gain =
                            playedMoverWin !== null
                              ? moverWin(line.win_percent_white) -
                                playedMoverWin
                              : null;
                          return (
                            <div
                              key={line.rank}
                              className={`grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center rounded px-1.5 py-1.5 border ${
                                isPlayed
                                  ? 'bg-zinc-900/80 border-zinc-700'
                                  : 'bg-zinc-950/80 border-zinc-800/70'
                              }`}
                              title={line.pv_san.slice(0, 8).join(' ')}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    PV_RANK_COLORS[i] ?? '#10b981',
                                }}
                              />
                              <span className="text-xs font-mono text-zinc-300 truncate">
                                <span
                                  className={`font-semibold mr-1.5 ${
                                    isPlayed ? 'text-sky-300' : 'text-zinc-100'
                                  }`}
                                >
                                  {line.move_san}
                                </span>
                                <span className="text-zinc-400">
                                  {line.pv_san.slice(1, 5).join(' ')}
                                </span>
                                {isPlayed && (
                                  <span className="ml-1.5 text-[10px] text-sky-300/90 not-italic font-sans">
                                    (đã đi)
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-[11px] text-zinc-300 shrink-0 tabular-nums text-right">
                                {formatScore(line)}
                              </span>
                              <span className="text-right w-[4.5rem] shrink-0">
                                {gain === null ? (
                                  <span className="text-zinc-400 text-[11px] font-mono">
                                    —
                                  </span>
                                ) : isPlayed ? (
                                  <span className="text-[11px] font-mono text-zinc-400">
                                    chuẩn
                                  </span>
                                ) : (
                                  <span
                                    className={`text-[11px] font-mono font-semibold tabular-nums ${
                                      gain >= 0.5
                                        ? 'text-emerald-400'
                                        : gain <= -0.5
                                        ? 'text-rose-400'
                                        : 'text-zinc-400'
                                    }`}
                                    title={`${
                                      gain >= 0 ? 'Hơn' : 'Kém'
                                    } ${Math.abs(gain).toFixed(1)}% cơ hội thắng so với nước đã đi`}
                                  >
                                    {gain >= 0 ? '+' : '−'}
                                    {Math.abs(gain).toFixed(1)}%
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                        <div className="text-[10px] text-zinc-400 text-right font-mono">
                          depth ~{detail.lines[0]?.depth ?? '—'} · gain tính
                          theo % cơ hội thắng của{' '}
                          {selectedMove.turn === 'w' ? 'Trắng' : 'Đen'}
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-zinc-400 text-center py-1">
                        {detail
                          ? `Thế cờ đã kết thúc (${detail.result}).`
                          : 'Không phân tích được thế cờ này.'}
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
