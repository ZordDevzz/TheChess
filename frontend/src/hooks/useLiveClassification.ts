import { useEffect, useRef, useState } from 'react';
import { classifySingleMove } from '../api';
import { MoveRecord } from '../types';
import { CLASSIFICATION_META } from '../theme/semantic';

interface UseLiveClassificationParams {
  /** Chỉ bật khi phân tích được phép: khán giả xem live hoặc classifyLive */
  enabled: boolean;
  moves: MoveRecord[];
  setMoves: React.Dispatch<React.SetStateAction<MoveRecord[]>>;
}

/**
 * Phân loại realtime cho các nước đi ĐỒNG BỘ TỪ SERVER (khán giả xem live,
 * nước của đối thủ) — executeMove chỉ classify nước người chơi tự đi.
 *
 * Cơ chế: mỗi lần `moves` thay đổi, tìm nước cũ nhất chưa có classification,
 * gọi classify (nối chuỗi winPercentWhite của nước liền trước để server khỏi
 * phân tích lại), ghi kết quả vào MoveRecord -> MoveHistory badge, EvalGraph
 * và thẻ đánh giá ReviewScreen cập nhật tức thì. Xử lý tuần tự 1 nước/lượt để
 * không dội bom Stockfish; nước lỗi được đánh dấu đã thử để khỏi retry loop.
 */
export function useLiveClassification({
  enabled,
  moves,
  setMoves,
}: UseLiveClassificationParams) {
  const attemptedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  // Nudge để effect chạy lại sau khi 1 request lỗi (không có state change nào khác)
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    if (!enabled || inFlightRef.current) return;
    const key = (m: MoveRecord) => `${m.ply}:${m.uci}`;
    const pending = moves.find(
      (m) => m.classification === undefined && !attemptedRef.current.has(key(m))
    );
    if (!pending) return;

    inFlightRef.current = true;
    const prevMove = moves.find((p) => p.ply === pending.ply - 1);

    classifySingleMove({
      fen_before: pending.fenBefore,
      move_uci: pending.uci,
      depth: 11,
      // Chuỗi điểm: dùng winPercentWhite của nước liền trước nếu đã có
      before_win_percent_white: prevMove?.winPercentWhite,
    })
      .then((cls) => {
        attemptedRef.current.add(key(pending));
        const canonicalColor =
          CLASSIFICATION_META[cls.classification]?.color || cls.color;
        setMoves((prev) =>
          prev.map((m) =>
            m.ply === pending.ply && m.uci === pending.uci
              ? {
                  ...m,
                  cp: cls.after_analysis.cp,
                  mate: cls.after_analysis.mate,
                  winPercentWhite: cls.after_analysis.win_percent_white,
                  classification: cls.classification,
                  symbol: cls.symbol,
                  color: canonicalColor,
                  bestMoveUci: cls.best_move_uci,
                  bestMoveSan: cls.best_move_san,
                  accuracy: cls.accuracy,
                  winLoss: cls.win_loss,
                }
              : m
          )
        );
      })
      .catch(() => {
        // Lỗi engine/mạng: đánh dấu đã thử, nudged để xử lý nước kế tiếp
        attemptedRef.current.add(key(pending));
        setNudge((n) => n + 1);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [enabled, moves, setMoves, nudge]);
}
