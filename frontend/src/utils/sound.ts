/**
 * Quản lý Audio Engine cho TheChess:
 * - Hỗ trợ đa theme: standard, woodland, piano, nes, futuristic
 * - Pre-load AudioBuffer qua Web Audio API để phát ngay tức thì (0ms latency)
 * - Tùy chỉnh volume và bật/tắt toàn cục
 */

export type SoundTheme = 'standard' | 'woodland' | 'piano' | 'nes' | 'futuristic';

export type SoundEvent =
  | 'move'
  | 'capture'
  | 'check'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'lowtime'
  | 'error'
  | 'notify';

export interface SoundThemeInfo {
  id: SoundTheme;
  name: string;
  description: string;
}

export const SOUND_THEMES: SoundThemeInfo[] = [
  {
    id: 'standard',
    name: 'Gỗ cổ điển (Lichess)',
    description: 'Âm thanh cờ gỗ nhẹ, tự nhiên và quen thuộc',
  },
  {
    id: 'woodland',
    name: 'Gỗ mộc đanh',
    description: 'Tiếng va đập gỗ chắc tiếng, chân thực như ngoài đời',
  },
  {
    id: 'piano',
    name: 'Đàn Piano',
    description: 'Các nốt nhạc piano du dương, thư giãn và êm dịu',
  },
  {
    id: 'nes',
    name: 'NES 8-Bit',
    description: 'Hiệu ứng âm thanh chiptune điện tử thập niên 90',
  },
  {
    id: 'futuristic',
    name: 'Futuristic Synth',
    description: 'Âm thanh điện tử hiện đại, công nghệ cao',
  },
];

const LS_SOUND_KEY = 'thechess_sound_enabled';
const LS_THEME_KEY = 'thechess_sound_theme';
const LS_VOLUME_KEY = 'thechess_sound_volume';

const EVENT_FILE_MAP: Record<SoundEvent, string> = {
  move: 'Move.mp3',
  capture: 'Capture.mp3',
  check: 'Check.mp3',
  victory: 'Victory.mp3',
  defeat: 'Defeat.mp3',
  draw: 'Draw.mp3',
  lowtime: 'LowTime.mp3',
  error: 'Error.mp3',
  notify: 'GenericNotify.mp3',
};

class SoundManager {
  private audioCtx: AudioContext | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private listeners: Set<() => void> = new Set();
  private isPreloading = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Tự động mở AudioContext khi người dùng tương tác lần đầu
      const unlock = () => {
        this.getAudioContext()?.resume();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });

      // Pre-load theme hiện tại
      this.preloadTheme(this.getTheme());
    }
  }

  private getAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
      }
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(LS_SOUND_KEY) !== '0';
    } catch {
      return true;
    }
  }

  public setEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_SOUND_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    this.notifyListeners();
  }

  public getTheme(): SoundTheme {
    if (typeof window === 'undefined') return 'standard';
    try {
      const saved = window.localStorage.getItem(LS_THEME_KEY) as SoundTheme;
      if (SOUND_THEMES.some((t) => t.id === saved)) return saved;
    } catch {
      // ignore
    }
    return 'standard';
  }

  public setTheme(theme: SoundTheme): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_THEME_KEY, theme);
    } catch {
      // ignore
    }
    this.preloadTheme(theme);
    this.notifyListeners();
  }

  public getVolume(): number {
    if (typeof window === 'undefined') return 0.8;
    try {
      const raw = window.localStorage.getItem(LS_VOLUME_KEY);
      if (raw !== null) {
        const v = parseFloat(raw);
        if (!isNaN(v) && v >= 0 && v <= 1) return v;
      }
    } catch {
      // ignore
    }
    return 0.8;
  }

  public setVolume(volume: number): void {
    if (typeof window === 'undefined') return;
    const clamped = Math.max(0, Math.min(1, volume));
    try {
      window.localStorage.setItem(LS_VOLUME_KEY, clamped.toString());
    } catch {
      // ignore
    }
    this.notifyListeners();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore
      }
    });
  }

  public async preloadTheme(theme: SoundTheme): Promise<void> {
    if (typeof window === 'undefined' || this.isPreloading) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    this.isPreloading = true;
    const events: SoundEvent[] = ['move', 'capture', 'check', 'victory', 'defeat', 'draw', 'lowtime'];
    try {
      await Promise.all(
        events.map(async (ev) => {
          const cacheKey = `${theme}/${ev}`;
          if (this.bufferCache.has(cacheKey)) return;
          const fileName = EVENT_FILE_MAP[ev];
          const url = `/sounds/${theme}/${fileName}`;
          try {
            const resp = await fetch(url);
            if (!resp.ok) return;
            const arrayBuf = await resp.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuf);
            this.bufferCache.set(cacheKey, decoded);
          } catch {
            // bỏ qua lỗi decode
          }
        })
      );
    } finally {
      this.isPreloading = false;
    }
  }

  public async play(event: SoundEvent, options?: { volumeScale?: number }): Promise<void> {
    if (!this.isEnabled()) return;
    const ctx = this.getAudioContext();
    const theme = this.getTheme();
    const cacheKey = `${theme}/${event}`;
    const vol = this.getVolume() * (options?.volumeScale ?? 1.0);

    if (vol <= 0.001) return;

    // Ưu tiên Web Audio API (Zero Latency)
    if (ctx) {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // ignore
        }
      }

      let buffer = this.bufferCache.get(cacheKey);
      if (!buffer) {
        // Tải nhanh nếu chưa kịp preload
        const fileName = EVENT_FILE_MAP[event];
        const url = `/sounds/${theme}/${fileName}`;
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            buffer = await ctx.decodeAudioData(arrayBuf);
            this.bufferCache.set(cacheKey, buffer);
          }
        } catch {
          // ignore
        }
      }

      if (buffer) {
        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(vol, ctx.currentTime);
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          source.start(0);
          return;
        } catch {
          // Fallback to HTML5 audio below
        }
      }
    }

    // Fallback: HTML5 Audio
    try {
      const fileName = EVENT_FILE_MAP[event];
      const audio = new Audio(`/sounds/${theme}/${fileName}`);
      audio.volume = vol;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  /**
   * Phát âm thanh nước đi cờ thông minh dựa trên tính chất nước đi:
   * - Chiếu tướng hoặc Chiếu hết: check sound
   * - Ăn quân: capture sound
   * - Nhập thành: move sound
   * - Nước đi thường: move sound
   */
  public playMove(opts?: {
    isCapture?: boolean;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isCastle?: boolean;
  }): void {
    if (opts?.isCheck || opts?.isCheckmate) {
      this.play('check');
    } else if (opts?.isCapture) {
      this.play('capture');
    } else {
      this.play('move');
    }
  }

  /**
   * Phát âm thanh khi kết thúc ván:
   * - Thắng: victory sound
   * - Thua: defeat sound
   * - Hòa: draw sound
   */
  public playGameOver(result: '1-0' | '0-1' | '1/2-1/2', playerColor?: 'w' | 'b' | null): void {
    if (result === '1/2-1/2') {
      this.play('draw');
    } else if (playerColor) {
      const won = (result === '1-0' && playerColor === 'w') || (result === '0-1' && playerColor === 'b');
      this.play(won ? 'victory' : 'defeat');
    } else {
      this.play('victory');
    }
  }

  public playLowTime(): void {
    this.play('lowtime', { volumeScale: 0.9 });
  }

  public playError(): void {
    this.play('error', { volumeScale: 0.7 });
  }

  public playNotify(): void {
    this.play('notify');
  }
}

export const soundManager = new SoundManager();
