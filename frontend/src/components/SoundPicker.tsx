import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Volume1, VolumeX, Check, Play } from 'lucide-react';
import {
  soundManager,
  SOUND_THEMES,
  SoundTheme,
} from '../utils/sound';

export const SoundPicker: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(soundManager.isEnabled());
  const [theme, setTheme] = useState<SoundTheme>(soundManager.getTheme());
  const [volume, setVolume] = useState<number>(soundManager.getVolume());
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return soundManager.subscribe(() => {
      setEnabled(soundManager.isEnabled());
      setTheme(soundManager.getTheme());
      setVolume(soundManager.getVolume());
    });
  }, []);

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

  const toggleSound = () => {
    const next = !enabled;
    soundManager.setEnabled(next);
    if (next) {
      soundManager.play('move');
    }
  };

  const handleSelectTheme = (t: SoundTheme) => {
    soundManager.setTheme(t);
    soundManager.play('move');
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    soundManager.setVolume(val);
  };

  const currentThemeObj = SOUND_THEMES.find((t) => t.id === theme) || SOUND_THEMES[0];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-inset hover:bg-card text-[11px] text-ink-2 hover:text-ink transition cursor-pointer"
        title={`Âm thanh: ${enabled ? currentThemeObj.name : 'Tắt'}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {!enabled || volume === 0 ? (
          <VolumeX className="w-3.5 h-3.5 text-ink-3" />
        ) : volume < 0.5 ? (
          <Volume1 className="w-3.5 h-3.5 text-ink-2" />
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-accent" />
        )}
        <span className="hidden sm:inline">
          {enabled ? currentThemeObj.name.split(' ')[0] : 'Tắt tiếng'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-overlay border border-line rounded-lg shadow-2xl p-3 space-y-3"
        >
          {/* Header & Toggle Bật/Tắt */}
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-accent" /> Âm thanh trò chơi
            </span>
            <button
              type="button"
              onClick={toggleSound}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                enabled
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-inset text-ink-3 border border-line hover:text-ink'
              }`}
            >
              {enabled ? 'Đang BẬT' : 'Đang TẮT'}
            </button>
          </div>

          {/* Thanh trượt Âm lượng */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-ink-2">
              <span>Âm lượng</span>
              <span className="font-mono">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              disabled={!enabled}
              onChange={handleVolumeChange}
              className="w-full accent-accent cursor-pointer disabled:opacity-40"
            />
          </div>

          {/* Danh sách Sound Theme */}
          <div className="space-y-1.5 pt-1">
            <span className="block text-[11px] font-medium text-ink-2">Gói âm thanh</span>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
              {SOUND_THEMES.map((item) => {
                const isSelected = theme === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded-md border transition cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/10 text-ink'
                        : 'border-line bg-inset hover:border-line-strong text-ink-2 hover:text-ink'
                    } ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => handleSelectTheme(item.id)}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{item.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-accent shrink-0" />}
                      </div>
                      <span className="block text-[10px] text-ink-3 truncate leading-snug">
                        {item.description}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        soundManager.setTheme(item.id);
                        soundManager.play('capture');
                      }}
                      className="p-1 rounded bg-inset hover:bg-card border border-line text-ink-2 hover:text-accent transition shrink-0"
                      title="Nghe thử âm thanh ăn quân"
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
