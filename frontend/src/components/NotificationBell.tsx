/**
 * NotificationBell — chuông thông báo trên header + dropdown danh sách.
 *
 * - Badge số chưa đọc (đồng bộ nhiều tab qua useNotifications).
 * - Mở dropdown = mark-read tất cả.
 * - Toggle trong dropdown: push browser (xin quyền khi bật, không hỏi khi
 *   login) + sound "đến lượt bạn" — lưu localStorage, tắt mặc định push.
 * - Click-through: challenge/match_started/turn/match_finished -> mở trận,
 *   dm -> mở modal chat DM.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Swords } from 'lucide-react';
import type { NotificationItem, UserRecord } from '../types';

const LS_PUSH_KEY = 'thechess_push_enabled';
const LS_SOUND_KEY = 'thechess_sound_enabled';

export function isPushEnabled(): boolean {
  try {
    return window.localStorage.getItem(LS_PUSH_KEY) === '1';
  } catch {
    return false;
  }
}

export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(LS_SOUND_KEY) !== '0'; // mặc định bật
  } catch {
    return true;
  }
}

/** Beep nhẹ không cần file audio (WebAudio oscillator). */
export function playTickSound(): void {
  if (!isSoundEnabled()) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    // ignore — audio không khả dụng
  }
}

/** Push browser (chỉ khi đã bật toggle + cấp quyền). Trả về true nếu hiện được. */
export function notifyBrowser(title: string, body: string): boolean {
  if (!isPushEnabled()) return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, icon: '/favicon.ico' });
    return true;
  } catch {
    return false;
  }
}

function describeNotification(n: NotificationItem): {
  text: string;
  hasMatch: boolean;
} {
  const p = n.payload as Record<string, unknown>;
  switch (n.kind) {
    case 'challenge':
      return {
        text: `${String(p.from_display_name ?? 'Ai đó')} thách đấu bạn${
          p.room_code ? ` (phòng #${String(p.room_code)})` : ''
        }`,
        hasMatch: Boolean(p.match_id),
      };
    case 'match_started':
      return {
        text: `${String(p.by_display_name ?? 'Đối thủ')} đã vào phòng — ván bắt đầu`,
        hasMatch: Boolean(p.match_id),
      };
    case 'turn':
      return { text: 'Đến lượt bạn', hasMatch: Boolean(p.match_id) };
    case 'match_finished': {
      const res = p.result ? ` · ${String(p.result)}` : '';
      return { text: `Ván đấu kết thúc${res}`, hasMatch: Boolean(p.match_id) };
    }
    case 'dm':
      return {
        text: `${String(p.from_display_name ?? 'Ai đó')}: ${String(
          p.preview ?? ''
        )}`,
        hasMatch: false,
      };
    default:
      return { text: n.kind, hasMatch: false };
  }
}

interface NotificationBellProps {
  currentUser: UserRecord;
  notifications: NotificationItem[];
  unread: number;
  onMarkAllRead: () => void;
  onOpenMatch: (matchId: string) => void;
  onOpenDm: (userId: string, displayName: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  unread,
  onMarkAllRead,
  onOpenMatch,
  onOpenDm,
}) => {
  const [open, setOpen] = useState(false);
  const [pushOn, setPushOn] = useState(isPushEnabled());
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [permission, setPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleDropdown = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) onMarkAllRead();
  };

  const togglePush = async () => {
    if (pushOn) {
      setPushOn(false);
      try {
        window.localStorage.setItem(LS_PUSH_KEY, '0');
      } catch {
        // ignore
      }
      return;
    }
    if (typeof Notification === 'undefined') return;
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    setPermission(perm);
    if (perm === 'granted') {
      setPushOn(true);
      try {
        window.localStorage.setItem(LS_PUSH_KEY, '1');
      } catch {
        // ignore
      }
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(LS_SOUND_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
    if (next) playTickSound();
  };

  const handleItemClick = (n: NotificationItem) => {
    const p = n.payload as Record<string, unknown>;
    if (n.kind === 'dm' && p.from_user_id) {
      onOpenDm(
        String(p.from_user_id),
        String(p.from_display_name ?? 'Kỳ thủ')
      );
    } else if (p.match_id) {
      onOpenMatch(String(p.match_id));
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleDropdown}
        className="relative p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-card border border-transparent hover:border-line transition cursor-pointer"
        title="Thông báo"
      >
        {unread > 0 ? (
          <Bell className="w-4 h-4 text-accent" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-accent text-accent-ink text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 bg-overlay border border-line-strong rounded-lg shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-line">
            <span className="text-xs font-medium text-ink">Thông báo</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleSound}
                className={`p-1 rounded border transition cursor-pointer ${
                  soundOn
                    ? 'text-ink border-line'
                    : 'text-ink-3 border-line bg-inset'
                }`}
                title={soundOn ? 'Sound: Bật' : 'Sound: Tắt'}
              >
                {soundOn ? (
                  <Volume2 className="w-3 h-3" />
                ) : (
                  <VolumeX className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={togglePush}
                disabled={
                  typeof Notification === 'undefined' ||
                  permission === 'denied'
                }
                className={`p-1 rounded border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  pushOn
                    ? 'text-ink border-line'
                    : 'text-ink-3 border-line bg-inset'
                }`}
                title={
                  permission === 'denied'
                    ? 'Trình duyệt đã chặn thông báo'
                    : pushOn
                    ? 'Push browser: Bật'
                    : 'Push browser: Tắt'
                }
              >
                {pushOn ? (
                  <Bell className="w-3 h-3" />
                ) : (
                  <BellOff className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {notifications.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-ink-3">
                Chưa có thông báo nào.
              </div>
            )}
            {notifications.map((n) => {
              const { text, hasMatch } = describeNotification(n);
              const clickable = hasMatch || n.kind === 'dm';
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  disabled={!clickable}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 transition ${
                    clickable
                      ? 'hover:bg-card cursor-pointer'
                      : 'cursor-default'
                  } ${n.read_at ? 'opacity-60' : ''}`}
                >
                  <Swords className="w-3.5 h-3.5 mt-0.5 text-ink-3 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs text-ink truncate">{text}</div>
                    <div className="text-[10px] font-mono text-ink-3">
                      {new Date(n.created_at).toLocaleString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </div>
                  </div>
                  {!n.read_at && (
                    <span className="ml-auto mt-1 w-2 h-2 rounded-full bg-accent shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
