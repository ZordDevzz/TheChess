import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  KeyRound,
  LogOut,
  Shield,
} from 'lucide-react';
import { AppScreen, UserRecord } from '../types';

interface UserDropdownMenuProps {
  user: UserRecord;
  currentScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export const UserDropdownMenu: React.FC<UserDropdownMenuProps> = ({
  user,
  currentScreen,
  onNavigate,
  onOpenChangePassword,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line bg-inset hover:border-line-strong text-[11px] text-ink transition cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="font-medium truncate max-w-[110px]">
          {user.display_name}
        </span>
        <span className="font-mono text-[10px] text-ink-2">
          {user.rating}
        </span>
        {user.role === 'admin' && (
          <span className="px-1 py-0.2 rounded bg-accent/20 text-ink text-[9px] font-mono uppercase">
            Admin
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-ink-2 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-60 rounded-lg border border-line-strong bg-overlay shadow-2xl p-2 z-50 space-y-1.5"
        >
          {/* Thông tin tài khoản */}
          <div className="px-2.5 py-2 rounded-md bg-inset border border-line space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink truncate">
                {user.display_name}
              </span>
              <span className="font-mono text-[11px] text-ink font-semibold">
                {user.rating} Elo
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-ink-2 font-mono">
              <span>@{user.username}</span>
              <span>
                {user.wins}T · {user.draws}H · {user.losses}B
              </span>
            </div>
            {user.avg_accuracy != null && (
              <div className="text-[10px] text-ink-2 font-mono">
                Độ chuẩn TB: {user.avg_accuracy.toFixed(1)}% · Đỉnh:{' '}
                {user.peak_rating}
              </div>
            )}
          </div>

          <div className="space-y-0.5">
            {user.role === 'admin' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onNavigate('admin');
                }}
                className={`w-full px-2.5 py-1.5 rounded text-left text-xs flex items-center gap-2 transition cursor-pointer ${
                  currentScreen === 'admin'
                    ? 'bg-accent text-accent-ink font-semibold'
                    : 'text-ink hover:bg-card/70 font-medium'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Quản lý tài khoản (Admin UI)
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenChangePassword();
              }}
              className="w-full px-2.5 py-1.5 rounded text-left text-xs text-ink-2 hover:text-ink hover:bg-card/60 flex items-center gap-2 transition cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Đổi mật khẩu & Tên hiển thị
            </button>
          </div>

          <div className="pt-1 border-t border-line">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full px-2.5 py-1.5 rounded text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
