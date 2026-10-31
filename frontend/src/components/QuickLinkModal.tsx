import React, { useState, useEffect } from 'react';
import {
  Link2,
  Copy,
  Check,
  KeyRound,
  ShieldAlert,
  Clock,
  ExternalLink,
  X,
  Share2,
  RefreshCw,
} from 'lucide-react';
import { adminGenerateQuickLinkApi } from '../api';
import { UserRecord } from '../types';

export interface QuickLinkModalProps {
  user: UserRecord;
  initialPassword?: string;
  initialQuickToken?: string;
  lanIp?: string;
  onClose: () => void;
  onNotify: (msg: string, type?: 'info' | 'success' | 'error') => void;
  onUserUpdated?: (updatedUser: UserRecord) => void;
}

export const QuickLinkModal: React.FC<QuickLinkModalProps> = ({
  user,
  initialPassword,
  initialQuickToken,
  lanIp,
  onClose,
  onNotify,
  onUserUpdated,
}) => {
  // Settings
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(
    user.must_change_password
  );
  const [ttlDays, setTtlDays] = useState<number>(14);
  const [resetPreviousLinks, setResetPreviousLinks] = useState<boolean>(false);
  const [hostAddress, setHostAddress] = useState<string>(() => {
    const currentHost = window.location.hostname;
    const isLoopback =
      currentHost === 'localhost' ||
      currentHost === '127.0.0.1' ||
      currentHost === '0.0.0.0';
    return isLoopback && lanIp ? lanIp : currentHost;
  });

  // Generated Link state
  const [token, setToken] = useState<string | null>(initialQuickToken || null);
  const [generating, setGenerating] = useState(false);
  const [copiedType, setCopiedType] = useState<'link' | 'invite' | null>(null);

  const buildUrl = (tokenVal: string, host: string): string => {
    const protocol = window.location.protocol || 'http:';
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${host}${port}/?q=${encodeURIComponent(tokenVal)}`;
  };

  const currentQuickUrl = token ? buildUrl(token, hostAddress) : null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await adminGenerateQuickLinkApi(user.id, {
        must_change_password: mustChangePassword,
        reset_previous_links: resetPreviousLinks,
        ttl_days: ttlDays,
      });

      setToken(res.quick_login_token);
      setResetPreviousLinks(false); // Reset cờ sau khi đã thực hiện

      if (onUserUpdated) {
        onUserUpdated(res.user);
      }

      onNotify(
        `Đã tạo Quick-Link mới cho @${user.username} thành công!`,
        'success'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Lỗi khi tạo Quick-Link.',
        'error'
      );
    } finally {
      setGenerating(false);
    }
  };

  // Tự động tạo link lần đầu nếu chưa có token
  useEffect(() => {
    if (!token) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = async (text: string, type: 'link' | 'invite') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      onNotify(
        type === 'link'
          ? 'Đã sao chép liên kết vào clipboard!'
          : 'Đã sao chép toàn bộ thông điệp mời!',
        'success'
      );
      window.setTimeout(() => setCopiedType(null), 2500);
    } catch {
      onNotify('Không sao chép tự động được, vui lòng chọn và copy thủ công.', 'info');
    }
  };

  const generateInviteMessage = (): string => {
    if (!currentQuickUrl) return '';
    const lines = [
      `♟️ Mời bạn tham gia CLB Cờ Vua TheChess!`,
      `- Tài khoản: @${user.username} (${user.display_name})`,
      initialPassword ? `- Mật khẩu tạm: ${initialPassword}` : null,
      `- Link đăng nhập 1 chạm: ${currentQuickUrl}`,
      mustChangePassword
        ? `(Lưu ý: Hệ thống sẽ yêu cầu bạn đặt mật khẩu riêng ngay khi truy cập)`
        : null,
      `Chúc bạn có những ván cờ thật hay!`,
    ];
    return lines.filter(Boolean).join('\n');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[3px] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-overlay border border-line-strong rounded-2xl shadow-2xl p-5 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-ink flex items-center gap-2">
                Quick-Link Đăng Nhập
              </h2>
              <p className="text-xs text-ink-2">
                Cấp liên kết đăng nhập 1 chạm cho{' '}
                <strong className="text-ink font-semibold">
                  {user.display_name}
                </strong>{' '}
                <span className="font-mono text-ink-3">(@{user.username})</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-3 hover:text-ink hover:bg-card transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thông tin tài khoản & Mật khẩu tạm nếu có */}
        <div className="bg-inset rounded-xl p-3 border border-line space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-card border border-line font-mono font-semibold text-ink">
                Elo {user.rating}
              </span>
              <span className="px-2 py-0.5 rounded bg-card border border-line font-mono text-ink-2">
                {user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
              </span>
            </div>

            {user.must_change_password ? (
              <span className="text-[11px] font-medium text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30 inline-flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                Đang chờ đổi mật khẩu
              </span>
            ) : (
              <span className="text-[11px] font-medium text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/30 inline-flex items-center gap-1">
                <KeyRound className="w-3 h-3" />
                Mật khẩu cố định
              </span>
            )}
          </div>

          {initialPassword && (
            <div className="pt-2 border-t border-line/60 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-ink-3 block text-[10px]">Mật khẩu khởi tạo:</span>
                <span className="font-mono font-semibold text-ink text-sm">
                  {initialPassword}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(initialPassword, 'link')}
                className="px-2 py-1 rounded bg-card border border-line hover:border-line-strong text-[11px] text-ink-2 hover:text-ink transition cursor-pointer"
              >
                Copy pass
              </button>
            </div>
          )}
        </div>

        {/* Cấu hình Quick-Link */}
        <div className="space-y-3 pt-1">
          <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <span>Cài đặt bảo mật & tùy chọn</span>
          </div>

          {/* Setting 1: Ép đổi mật khẩu */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-card border border-line hover:border-accent/40 cursor-pointer transition">
            <input
              type="checkbox"
              checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-line text-accent focus:ring-accent accent-accent cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                Ép đổi mật khẩu sau khi đăng nhập
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5 leading-relaxed">
                Người chơi truy cập qua link sẽ phải đặt mật khẩu cá nhân mới trước khi vào sảnh thi đấu.
              </div>
            </div>
          </label>

          {/* Setting 2: Thời hạn hiệu lực */}
          <div className="p-3 rounded-xl bg-card border border-line space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-accent" />
                Thời hạn hiệu lực của link
              </span>
              <span className="font-mono text-ink-2 text-[11px]">
                {ttlDays} ngày
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { days: 1, label: '1 ngày' },
                { days: 7, label: '7 ngày' },
                { days: 14, label: '14 ngày' },
                { days: 30, label: '30 ngày' },
                { days: 90, label: '90 ngày' },
              ].map(({ days, label }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTtlDays(days)}
                  className={`py-1.5 px-1 rounded-lg text-xs font-mono transition cursor-pointer border text-center ${
                    ttlDays === days
                      ? 'bg-accent text-accent-ink font-semibold border-accent shadow-xs'
                      : 'bg-inset border-line text-ink-2 hover:text-ink hover:border-line-strong'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 3: Hủy toàn bộ link cũ */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-card border border-line hover:border-line-strong cursor-pointer transition">
            <input
              type="checkbox"
              checked={resetPreviousLinks}
              onChange={(e) => setResetPreviousLinks(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-line text-accent focus:ring-accent accent-accent cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink">
                Vô hiệu hóa toàn bộ Quick-Link cũ đã cấp
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5 leading-relaxed">
                Tăng epoch bảo mật để hủy tất cả các link 1 chạm đã phát hành trước đây của tài khoản này.
              </div>
            </div>
          </label>

          {/* Setting 4: LAN Host / IP */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-card border border-line text-xs">
            <span className="text-ink-3 font-mono shrink-0">LAN Host / IP:</span>
            <input
              type="text"
              value={hostAddress}
              onChange={(e) => setHostAddress(e.target.value.trim())}
              placeholder="192.168.x.x"
              className="flex-1 bg-inset border border-line rounded px-2 py-1 font-mono text-xs text-accent font-semibold focus:outline-none focus:border-accent"
            />
            {lanIp && hostAddress !== lanIp && (
              <button
                type="button"
                onClick={() => setHostAddress(lanIp)}
                className="px-2 py-1 rounded bg-inset border border-line hover:border-line-strong text-[11px] text-ink-2 hover:text-ink shrink-0 cursor-pointer"
                title="Sử dụng IP LAN phát hiện được từ Server"
              >
                Dùng IP Server
              </button>
            )}
          </div>
        </div>

        {/* Nút Tạo lại / Cập nhật Link */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-2.5 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-accent-ink font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Đang tạo Quick-Link…' : 'Cập nhật cài đặt & Tạo lại Link'}
        </button>

        {/* Kết quả Link & Nút Copy */}
        {currentQuickUrl && (
          <div className="bg-inset rounded-xl p-3 border border-line space-y-2.5">
            <div>
              <span className="text-ink-3 block text-[10px] mb-1 font-mono">
                Liên kết đăng nhập 1 chạm (URL):
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={currentQuickUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-card border border-line rounded-lg px-2.5 py-1.5 font-mono text-xs text-accent break-all select-all focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => copyToClipboard(currentQuickUrl, 'link')}
                className="flex-1 min-w-[120px] py-2 px-3 rounded-lg bg-accent text-accent-ink font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {copiedType === 'link' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedType === 'link' ? 'Đã sao chép!' : 'Copy Link'}
              </button>

              <button
                type="button"
                onClick={() =>
                  copyToClipboard(generateInviteMessage(), 'invite')
                }
                className="flex-1 min-w-[140px] py-2 px-3 rounded-lg bg-card hover:bg-panel border border-line text-ink font-medium text-xs inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {copiedType === 'invite' ? (
                  <Check className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 text-accent" />
                )}
                {copiedType === 'invite' ? 'Đã sao chép lời mời!' : 'Copy thông điệp mời'}
              </button>

              <a
                href={currentQuickUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg bg-card hover:bg-panel border border-line text-ink-2 hover:text-ink transition cursor-pointer"
                title="Mở thử trong tab mới (khuyến cáo dùng ẩn danh để không trùng phiên Admin)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-ink-3">
          <span>Chuẩn chữ ký HMAC 19 ký tự bảo mật.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-card hover:bg-panel border border-line text-ink font-medium transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
