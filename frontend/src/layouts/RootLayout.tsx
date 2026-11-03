import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApp } from '../context/AppContext';
import { AppHeader } from '../components/AppHeader';
import { LoginScreen, ChangePasswordModal } from '../components/LoginScreen';
import { DmChatModal } from '../components/DmChatModal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { resetRealtime } from '../hooks/useRealtime';

export const RootLayout: React.FC = () => {
  const {
    currentUser,
    authChecking,
    loginError,
    login,
    logout,
    changePassword,
    showPasswordModal,
    setShowPasswordModal,
  } = useAuth();
  const { pushToast } = useToast();
  const {
    status,
    backendError,
    dmTarget,
    setDmTarget,
    openDm,
    notifications,
    unread,
    markAllRead,
  } = useApp();
  const navigate = useNavigate();

  const handleLogin = async (username: string, password: string) => {
    const user = await login(username, password);
    pushToast(`Chào mừng trở lại, ${user.display_name}!`, 'success');
  };

  const handleLogout = () => {
    logout();
    resetRealtime();
    navigate('/');
  };

  const handlePasswordChange = async (newPassword: string, displayName: string) => {
    await changePassword(newPassword, displayName);
    pushToast('Đã cập nhật hồ sơ & mật khẩu thành công.', 'success');
  };

  const handleOpenNotificationMatch = (matchId: string) => {
    navigate(`/match/${matchId}`);
  };

  if (authChecking) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-base text-ink gap-3">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-ink-3">Đang khởi động TheChess...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        errorMessage={loginError}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-base text-ink font-sans">
      <AppHeader
        currentUser={currentUser}
        status={status}
        notifications={notifications}
        unread={unread}
        markAllRead={markAllRead}
        onOpenNotificationMatch={handleOpenNotificationMatch}
        onOpenDm={openDm}
        onOpenChangePassword={() => setShowPasswordModal(true)}
        onLogout={handleLogout}
      />

      {backendError && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[11px] px-4 py-1.5">
          ⚠ {backendError}
        </div>
      )}

      <main className="flex-1 h-full flex flex-col min-h-0 overflow-hidden">
        <ErrorBoundary title="Không thể hiển thị trang">
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Global Modals */}
      <ChangePasswordModal
        open={showPasswordModal || Boolean(currentUser.must_change_password)}
        mandatory={currentUser.must_change_password}
        currentDisplayName={currentUser.display_name}
        onSubmit={handlePasswordChange}
        onClose={() => {
          if (!currentUser.must_change_password) {
            setShowPasswordModal(false);
          }
        }}
      />

      {dmTarget && (
        <DmChatModal
          target={dmTarget}
          currentUser={currentUser}
          onClose={() => setDmTarget(null)}
        />
      )}
    </div>
  );
};

export default RootLayout;
