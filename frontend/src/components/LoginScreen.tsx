import React, { useState } from 'react';
import { KeyRound, Lock, LogIn, ShieldCheck, User } from 'lucide-react';
import { ThemePicker } from '../theme/ThemePicker';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  isSubmitting = false,
  errorMessage,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password) {
      setLocalError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Không thể đăng nhập.'
      );
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div className="min-h-screen w-screen bg-base text-ink flex flex-col select-none">
      <header className="h-11 shrink-0 border-b border-line bg-panel px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-sm font-semibold text-ink tracking-tight">
            TheChess
          </span>
          <span className="text-ink-3">/</span>
          <span className="text-xs text-ink-2">Cổng đăng nhập thành viên</span>
        </div>
        <ThemePicker />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-overlay border border-line-strong rounded-xl shadow-2xl p-6 space-y-5">
          <div className="space-y-1 text-center">
            <h1 className="font-display text-xl font-semibold text-ink tracking-tight">
              Phòng Học Cờ & Thi Đấu
            </h1>
            <p className="text-xs text-ink-2">
              Đăng nhập bằng tài khoản được Quản trị viên cấp hoặc sử dụng
              Quick-Link mời trực tiếp.
            </p>
          </div>

          {displayError && (
            <div
              role="alert"
              className="rounded-lg bg-red-500/10 border border-red-500/40 px-3 py-2 text-xs text-red-300"
            >
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="login-username"
                className="block text-[11px] text-ink-2 mb-1"
              >
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập username..."
                  className="w-full bg-inset border border-line rounded-md pl-8 pr-3 py-2 text-xs text-ink focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[11px] text-ink-2 mb-1"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-inset border border-line rounded-md pl-8 pr-3 py-2 text-xs text-ink focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-lg bg-accent hover:opacity-90 disabled:opacity-50 text-accent-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              {isSubmitting ? 'Đang xác thực…' : 'Vào Sảnh Câu Lạc Bộ'}
            </button>
          </form>

          <div className="pt-2 border-t border-line flex items-center justify-between text-[10px] text-ink-3">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-ink-2" />
              Hệ thống nội bộ (Invite-only)
            </span>
            <span className="font-mono">Hỗ trợ ?login_token</span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ChangePasswordModalProps {
  open: boolean;
  mandatory?: boolean;
  currentDisplayName: string;
  onSubmit: (
    newPassword: string,
    displayName: string,
    currentPassword?: string
  ) => Promise<void>;
  onClose?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  open,
  mandatory = false,
  currentDisplayName,
  onSubmit,
  onClose,
}) => {
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mandatory && !currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(
        newPassword,
        displayName.trim() || currentDisplayName,
        currentPassword || undefined
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Lỗi khi cập nhật mật khẩu.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[3px] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="w-full max-w-md bg-overlay border border-line-strong rounded-xl shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3
              id="change-password-title"
              className="font-display text-base font-semibold text-ink flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4 text-accent" />
              {mandatory
                ? 'Kích hoạt tài khoản — Đặt mật khẩu mới'
                : 'Cập nhật Hồ sơ & Mật khẩu'}
            </h3>
            <p className="text-[11px] text-ink-2 mt-0.5">
              {mandatory
                ? 'Tài khoản của bạn đang dùng mật khẩu tạm do Admin cấp. Vui lòng đặt mật khẩu riêng để tiếp tục.'
                : 'Đổi tên hiển thị trên bàn cờ và cập nhật mật khẩu đăng nhập.'}
            </p>
          </div>
          {!mandatory && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-ink-2 hover:text-ink cursor-pointer"
            >
              Đóng
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] text-ink-2 mb-1">
              Tên hiển thị trên bàn cờ
            </label>
            <input
              type="text"
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-inset border border-line rounded-md px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          {!mandatory && (
            <div>
              <label className="block text-[11px] text-ink-2 mb-1">
                Mật khẩu hiện tại
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại..."
                className="w-full bg-inset border border-line rounded-md px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] text-ink-2 mb-1">
              Mật khẩu mới (tối thiểu 6 ký tự)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới..."
              className="w-full bg-inset border border-line rounded-md px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-[11px] text-ink-2 mb-1">
              Xác nhận mật khẩu mới
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới..."
              className="w-full bg-inset border border-line rounded-md px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 rounded-lg bg-accent hover:opacity-90 disabled:opacity-50 text-accent-ink font-semibold text-xs transition cursor-pointer"
          >
            {submitting ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
          </button>
        </form>
      </div>
    </div>
  );
};
