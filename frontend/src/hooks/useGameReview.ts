import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelReviewJob, getReviewJob, startGameReview } from '../api';
import { GameReviewResult, MoveRecord } from '../types';
import { ToastKind } from '../components/Toasts';
import { CLASSIFICATION_META } from '../theme/semantic';
import { useRealtime } from './useRealtime';

interface UseGameReviewParams {
  initialFen: string;
  moves: MoveRecord[];
  setMoves: React.Dispatch<React.SetStateAction<MoveRecord[]>>;
  pushToast: (msg: string, kind?: ToastKind) => void;
}

/**
 * Quản lý trạng thái và vòng đời tác vụ Game Review chạy nền,
 * hỗ trợ tự động hủy job đang chạy khi bắt đầu ván mới hoặc chạy lại review.
 */
export function useGameReview({
  initialFen,
  moves,
  setMoves,
  pushToast,
}: UseGameReviewParams) {
  const [reviewResult, setReviewResult] = useState<GameReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [reviewProgress, setReviewProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const { subscribe: subscribeRealtime } = useRealtime();

  const activeJobIdRef = useRef<string | null>(null);

  const cancelActiveReview = useCallback(() => {
    const jobId = activeJobIdRef.current;
    if (jobId) {
      activeJobIdRef.current = null;
      void cancelReviewJob(jobId);
    }
    setIsReviewing(false);
    setReviewProgress(null);
  }, []);

  useEffect(() => {
    return () => {
      if (activeJobIdRef.current) {
        void cancelReviewJob(activeJobIdRef.current);
      }
    };
  }, []);

  const resetReview = useCallback(() => {
    cancelActiveReview();
    setReviewResult(null);
  }, [cancelActiveReview]);

  const handleRunGameReview = useCallback(async () => {
    if (moves.length === 0) return;
    cancelActiveReview();

    setIsReviewing(true);
    setReviewProgress({ done: 0, total: moves.length });
    try {
      const start = await startGameReview({
        initial_fen: initialFen,
        moves_uci: moves.map((m) => m.uci),
        depth: 11,
      });
      activeJobIdRef.current = start.job_id;

      // Realtime: server push tiến độ qua topic review:{id} -> fetch ngay;
      // poll 3s chỉ là fallback khi WS rớt (trước đây poll dồn 450ms).
      const wakeRef: { current: (() => void) | null } = { current: null };
      const unsubscribe = subscribeRealtime(
        `review:${start.job_id}`,
        () => wakeRef.current?.()
      );
      const waitEvent = (ms: number) =>
        new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            resolve();
          };
          const timer = window.setTimeout(finish, ms);
          wakeRef.current = finish;
        });

      let result: GameReviewResult | null = null;
      try {
        while (activeJobIdRef.current === start.job_id) {
          await waitEvent(3_000);
          if (activeJobIdRef.current !== start.job_id) return;

          const job = await getReviewJob(start.job_id);
          setReviewProgress(job.progress);
          if (job.status === 'done' && job.result) {
            result = job.result;
            break;
          }
          if (job.status === 'cancelled') {
            return;
          }
          if (job.status === 'error') {
            throw new Error(job.error || 'Lỗi không xác định khi review');
          }
        }
      } finally {
        unsubscribe();
      }

      if (!result || activeJobIdRef.current !== start.job_id) return;
      activeJobIdRef.current = null;

      setReviewResult(result);
      setMoves((prev) =>
        prev.map((m) => {
          const reviewed = result!.moves.find((rm) => rm.ply === m.ply);
          if (!reviewed) return m;
          const canonicalColor =
            CLASSIFICATION_META[reviewed.classification]?.color || reviewed.color;
          return {
            ...m,
            cp: reviewed.cp,
            mate: reviewed.mate,
            winPercentWhite: reviewed.win_percent_white,
            classification: reviewed.classification,
            symbol: reviewed.symbol,
            color: canonicalColor,
            bestMoveUci: reviewed.best_move_uci,
            bestMoveSan: reviewed.best_move_san,
            accuracy: reviewed.accuracy,
            winLoss: reviewed.win_loss,
          };
        })
      );
    } catch (err) {
      if (activeJobIdRef.current) {
        console.error('Lỗi Game Review:', err);
        pushToast(
          `Game Review thất bại: ${
            err instanceof Error ? err.message : 'lỗi không xác định'
          }`,
          'error'
        );
      }
    } finally {
      activeJobIdRef.current = null;
      setIsReviewing(false);
      setReviewProgress(null);
    }
  }, [initialFen, moves, cancelActiveReview, setMoves, pushToast]);

  return {
    reviewResult,
    isReviewing,
    reviewProgress,
    handleRunGameReview,
    resetReview,
  };
}
