import { useEffect, useRef, useState } from 'react';

/**
 * Tự động đo kích thước vùng chứa bàn cờ (boardStageRef) và tính ra kích thước
 * bàn cờ tối ưu để bàn cờ + 2 PlayerCard lấp đầy tối đa chiều dọc của container.
 * Tự động ẩn 2 cột CapturedBar bên hông nếu chiều ngang hẹp để ưu tiên kích thước bàn cờ.
 */
export function useBoardSize(activeTab: 'play' | 'editor', screenKey = 'match') {
  const boardStageRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState<number>(560);
  const [showSideRails, setShowSideRails] = useState<boolean>(true);

  useEffect(() => {
    const el = boardStageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const isCompact = window.innerWidth < 768;

      if (activeTab === 'editor') {
        const availH =
          (isCompact
            ? Math.min(window.innerHeight * 0.62, rect.height || 420)
            : rect.height) - 20;
        const availW = rect.width - 20;
        setBoardSize(Math.max(260, Math.floor(Math.min(availW, availH))));
        setShowSideRails(false);
        return;
      }

      if (isCompact) {
        const availW = rect.width - 16;
        const availH = Math.max(300, (rect.height || window.innerHeight * 0.58) - 96);
        setBoardSize(Math.max(260, Math.floor(Math.min(availW, availH))));
        setShowSideRails(false);
        return;
      }

      // Chiều cao khả dụng cho bàn cờ: trừ 2 PlayerCard (2 * 40px = 80px) + 2 gap (12px) + padding dọc (12px) = 104px
      const availH = rect.height - 104;
      const availWNoRails = rect.width - 20;

      // Bề rộng của 2 dải CapturedBar bên hông (~2 * 52px + 2 * 8px gap = 120px)
      const railsReserveW = 120;
      const availWWithRails = availWNoRails - railsReserveW;

      // Chỉ bật 2 cột CapturedBar bên hông khi chiều ngang đủ rộng để không làm co chiều dọc của bàn cờ
      const canFitSideRails = availWWithRails >= availH;
      setShowSideRails(canFitSideRails);

      const effectiveAvailW = canFitSideRails ? availWWithRails : availWNoRails;
      const optimal = Math.max(280, Math.floor(Math.min(effectiveAvailW, availH)));
      setBoardSize(optimal);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [activeTab, screenKey]);

  return { boardStageRef, boardSize, showSideRails };
}
