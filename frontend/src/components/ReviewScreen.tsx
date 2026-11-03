import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { analyzePosition } from '../api';
import {
  AnalysisResponse,
  GameReviewResult,
  MoveRecord,
  PVLine,
} from '../types';
import {
  CLASSIFICATION_META,
  CLASSIFICATION_ORDER,
  PV_RANK_COLORS,
} from '../theme/semantic';

interface ReviewScreenProps {
  onClose: () => void;
  moves: MoveRecord[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  reviewResult: GameReviewResult | null;
  isReviewing: boolean;
  reviewProgress: { done: number; total: number } | null;
  onRunReview: () => void;
  onUpdateReviewLines?: (lines: PVLine[] | null) => void;
  onTryAlternativeMove?: (plyBefore: number, uci: string) => void;
  arrowMode?: 'played' | 'suggestions';
  onChangeArrowMode?: (mode: 'played' | 'suggestions') => void;
}

const CLASS_ORDER = CLASSIFICATION_ORDER.map((key) => {
  const m = CLASSIFICATION_META[key];
  return {
    key,
    label: m.viLabel.split(' (')[0],
    symbol: m.symbol,
    color: m.color,
  };
});

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
  return 'text-ink-2';
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
          ? 'bg-sq-w border-line-strong'
          : 'bg-sq-b border-line-strong'
      }`}
    />
    {children}
  </span>
);

/** Tiêu đề khối phân tách */
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2">
    <span className="font-display text-[11px] font-semibold text-ink-2">
      {children}
    </span>
    <span className="flex-1 h-px bg-line" />
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
  onUpdateReviewLines,
  onTryAlternativeMove,
  arrowMode = 'played',
  onChangeArrowMode,
}) => {
  const [detail, setDetail] = useState<AnalysisResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailPlyRef = useRef<number>(-1);

  const selectedMove = currentPly > 0 ? moves[currentPly - 1] : null;

  useEffect(() => {
    onUpdateReviewLines?.(detail?.lines ?? null);
  }, [detail, onUpdateReviewLines]);

  useEffect(() => {
    return () => {
      onUpdateReviewLines?.(null);
    };
  }, [onUpdateReviewLines]);

  // Đổi nước chọn -> tự phân tích thế cờ trước nước đó (MultiPV gợi ý thay thế)
  const currentFenBefore = currentPly > 0 ? moves[currentPly - 1]?.fenBefore : null;
  useEffect(() => {
    setDetail(null);
    const mv = currentPly > 0 ? moves[currentPly - 1] : null;
    if (!mv || !mv.fenBefore) {
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
  }, [currentPly, currentFenBefore]);

  const runDetailAnalysis = async () => {
    if (!selectedMove || !selectedMove.fenBefore) return;
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
  const afterWin =
    typeof selectedMove?.winPercentWhite === 'number' && Number.isFinite(selectedMove.winPercentWhite)
      ? selectedMove.winPercentWhite
      : undefined;
  const winLoss =
    typeof selectedMove?.winLoss === 'number' && Number.isFinite(selectedMove.winLoss)
      ? selectedMove.winLoss
      : undefined;
  const beforeWin =
    afterWin !== undefined && winLoss !== undefined && selectedMove
      ? selectedMove.turn === 'w'
        ? afterWin + winLoss
        : afterWin - winLoss
      : null;

  // Góc nhìn bên đi nước: gain dương = nước tốt hơn nước đã đi
  const moverWin = (winWhite: number) =>
    selectedMove ? (selectedMove.turn === 'w' ? winWhite : 100 - winWhite) : winWhite;
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

  const renderMoveCell = (m?: MoveRecord) => {
    const badgeColor =
      (m?.classification && CLASSIFICATION_META[m.classification]?.color) ||
      m?.color;
    const hasWinLoss = typeof m?.winLoss === 'number' && Number.isFinite(m.winLoss);
    return m ? (
      <button
        onClick={() => onSelectPly(m.ply)}
        className={`text-left px-2 py-1 rounded font-mono text-xs flex items-center gap-1.5 w-full transition cursor-pointer ${
          currentPly === m.ply
            ? 'bg-overlay text-ink font-semibold ring-1 ring-line-strong'
            : 'text-ink-2 hover:bg-card'
        }`}
      >
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${
            badgeColor ? '' : 'bg-transparent'
          }`}
          style={badgeColor ? { backgroundColor: badgeColor } : undefined}
          title={m.classification}
        />
        <span className="truncate">{m.san}</span>
        <span className="flex-1" />
        {hasWinLoss && (
          <span
            className={`shrink-0 text-[10px] font-mono tabular-nums ${winLossClass(
              m.winLoss!
            )}`}
            title={`Mất ${m.winLoss!.toFixed(1)}% cơ hội thắng`}
          >
            −{m.winLoss!.toFixed(1)}
          </span>
        )}
      </button>
    ) : (
      <span />
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-panel overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-3 border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="font-display text-base font-semibold text-ink shrink-0">
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
            <span className="flex items-center gap-2.5 text-xs font-mono text-ink-2 truncate">
              <SideChip side="w">{reviewResult.white_accuracy}%</SideChip>
              <span className="text-ink-2">·</span>
              <SideChip side="b">{reviewResult.black_accuracy}%</SideChip>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRunReview}
            disabled={isReviewing || moves.length === 0}
            className="px-2.5 py-1 rounded bg-accent hover:opacity-90 disabled:bg-inset disabled:text-ink-2 text-xs font-medium text-accent-ink transition cursor-pointer"
          >
            {isReviewing
              ? 'Đang chấm...'
              : reviewResult
              ? 'Chấm lại'
              : 'Chấm điểm'}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-card text-ink-2 hover:text-ink cursor-pointer"
            title="Thoát chế độ phân tích"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {moves.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-ink-2 px-6 text-center">
          Chưa có nước đi nào để phân tích.
        </div>
      ) : (
        <>
          {/* ===== KHỐI 1: Tổng quan ===== */}
          <div className="shrink-0 p-3 space-y-2.5 border-b border-line bg-inset/40">
            <SectionTitle>Tổng quan</SectionTitle>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-inset rounded-lg border border-line py-2">
                <div className="text-[11px] text-ink-2 flex items-center justify-center">
                  <SideChip side="w">
                    <span className="text-ink-2">Trắng</span>
                  </SideChip>
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {reviewResult ? `${reviewResult.white_accuracy}%` : '—'}
                </div>
              </div>
              <div className="bg-inset rounded-lg border border-line py-2">
                <div className="text-[11px] text-ink-2 flex items-center justify-center">
                  <SideChip side="b">
                    <span className="text-ink-2">Đen</span>
                  </SideChip>
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {reviewResult ? `${reviewResult.black_accuracy}%` : '—'}
                </div>
              </div>
            </div>
            {reviewResult ? (
              <div className="bg-inset rounded-lg border border-line px-2.5 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {CLASS_ORDER.map((item) => {
                  const wCount =
                    reviewResult.counts?.w?.[item.key] ??
                    (reviewResult.counts as unknown as Record<string, number>)?.[item.key] ??
                    0;
                  const bCount =
                    reviewResult.counts?.b?.[item.key] ??
                    0;
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      <span
                        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full font-mono text-[10px] font-bold text-accent-ink shrink-0"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.symbol}
                      </span>
                      <span className="text-ink-2 truncate flex-1">
                        {item.label}
                      </span>
                      <span className="font-mono text-ink-2 shrink-0 flex items-center gap-1">
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
                <div className="text-xs text-ink-2 leading-relaxed text-center py-1">
                  Chưa có dữ liệu. Bấm{' '}
                  <strong className="text-ink-2">Chấm điểm</strong> để engine
                  đánh giá từng nước.
                </div>
              )
            )}
          </div>

          {/* ===== Hai pane: bảng nước | chi tiết ===== */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
            {/* KHỐI 2: Bảng nước đi với sticky header */}
            <div className="min-h-0 flex flex-col border-r border-line">
              <div className="shrink-0 sticky top-0 z-10 bg-overlay grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1.5 px-2.5 py-1.5 border-b border-line">
                <span className="text-[10px] font-mono text-ink-2">#</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-2 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sq-w border border-line-strong inline-block" />
                  Trắng
                </span>
                <span className="text-[10px] uppercase tracking-wide text-ink-2 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sq-b border border-line-strong inline-block" />
                  Đen
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {pairs.map((pair) => (
                  <div
                    key={pair.moveNumber}
                    className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1.5 px-2.5 py-1 border-b border-line hover:bg-card"
                  >
                    <span className="text-ink-2 font-mono text-[11px] tabular-nums">
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
                <div className="h-full flex items-center justify-center text-xs text-ink-2 text-center px-3">
                  Chọn một nước trong bảng (hoặc bấm ←/→) để xem chi tiết.
                </div>
              ) : (
                <>
                  {/* Chuyển chế độ hiển thị mũi tên trên bàn cờ */}
                  <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-inset border border-line">
                    <span className="text-[11px] text-ink-2 font-medium pl-1">
                      Mũi tên bàn cờ:
                    </span>
                    <div className="inline-flex bg-panel p-0.5 rounded-md border border-line text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => onChangeArrowMode?.('played')}
                        className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1.5 ${
                          arrowMode === 'played'
                            ? 'bg-accent text-accent-ink font-semibold shadow-xs'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                        title="Hiển thị thế cờ và mũi tên của nước đi vừa diễn ra"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Nước vừa diễn ra
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeArrowMode?.('suggestions')}
                        className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1.5 ${
                          arrowMode === 'suggestions'
                            ? 'bg-accent text-accent-ink font-semibold shadow-xs'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                        title="Hiển thị thế cờ trước nước đi kèm các mũi tên gợi ý của engine"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Các nước gợi ý
                      </button>
                    </div>
                  </div>

                  {/* Khối: nước đang chọn */}
                  <div className="bg-inset rounded-lg border border-line p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {selectedMove.classification ? (
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-accent-ink shrink-0"
                            style={{
                              backgroundColor:
                                CLASSIFICATION_META[selectedMove.classification]
                                  ?.color || selectedMove.color,
                            }}
                          >
                            {selectedMove.symbol}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-ink-2 shrink-0 border border-line-strong"
                            title="Chưa chấm điểm"
                          >
                            ?
                          </span>
                        )}
                        <span className="font-mono font-bold text-ink text-sm truncate">
                          {selectedMove.moveNumber}
                          {selectedMove.turn === 'w' ? '.' : '...'}{' '}
                          {selectedMove.san}
                        </span>
                        <span className="text-[11px] text-ink-2 shrink-0 flex items-center gap-1">
                          (<SideChip side={selectedMove.turn} />)
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onSelectPly(Math.max(1, currentPly - 1))}
                          disabled={currentPly <= 1}
                          className="p-1 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 cursor-pointer"
                          title="Nước trước"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            onSelectPly(Math.min(moves.length, currentPly + 1))
                          }
                          disabled={currentPly >= moves.length}
                          className="p-1 rounded bg-inset hover:bg-card disabled:opacity-30 border border-line text-ink-2 cursor-pointer"
                          title="Nước sau"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {beforeWin !== null && afterWin !== undefined ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-ink-2">
                          <span>Trước: {beforeWin.toFixed(1)}%</span>
                          <span>Sau: {afterWin.toFixed(1)}%</span>
                        </div>
                        <div className="relative w-full h-3.5 rounded-full bg-inset border border-line overflow-hidden">
                          <div
                            className="absolute inset-y-0 bg-accent"
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
                            <span className="text-ink-2">
                              Chuẩn {selectedMove.accuracy}%
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-ink-2 leading-relaxed">
                        Nước này chưa được chấm điểm. Bấm{' '}
                        <strong className="text-ink-2">Chấm điểm</strong> để
                        xem phân loại &amp; độ chính xác.
                      </div>
                    )}
                  </div>

                  {/* Khối: các nước thay thế + gain */}
                  <div className="bg-inset rounded-lg border border-line p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-ink-2 font-semibold">
                        Các nước thay thế
                      </span>
                      <button
                        onClick={runDetailAnalysis}
                        disabled={detailLoading}
                        className="px-2 py-0.5 rounded bg-inset hover:bg-card border border-line text-[11px] text-ink-2 flex items-center gap-1 disabled:opacity-50 transition cursor-pointer"
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
                      <div className="text-[11px] text-ink-2 font-mono text-center py-3 flex items-center justify-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang phân tích thế cờ...
                      </div>
                    ) : detail && detail.lines.length > 0 ? (
                      <div className="space-y-2">
                        {detail.lines.map((line, i) => {
                          const isPlayed = selectedMove ? line.move_uci === selectedMove.uci : false;
                          const playedWin =
                            playedMoverWin !== null
                              ? playedMoverWin
                              : typeof selectedMove?.winPercentWhite === 'number' && Number.isFinite(selectedMove.winPercentWhite)
                              ? moverWin(selectedMove.winPercentWhite)
                              : selectedMove
                              ? (() => {
                                  const matching = detail.lines.find((l) => l.move_uci === selectedMove.uci);
                                  return matching && Number.isFinite(matching.win_percent_white)
                                    ? moverWin(matching.win_percent_white)
                                    : null;
                                })()
                              : null;
                          const gain =
                            playedWin !== null && Number.isFinite(line.win_percent_white)
                              ? moverWin(line.win_percent_white) - playedWin
                              : null;
                          return (
                            <div
                              key={line.rank}
                              className={`rounded-lg border p-2.5 space-y-1.5 transition ${
                                isPlayed
                                  ? 'bg-card border-sky-400/40 ring-1 ring-sky-400/20'
                                  : 'bg-card border-line hover:border-line-strong'
                              }`}
                            >
                              {/* Hàng 1: Nước đi + Điểm + Gain + Nút thử */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        PV_RANK_COLORS[i] ?? PV_RANK_COLORS[0],
                                    }}
                                    title={`Gợi ý #${i + 1}`}
                                  />
                                  <span className="font-mono font-bold text-sm text-ink flex items-center gap-1.5">
                                    <span
                                      className={
                                        isPlayed ? 'text-sky-300' : 'text-accent'
                                      }
                                    >
                                      {line.move_san}
                                    </span>
                                    {isPlayed && (
                                      <span className="px-1.5 py-0.2 rounded bg-sky-500/15 border border-sky-400/30 text-[10px] font-sans font-medium text-sky-300">
                                        Đã đi
                                      </span>
                                    )}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Điểm eval */}
                                  <span
                                    className="font-mono text-xs text-ink-2 bg-inset px-1.5 py-0.5 rounded border border-line tabular-nums"
                                    title="Điểm thế cờ"
                                  >
                                    {formatScore(line)}
                                  </span>

                                  {/* Gain / Loss */}
                                  {gain !== null && (
                                    <span
                                      className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded border tabular-nums ${
                                        isPlayed
                                          ? 'bg-inset text-ink-2 border-line'
                                          : gain >= 0.5
                                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                          : gain <= -0.5
                                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                                          : 'bg-inset text-ink-2 border-line'
                                      }`}
                                      title={`${
                                        gain >= 0 ? 'Tốt hơn' : 'Kém hơn'
                                      } ${Math.abs(gain).toFixed(1)}% cơ hội thắng so với nước đã đi`}
                                    >
                                      {isPlayed
                                        ? 'Chuẩn'
                                        : `${gain >= 0 ? '+' : '−'}${Math.abs(
                                            gain
                                          ).toFixed(1)}%`}
                                    </span>
                                  )}

                                  {/* Nút Thử nhánh này nếu chưa đi */}
                                  {!isPlayed && onTryAlternativeMove && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onTryAlternativeMove(
                                          selectedMove ? selectedMove.ply - 1 : 0,
                                          line.move_uci
                                        )
                                      }
                                      className="px-2 py-0.5 rounded bg-accent/15 hover:bg-accent text-accent hover:text-accent-ink border border-accent/40 text-[11px] font-medium inline-flex items-center gap-1 transition cursor-pointer"
                                      title="Thử đi nhánh thay thế này trên bàn cờ"
                                    >
                                      <span>Thử</span>
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Hàng 2: Chuỗi nước biến thể tiếp nối (PV Line) - Rộng rãi, không bị cắt cụt */}
                              {line.pv_san && line.pv_san.length > 1 && (
                                <div className="text-[11px] font-mono text-ink-3 bg-inset/60 px-2 py-1 rounded border border-line/60 break-words leading-relaxed">
                                  <span className="text-ink-2 font-semibold mr-1 select-none">
                                    Biến thể:
                                  </span>
                                  <span className="text-ink-2">
                                    {line.pv_san.slice(1, 8).join(' ')}
                                  </span>
                                  {line.pv_san.length > 8 && (
                                    <span className="text-ink-3 ml-1">…</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="text-[10px] text-ink-2 text-right font-mono pt-1">
                          depth ~{detail.lines[0]?.depth ?? '—'} · gain tính
                          theo % cơ hội thắng của{' '}
                          {selectedMove?.turn === 'w' ? 'Trắng' : 'Đen'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-ink-2 text-center py-1">
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
