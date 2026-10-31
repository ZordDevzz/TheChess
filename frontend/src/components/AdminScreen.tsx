import React, { useEffect, useState } from 'react';
import {
  Ban,
  Edit3,
  Link2,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  adminAbortMatchApi,
  adminCreateUserApi,
  adminRevokeUserApi,
  adminUpdateUserApi,
  fetchAdminOverviewApi,
} from '../api';
import { MatchSummaryItem, SystemStats, UserRecord } from '../types';
import { QuickLinkModal } from './QuickLinkModal';

interface AdminScreenProps {
  currentUser: UserRecord;
  onOpenMatch: (matchId: string) => void;
  onNotify: (msg: string, kind?: 'info' | 'error' | 'success') => void;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({
  currentUser,
  onOpenMatch,
  onNotify,
}) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeMatches, setActiveMatches] = useState<MatchSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'matches'>('users');

  // Bộ lọc danh sách User
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<'humans' | 'all' | 'bots'>(
    'humans'
  );

  // Modal cấp tài khoản mới
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'player' | 'admin'>('player');
  const [newRating, setNewRating] = useState<number>(1500);
  const [mustChangePass, setMustChangePass] = useState(true);
  const [creatingUser, setCreatingUser] = useState(false);

  // Địa chỉ IP LAN thực & Target mở modal Quick-Link
  const [lanIp, setLanIp] = useState<string>('');
  const [quickLinkTarget, setQuickLinkTarget] = useState<{
    user: UserRecord;
    initialPassword?: string;
    initialQuickToken?: string;
  } | null>(null);

  // Modal sửa thông tin / Reset mật khẩu User
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRating, setEditRating] = useState<number>(1500);
  const [editRole, setEditRole] = useState<'player' | 'admin'>('player');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminOverviewApi();
      setStats(data.stats);
      setUsers(data.users);
      setActiveMatches(data.active_matches);
      if (data.lan_ip) {
        setLanIp(data.lan_ip);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Lỗi tải dữ liệu Admin.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || newPassword.length < 6) {
      onNotify(
        'Username phải từ 3 ký tự và mật khẩu tối thiểu 6 ký tự.',
        'error'
      );
      return;
    }
    setCreatingUser(true);
    try {
      const res = await adminCreateUserApi({
        username: newUsername.trim(),
        password: newPassword,
        display_name: newDisplayName.trim() || newUsername.trim(),
        role: newRole,
        initial_rating: newRating,
        must_change_password: mustChangePass,
      });
      if (res.lan_ip && !lanIp) {
        setLanIp(res.lan_ip);
      }
      setShowCreateModal(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      // Mở modal Quick-Link riêng cho user vừa tạo kèm mật khẩu khởi tạo
      setQuickLinkTarget({
        user: res.user,
        initialPassword: res.initial_password,
        initialQuickToken: res.quick_login_token,
      });
      onNotify(
        `Đã cấp tài khoản @${res.user.username} thành công!`,
        'success'
      );
      await loadOverview();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không tạo được tài khoản.',
        'error'
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleLockOrRevoke = async (
    u: UserRecord,
    deactivate: boolean
  ) => {
    if (u.id === currentUser.id && deactivate) {
      onNotify('Không thể tự khóa tài khoản Admin đang đăng nhập.', 'error');
      return;
    }
    try {
      if (!u.is_active && !deactivate) {
        // Mở khóa lại
        await adminUpdateUserApi(u.id, { is_active: true });
        onNotify(`Đã mở khóa tài khoản @${u.username}.`, 'success');
      } else {
        await adminRevokeUserApi(u.id, deactivate);
        onNotify(
          deactivate
            ? `Đã khóa tài khoản và thu hồi phiên của @${u.username}.`
            : `Đã thu hồi mọi phiên đăng nhập hiện tại của @${u.username}.`,
          'success'
        );
      }
      await loadOverview();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Thao tác thất bại.',
        'error'
      );
    }
  };

  const openEditUserModal = (u: UserRecord) => {
    setEditingUser(u);
    setEditDisplayName(u.display_name);
    setEditRating(u.rating);
    setEditRole(u.role);
    setEditNewPassword('');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await adminUpdateUserApi(editingUser.id, {
        display_name: editDisplayName.trim() || editingUser.display_name,
        rating: editRating,
        role: editingUser.is_bot ? undefined : editRole,
        new_password: editNewPassword.trim() ? editNewPassword.trim() : undefined,
        must_change_password: editNewPassword.trim() ? true : undefined,
      });
      onNotify(`Đã cập nhật tài khoản @${editingUser.username}.`, 'success');
      setEditingUser(null);
      await loadOverview();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Lỗi cập nhật tài khoản.',
        'error'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAbortMatch = async (matchId: string) => {
    try {
      await adminAbortMatchApi(matchId);
      onNotify('Đã đóng phòng đấu.', 'success');
      await loadOverview();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không đóng được phòng.',
        'error'
      );
    }
  };

  const filteredUsers = users.filter((u) => {
    if (filterKind === 'humans' && u.is_bot) return false;
    if (filterKind === 'bots' && !u.is_bot) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header & Nút cấp tài khoản mới */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-panel border border-line rounded-xl p-4">
          <div>
            <h1 className="font-display text-lg font-semibold text-ink flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              Quản Trị Tài Khoản & Hệ Thống
            </h1>
            <p className="text-xs text-ink-2 mt-0.5">
              Cấp phát tài khoản nội bộ, tạo Quick-Link đăng nhập 1 chạm cho bạn
              bè và giám sát các bàn cờ đang mở.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-inset border border-line text-[11px]"
              title="Địa chỉ IP LAN dùng để tạo Quick-Link chia sẻ cho các máy khác trong mạng nội bộ"
            >
              <span className="text-ink-3 font-mono">LAN Host:</span>
              <input
                type="text"
                value={lanIp}
                onChange={(e) => setLanIp(e.target.value.trim())}
                placeholder="192.168.x.x"
                className="w-28 bg-transparent font-mono text-xs text-accent font-semibold focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={loadOverview}
              className="px-3 py-2 rounded-lg bg-inset border border-line hover:border-line-strong text-xs text-ink-2 hover:text-ink inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Làm mới
            </button>
            <button
              type="button"
              onClick={() => {
                setNewPassword(
                  `chess${Math.floor(1000 + Math.random() * 9000)}`
                );
                setShowCreateModal(true);
              }}
              className="px-3.5 py-2 rounded-lg bg-accent hover:opacity-90 text-accent-ink font-semibold text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              + Cấp tài khoản mới
            </button>
          </div>
        </div>

        {/* 4 Thẻ KPI */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-panel border border-line rounded-xl p-3.5">
              <div className="text-[11px] text-ink-2">Thành viên câu lạc bộ</div>
              <div className="font-mono text-xl font-semibold text-ink mt-1">
                {stats.total_humans}
              </div>
              <div className="text-[10px] text-ink-3 font-mono mt-0.5">
                {stats.active_humans} đang hoạt động · {stats.total_bots} Bot AI
              </div>
            </div>
            <div className="bg-panel border border-line rounded-xl p-3.5">
              <div className="text-[11px] text-ink-2">Phòng chờ ghép cặp</div>
              <div className="font-mono text-xl font-semibold text-ink mt-1">
                {stats.waiting_matches}
              </div>
              <div className="text-[10px] text-ink-3 font-mono mt-0.5">
                Trạng thái waiting
              </div>
            </div>
            <div className="bg-panel border border-line rounded-xl p-3.5">
              <div className="text-[11px] text-ink-2">Bàn cờ đang thi đấu</div>
              <div className="font-mono text-xl font-semibold text-emerald-400 mt-1">
                {stats.playing_matches}
              </div>
              <div className="text-[10px] text-ink-3 font-mono mt-0.5">
                Trạng thái playing trực tiếp
              </div>
            </div>
            <div className="bg-panel border border-line rounded-xl p-3.5">
              <div className="text-[11px] text-ink-2">Tổng số ván đã lưu</div>
              <div className="font-mono text-xl font-semibold text-ink mt-1">
                {stats.finished_matches}
              </div>
              <div className="text-[10px] text-ink-3 font-mono mt-0.5">
                Lưu trữ biên bản & Elo
              </div>
            </div>
          </div>
        )}

        {/* Thanh chuyển Tab Quản lý User / Quản lý Phòng đang mở */}
        <div className="bg-panel border border-line rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex bg-inset p-1 rounded-lg border border-line">
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`px-3 py-1 rounded text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-accent text-accent-ink font-semibold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Danh sách Tài khoản ({users.filter((u) => !u.is_bot).length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matches')}
                className={`px-3 py-1 rounded text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'matches'
                    ? 'bg-accent text-accent-ink font-semibold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                Phòng đấu đang mở ({activeMatches.length})
              </button>
            </div>

            {activeTab === 'users' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm username hoặc tên..."
                    className="bg-inset border border-line rounded-md pl-8 pr-3 py-1 text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="inline-flex bg-inset p-0.5 rounded border border-line text-[11px]">
                  {(
                    [
                      ['humans', 'Người thật'],
                      ['bots', 'Bot AI'],
                      ['all', 'Tất cả'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFilterKind(k)}
                      className={`px-2 py-0.5 rounded-xs transition cursor-pointer ${
                        filterKind === k
                          ? 'bg-card text-ink font-semibold'
                          : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activeTab === 'users' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line text-[11px] text-ink-2 bg-inset/50">
                    <th className="py-2.5 px-4 font-medium">Thành viên</th>
                    <th className="py-2.5 px-3 font-medium">Vai trò</th>
                    <th className="py-2.5 px-3 font-medium">Trạng thái</th>
                    <th className="py-2.5 px-3 font-medium">Elo (Đỉnh)</th>
                    <th className="py-2.5 px-3 font-medium">Thành tích</th>
                    <th className="py-2.5 px-3 font-medium">Chuẩn TB</th>
                    <th className="py-2.5 px-4 font-medium text-right">
                      Thao tác quản trị
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-ink-3"
                      >
                        Đang tải danh sách tài khoản…
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-ink-3"
                      >
                        Không tìm thấy tài khoản phù hợp.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-inset/40 transition"
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-ink">
                            {u.display_name}
                          </div>
                          <div className="text-[11px] font-mono text-ink-3">
                            @{u.username}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {u.is_bot ? (
                            <span className="px-2 py-0.5 rounded bg-inset border border-line text-ink-2">
                              Bot ({u.bot_engine})
                            </span>
                          ) : u.role === 'admin' ? (
                            <span className="px-2 py-0.5 rounded bg-accent/20 text-ink font-semibold">
                              Admin
                            </span>
                          ) : (
                            <span className="text-ink-2">Player</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {!u.is_active ? (
                            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-mono">
                              Đã khóa
                            </span>
                          ) : u.must_change_password ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                              Chờ đổi pass
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                              Hoạt động
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className="font-semibold text-ink">
                            {u.rating}
                          </span>{' '}
                          <span className="text-ink-3 text-[11px]">
                            ({u.peak_rating})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-ink-2">
                          {u.games_played} ván ({u.wins}T-{u.draws}H-{u.losses}
                          B)
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-ink-2">
                          {u.avg_accuracy != null
                            ? `${u.avg_accuracy.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {!u.is_bot && (
                              <button
                                type="button"
                                title="Cấu hình & tạo Quick-Link đăng nhập"
                                onClick={() => setQuickLinkTarget({ user: u })}
                                className="px-2 py-1 rounded bg-inset border border-line hover:border-accent text-[11px] text-ink inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Link2 className="w-3 h-3 text-accent" />
                                Quick-Link
                              </button>
                            )}
                            <button
                              type="button"
                              title="Chỉnh sửa thông tin / Elo / Đặt lại mật khẩu"
                              onClick={() => openEditUserModal(u)}
                              className="px-2 py-1 rounded bg-inset border border-line hover:border-line-strong text-[11px] text-ink-2 hover:text-ink inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              Sửa
                            </button>
                            {!u.is_bot && u.id !== currentUser.id && (
                              <button
                                type="button"
                                title={
                                  u.is_active
                                    ? 'Khóa tài khoản & Thu hồi phiên'
                                    : 'Mở khóa tài khoản'
                                }
                                onClick={() =>
                                  handleToggleLockOrRevoke(u, u.is_active)
                                }
                                className={`px-2 py-1 rounded border text-[11px] inline-flex items-center gap-1 cursor-pointer ${
                                  u.is_active
                                    ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                }`}
                              >
                                <Ban className="w-3 h-3" />
                                {u.is_active ? 'Khóa' : 'Mở khóa'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {activeMatches.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-3">
                  Không có phòng đấu nào đang mở.
                </div>
              ) : (
                activeMatches.map((item) => (
                  <div
                    key={item.match.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-inset border border-line"
                  >
                    <div>
                      <div className="text-xs font-semibold text-ink flex items-center gap-2">
                        <span className="font-mono text-accent">
                          #{item.match.room_code || item.match.id.slice(0, 6)}
                        </span>
                        <span>
                          {item.white_player.display_name} vs{' '}
                          {item.black_player.display_name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-card border border-line text-[10px] font-mono text-ink-2">
                          {item.match.status}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-ink-3 mt-0.5">
                        Chế độ: {item.match.mode} · Số nước:{' '}
                        {item.match.total_plies} ply · Bắt đầu:{' '}
                        {item.match.created_at.slice(0, 19).replace('T', ' ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenMatch(item.match.id)}
                        className="px-2.5 py-1 rounded bg-card border border-line hover:border-line-strong text-xs text-ink cursor-pointer"
                      >
                        Vào xem ↗
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAbortMatch(item.match.id)}
                        className="px-2.5 py-1 rounded bg-red-500/15 border border-red-500/40 text-red-300 text-xs inline-flex items-center gap-1 hover:bg-red-500/25 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Đóng phòng
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Cấp Tài Khoản Mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[3px] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-overlay border border-line-strong rounded-xl shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">
                Cấp tài khoản thành viên mới
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-ink-2 hover:text-ink cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Username đăng nhập *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={64}
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="VD: minh_nguyen"
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Tên hiển thị trên bàn cờ
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="VD: Minh Nguyễn"
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Mật khẩu khởi tạo *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Elo khởi điểm
                  </label>
                  <input
                    type="number"
                    min={400}
                    max={3000}
                    step={50}
                    value={newRating}
                    onChange={(e) => setNewRating(Number(e.target.value))}
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 items-center pt-1">
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Phân quyền
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) =>
                      setNewRole(e.target.value as 'player' | 'admin')
                    }
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs text-ink"
                  >
                    <option value="player">Thành viên (Player)</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-ink-2 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mustChangePass}
                    onChange={(e) => setMustChangePass(e.target.checked)}
                    className="accent-accent"
                  />
                  Nhắc đổi mật khẩu lần đầu
                </label>
              </div>

              <button
                type="submit"
                disabled={creatingUser}
                className="w-full py-2.5 rounded-lg bg-accent hover:opacity-90 disabled:opacity-50 text-accent-ink font-semibold text-xs transition cursor-pointer"
              >
                {creatingUser
                  ? 'Đang tạo tài khoản…'
                  : 'Tạo Tài Khoản & Sinh Quick-Link'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Tài Khoản */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[3px] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-overlay border border-line-strong rounded-xl shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">
                Chỉnh sửa tài khoản @{editingUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-xs text-ink-2 hover:text-ink cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3">
              <div>
                <label className="block text-[11px] text-ink-2 mb-1">
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Điểm Elo
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={3500}
                    value={editRating}
                    onChange={(e) => setEditRating(Number(e.target.value))}
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs font-mono text-ink"
                  />
                </div>
                {!editingUser.is_bot && (
                  <div>
                    <label className="block text-[11px] text-ink-2 mb-1">
                      Vai trò
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) =>
                        setEditRole(e.target.value as 'player' | 'admin')
                      }
                      className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs text-ink"
                    >
                      <option value="player">Player</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                )}
              </div>

              {!editingUser.is_bot && (
                <div>
                  <label className="block text-[11px] text-ink-2 mb-1">
                    Đặt lại mật khẩu mới (để trống nếu giữ nguyên)
                  </label>
                  <input
                    type="text"
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                    className="w-full bg-inset border border-line rounded px-2.5 py-1.5 text-xs font-mono text-ink"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={savingEdit}
                className="w-full py-2 rounded-lg bg-accent hover:opacity-90 disabled:opacity-50 text-accent-ink font-semibold text-xs transition cursor-pointer"
              >
                {savingEdit ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Quick-Link chuyên dụng */}
      {quickLinkTarget && (
        <QuickLinkModal
          user={quickLinkTarget.user}
          initialPassword={quickLinkTarget.initialPassword}
          initialQuickToken={quickLinkTarget.initialQuickToken}
          lanIp={lanIp}
          onClose={() => setQuickLinkTarget(null)}
          onNotify={onNotify}
          onUserUpdated={(updatedUser) => {
            setUsers((prev) =>
              prev.map((item) =>
                item.id === updatedUser.id ? updatedUser : item
              )
            );
          }}
        />
      )}
    </div>
  );
};
