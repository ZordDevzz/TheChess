import { useCallback, useEffect, useState } from 'react';

/**
 * Tự động đo kích thước vùng chứa bàn cờ (boardStageRef) và tính ra kích thước
 * bàn cờ tối ưu để bàn cờ + 2 PlayerCard lấp đầy tối đa chiều dọc của container.
 * Tự động ẩn 2 cột CapturedBar bên hông nếu chiều ngang hẹp để ưu tiên kích thước bàn cờ.
 */
export function useBoardSize(activeTab: 'play' | 'editor', screenKey = 'match') {
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);

  const calculateFallbackSize = () => {
    if (typeof window === 'undefined') return 560;
    const isCompact = window.innerWidth < 768;
    if (isCompact) {
      const availW = window.innerWidth - 16;
      const availH = window.innerHeight * 0.58 - 96;
      return Math.max(260, Math.floor(Math.min(availW, availH)));
    }
    const availH = window.innerHeight - 50 - 92;
    const availW = window.innerWidth - 450 - 20;
    return Math.max(280, Math.floor(Math.min(availW, availH)));
  };

  const [boardSize, setBoardSize] = useState<number>(calculateFallbackSize);
  const [showSideRails, setShowSideRails] = useState<boolean>(true);

  // Callback ref: đảm bảo nhận được phần tử DOM ngay khi nó mount (kể cả sau loading state/render điều kiện)
  const boardStageRef = useCallback((node: HTMLDivElement | null) => {
    setStageEl(node);
  }, []);

  useEffect(() => {
    const el = stageEl;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const isCompact = window.innerWidth < 768;

      // Chiều cao container thực tế (fallback sang window.innerHeight nếu container đang render frame ban đầu)
      const containerH = rect.height > 0 ? rect.height : window.innerHeight - 50;
      const containerW = rect.width > 0 ? rect.width : window.innerWidth - (isCompact ? 0 : 450);

      if (activeTab === 'editor') {
        const availH =
          (isCompact
            ? Math.min(window.innerHeight * 0.62, containerH || 420)
            : containerH) - 16;
        const availW = containerW - 16;
        setBoardSize(Math.max(260, Math.floor(Math.min(availW, availH))));
        setShowSideRails(false);
        return;
      }

      if (isCompact) {
        const availW = containerW - 16;
        const availH = Math.max(300, (containerH || window.innerHeight * 0.58) - 96);
        setBoardSize(Math.max(260, Math.floor(Math.min(availW, availH))));
        setShowSideRails(false);
        return;
      }

      // Chiều cao khả dụng cho bàn cờ:
      // 2 PlayerCard (2 * 40px = 80px) + 2 gap (2 * 4px = 8px) + padding dọc (py-1 = 8px) = 96px
      const availH = Math.max(280, Math.floor(containerH - 96));
      const availWNoRails = containerW - 16;

      // Bề rộng của 2 dải CapturedBar bên hông (~2 * 48px + 2 * 8px gap = 112px)
      const railsReserveW = 112;
      const availWWithRails = availWNoRails - railsReserveW;

      // Chỉ bật 2 cột CapturedBar bên hông khi chiều ngang đủ rộng để không làm co chiều dọc của bàn cờ
      const canFitSideRails = availWWithRails >= availH;
      setShowSideRails(canFitSideRails);

      const effectiveAvailW = canFitSideRails ? availWWithRails : availWNoRails;
      const optimal = Math.max(280, Math.floor(Math.min(effectiveAvailW, availH)));
      setBoardSize(optimal);
    };

    updateSize();

    // Chạy thêm 1 frame sau để đảm bảo layout flexbox đã ổn định hoàn toàn
    const rafId = requestAnimationFrame(updateSize);

    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [stageEl, activeTab, screenKey]);

  return { boardStageRef, boardSize, showSideRails };
}
