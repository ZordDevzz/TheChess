/**
 * Preset giao diện — mỗi preset là một "phòng học" hoàn chỉnh: palette UI + chất liệu bàn đi kèm.
 * Giá trị CSS variables thật nằm trong index.css (theo [data-theme='...']);
 * module này giữ metadata cho bộ chọn theme + lưu/đọc lựa chọn của người dùng.
 */
import { BoardThemeId } from './board';

export type ThemeId = 'study' | 'graphite' | 'scoresheet' | 'marble';

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  /** Chất liệu bàn mặc định khi chọn preset này. */
  defaultBoard: BoardThemeId;
  /** Hai màu swatch cho bộ chọn (nền UI + chất liệu bàn). */
  swatch: [string, string];
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'study',
    name: 'Study',
    description: 'Phòng học ban đêm — nỉ xanh giải đấu',
    mode: 'dark',
    defaultBoard: 'baize',
    swatch: ['#0F1211', '#6E8C62'],
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Trung tính, tương phản cao',
    mode: 'dark',
    defaultBoard: 'slate',
    swatch: ['#101012', '#626B76'],
  },
  {
    id: 'scoresheet',
    name: 'Scoresheet',
    description: 'Tờ ghi biên trên giấy ngà',
    mode: 'light',
    defaultBoard: 'wood',
    swatch: ['#F3F2EC', '#A97C50'],
  },
  {
    id: 'marble',
    name: 'Marble',
    description: 'Sáng, đá lạnh, luyện tập tương phản',
    mode: 'light',
    defaultBoard: 'slate',
    swatch: ['#F2F3F1', '#626B76'],
  },
];

export const DEFAULT_THEME: ThemeId = 'study';

const STORAGE_KEY = 'thechess:theme:v1';

export interface ThemeStore {
  themeId: ThemeId;
  boardTheme: BoardThemeId;
}

export function loadThemeStore(): ThemeStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ThemeStore>;
    const preset = THEME_PRESETS.find((p) => p.id === data.themeId);
    if (!preset) return null;
    const board =
      data.boardTheme && ['baize', 'wood', 'slate'].includes(data.boardTheme)
        ? data.boardTheme
        : preset.defaultBoard;
    return { themeId: preset.id, boardTheme: board as BoardThemeId };
  } catch {
    return null;
  }
}

export function saveThemeStore(store: ThemeStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage bị chặn — bỏ qua
  }
}

/** Lần đầu vào: theo prefers-color-scheme. */
export function initialThemeStore(): ThemeStore {
  const saved = loadThemeStore();
  if (saved) return saved;
  const prefersLight =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const preset = prefersLight
    ? THEME_PRESETS.find((p) => p.id === 'scoresheet')!
    : THEME_PRESETS.find((p) => p.id === DEFAULT_THEME)!;
  return { themeId: preset.id, boardTheme: preset.defaultBoard };
}
