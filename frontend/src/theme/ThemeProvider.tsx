/**
 * ThemeProvider — áp preset giao diện lên <html data-theme="..."> và giữ
 * lựa chọn chất liệu bàn. Mọi màu trong app chỉ được tham chiếu qua token
 * (bg-panel, text-ink, border-line...) để preset hoạt động trọn vẹn.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { BoardTheme, BoardThemeId, BOARD_THEMES } from './board';
import {
  initialThemeStore,
  saveThemeStore,
  ThemeId,
  THEME_PRESETS,
  ThemeStore,
} from './presets';

interface ThemeContextValue {
  themeId: ThemeId;
  boardThemeId: BoardThemeId;
  boardTheme: BoardTheme;
  setThemeId: (id: ThemeId) => void;
  setBoardThemeId: (id: BoardThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [store, setStore] = useState<ThemeStore>(initialThemeStore);

  useEffect(() => {
    document.documentElement.dataset.theme = store.themeId;
    saveThemeStore(store);
  }, [store]);

  const setThemeId = useCallback((id: ThemeId) => {
    setStore((prev) => {
      const preset = THEME_PRESETS.find((p) => p.id === id);
      // Đổi preset → về chất liệu bàn mặc định của preset đó
      if (preset && prev.themeId !== id) {
        return { themeId: id, boardTheme: preset.defaultBoard };
      }
      return prev;
    });
  }, []);

  const setBoardThemeId = useCallback((id: BoardThemeId) => {
    setStore((prev) => ({ ...prev, boardTheme: id }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId: store.themeId,
      boardThemeId: store.boardTheme,
      boardTheme: BOARD_THEMES[store.boardTheme],
      setThemeId,
      setBoardThemeId,
    }),
    [store, setThemeId, setBoardThemeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme phải nằm trong <ThemeProvider>');
  return ctx;
}
