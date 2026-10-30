/**
 * Chất liệu bàn cờ — token hóa theo design system V1.
 * Highlight ô được suy từ lớp phủ alpha trung tính nên tự ăn khớp mọi chất liệu.
 */

export type BoardThemeId = 'baize' | 'wood' | 'slate';

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  /** Ô sáng */
  light: string;
  /** Ô tối */
  dark: string;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  baize: { id: 'baize', name: 'Nỉ xanh', light: '#EEEFE0', dark: '#6E8C62' },
  wood: { id: 'wood', name: 'Gỗ cổ điển', light: '#EDD9B5', dark: '#A97C50' },
  slate: { id: 'slate', name: 'Đá xám', light: '#D9DDE1', dark: '#626B76' },
};

export const BOARD_THEME_IDS = Object.keys(BOARD_THEMES) as BoardThemeId[];

/** Ánh xạ từ id theme cũ (bản pre-V1) sang id mới. */
export function migrateBoardTheme(old: string | undefined | null): BoardThemeId {
  if (old === 'wood') return 'wood';
  if (old === 'graphite') return 'slate';
  return 'baize'; // stone và mọi giá trị lạ → mặc định mới
}

/**
 * Lớp phủ highlight các ô bàn cờ — alpha trung tính, dùng được trên mọi chất liệu.
 */
export const squareOverlays = {
  /** Nước đi vừa thực hiện (ô xuất phát). */
  lastMoveFrom: 'rgba(226, 199, 125, 0.34)',
  /** Nước đi vừa thực hiện (ô đích) khi chưa có phân loại. */
  lastMoveTo: 'rgba(226, 199, 125, 0.48)',
  /** Ô đang chọn quân. */
  selected: 'rgba(242, 210, 120, 0.55)',
  /** Chấm nước đi hợp lệ. */
  legalDot:
    'radial-gradient(circle, rgba(24, 32, 27, 0.36) 19%, transparent 21%)',
  /** Vòng tròn quanh quân có thể ăn. */
  legalCaptureRing:
    'radial-gradient(circle, transparent 60%, rgba(24, 32, 27, 0.42) 64%)',
  /** Vua đang bị chiếu. */
  check: 'rgba(214, 72, 72, 0.6)',
};
