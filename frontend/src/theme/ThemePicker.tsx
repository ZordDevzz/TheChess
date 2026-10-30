/**
 * Bộ chọn theme cho top bar: nút Palette mở popover chọn 1 trong 4 preset
 * (kèm swatch nền + bàn) và ghi đè chất liệu bàn riêng nếu muốn.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { BOARD_THEMES, BOARD_THEME_IDS } from './board';
import { THEME_PRESETS } from './presets';
import { useTheme } from './ThemeProvider';

export const ThemePicker: React.FC = () => {
  const { themeId, boardThemeId, setThemeId, setBoardThemeId } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-inset hover:bg-card text-[11px] text-ink-2 hover:text-ink transition cursor-pointer"
        title="Giao diện & chất liệu bàn cờ"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Palette className="w-3 h-3" />
        <span className="hidden sm:inline">
          {THEME_PRESETS.find((p) => p.id === themeId)?.name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-overlay border border-line rounded-lg shadow-2xl p-2.5 space-y-2.5"
        >
          {/* Preset giao diện */}
          <div className="grid grid-cols-2 gap-1.5">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                role="menuitemradio"
                aria-checked={themeId === preset.id}
                onClick={() => setThemeId(preset.id)}
                className={`relative text-left p-2 rounded-md border transition cursor-pointer ${
                  themeId === preset.id
                    ? 'border-line-strong bg-card'
                    : 'border-line bg-inset hover:border-line-strong'
                }`}
                title={preset.description}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-line shrink-0"
                    style={{ backgroundColor: preset.swatch[0] }}
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-line shrink-0"
                    style={{ backgroundColor: preset.swatch[1] }}
                  />
                  <span className="text-[11px] font-medium text-ink truncate">
                    {preset.name}
                  </span>
                  {themeId === preset.id && (
                    <Check className="w-3 h-3 text-ink-2 ml-auto shrink-0" />
                  )}
                </span>
                <span className="block text-[10px] text-ink-3 mt-1 leading-snug">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>

          {/* Chất liệu bàn (ghi đè riêng) */}
          <div className="border-t border-line pt-2 space-y-1.5">
            <span className="block text-[10px] text-ink-3">Chất liệu bàn cờ</span>
            <div className="grid grid-cols-3 gap-1.5">
              {BOARD_THEME_IDS.map((id) => {
                const bt = BOARD_THEMES[id];
                const active = boardThemeId === id;
                return (
                  <button
                    key={id}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => setBoardThemeId(id)}
                    className={`flex flex-col items-center gap-1 py-1.5 rounded-md border transition cursor-pointer ${
                      active
                        ? 'border-line-strong bg-card'
                        : 'border-line bg-inset hover:border-line-strong'
                    }`}
                  >
                    <span
                      className="w-8 h-4 rounded-sm overflow-hidden border border-line flex"
                      aria-hidden="true"
                    >
                      <span
                        className="flex-1"
                        style={{ backgroundColor: bt.light }}
                      />
                      <span
                        className="flex-1"
                        style={{ backgroundColor: bt.dark }}
                      />
                    </span>
                    <span className="text-[10px] text-ink-2">{bt.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
