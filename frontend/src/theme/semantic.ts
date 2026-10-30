/**
 * Thang màu ngữ nghĩa — nguồn duy nhất cho mọi màu mang ý nghĩa phân tích.
 * Nguyên tắc "Phòng học cờ": màu bão hòa CHỈ xuất hiện khi truyền đạt thông tin
 * (phân loại nước, thứ hạng nhánh, gợi ý, lỗi) — không dùng để trang trí.
 */

export interface ClassificationMeta {
  key: string;
  viLabel: string;
  symbol: string;
  color: string;
  /** Nền chip nhúng màu phân loại (alpha thấp, ăn khớp mọi theme). */
  bg: string;
  border: string;
}

/** Thang phân loại nước đi: Best → Blunder. Dùng chung move list, review, board highlight. */
export const CLASSIFICATION_META: Record<string, ClassificationMeta> = {
  Best: {
    key: 'Best',
    viLabel: 'Tốt nhất (Best)',
    symbol: '★',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.13)',
    border: 'rgba(52, 211, 153, 0.35)',
  },
  Excellent: {
    key: 'Excellent',
    viLabel: 'Xuất sắc (Excellent)',
    symbol: '!',
    color: '#2dd4bf',
    bg: 'rgba(45, 212, 191, 0.11)',
    border: 'rgba(45, 212, 191, 0.3)',
  },
  Good: {
    key: 'Good',
    viLabel: 'Hợp lý (Good)',
    symbol: '✓',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.11)',
    border: 'rgba(96, 165, 250, 0.25)',
  },
  Inaccuracy: {
    key: 'Inaccuracy',
    viLabel: 'Chưa chuẩn (Inaccuracy)',
    symbol: '?!',
    color: '#facc15',
    bg: 'rgba(250, 204, 21, 0.13)',
    border: 'rgba(250, 204, 21, 0.35)',
  },
  Mistake: {
    key: 'Mistake',
    viLabel: 'Sai lầm (Mistake)',
    symbol: '?',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.13)',
    border: 'rgba(251, 146, 60, 0.35)',
  },
  Blunder: {
    key: 'Blunder',
    viLabel: 'Nước ngớ ngẩn (Blunder)',
    symbol: '??',
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.15)',
    border: 'rgba(248, 113, 113, 0.4)',
  },
};

/** Thứ tự hiển thị phân loại trong review. */
export const CLASSIFICATION_ORDER = [
  'Best',
  'Excellent',
  'Good',
  'Inaccuracy',
  'Mistake',
  'Blunder',
] as const;

/** Màu chấm định hướng theo thứ hạng nhánh MultiPV (đồng bộ dot trong list & mũi tên trên bàn). */
export const PV_RANK_COLORS = [
  '#10b981',
  '#38bdf8',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
];

/** Màu mũi tên vẽ trên bàn theo thứ hạng nhánh — hạ bão hòa 1 bậc để không giành attention với quân. */
export const ARROW_COLORS = [
  'rgba(16, 185, 129, 0.74)',
  'rgba(56, 189, 248, 0.64)',
  'rgba(245, 158, 11, 0.6)',
  'rgba(168, 85, 247, 0.52)',
  'rgba(236, 72, 153, 0.48)',
];

/** Mũi tên gợi ý (hint) — vàng sáng, nổi bật nhất trên bàn. */
export const HINT_ARROW_COLOR = 'rgba(250, 204, 21, 0.92)';

/** Màu con trỏ nước hiện tại trên biểu đồ eval. */
export const EVAL_CURSOR_COLOR = '#38bdf8';
