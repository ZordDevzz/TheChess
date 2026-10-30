import { useEffect, useRef, useState } from 'react';
import { analyzePosition } from '../api';
import { AnalysisResponse, GamePhase, MoveRecord } from '../types';

interface UseAnalysisControllerParams {
  currentFen: string;
  /** Chỉ phân tích khi được phép theo chế độ chơi + phase (tính ở App) */
  analysisEnabled: boolean;
  activeTab: 'play' | 'editor';
  isSpectator: boolean;
  phase: GamePhase;
  setMoves: React.Dispatch<React.SetStateAction<MoveRecord[]>>;
}

/**
 * Trạng thái phân tích live (engine): kết quả, đang chạy, cấu hình
 * multipv/depth và bật/tắt thanh đánh giá & mũi tên. Tự hủy request cũ
 * bằng AbortController khi thế cờ hoặc cấu hình thay đổi.
 */
export function useAnalysisController({
  currentFen,
  analysisEnabled,
  activeTab,
  isSpectator,
  phase,
  setMoves,
}: UseAnalysisControllerParams) {
  const [showEval, setShowEval] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [multipv, setMultipv] = useState<number>(3);
  const [depth, setDepth] = useState<number>(15);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Phân tích live — chỉ chạy khi được phép theo chế độ chơi + phase
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!analysisEnabled) {
      setAnalysis(null);
      setIsAnalyzing(false);
      return;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const effectiveDepth =
      isSpectator && phase === 'playing' ? Math.min(depth, 12) : depth;

    setIsAnalyzing(true);
    analyzePosition(currentFen, effectiveDepth, multipv, controller.signal)
      .then((res) => {
        setAnalysis(res);
        setIsAnalyzing(false);
        // Backfill điểm đánh giá trực tiếp vào nước đi hiện tại để biểu đồ EvalGraph cập nhật mượt
        setMoves((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (m.fenAfter === res.fen && m.winPercentWhite === undefined) {
              changed = true;
              return {
                ...m,
                cp: res.cp,
                mate: res.mate,
                winPercentWhite: res.win_percent_white,
              };
            }
            return m;
          });
          return changed ? next : prev;
        });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setIsAnalyzing(false);
        }
      });

    return () => controller.abort();
  }, [
    currentFen,
    depth,
    multipv,
    activeTab,
    analysisEnabled,
    isSpectator,
    phase,
  ]);

  return {
    analysis,
    isAnalyzing,
    showEval,
    setShowEval,
    showArrows,
    setShowArrows,
    multipv,
    setMultipv,
    depth,
    setDepth,
  };
}
