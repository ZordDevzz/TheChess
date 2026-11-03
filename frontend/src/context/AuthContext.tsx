/**
 * AuthContext — trạng thái đăng nhập & vòng đời token (Multiplayer V3):
 * khởi tạo Quick-Link (?q= / ?login_token=), khôi phục phiên token có sẵn,
 * login/logout/đổi mật khẩu và làm mới currentUser sau ván đấu.
 * App bọc Provider và truyền pushToast để hiển thị thông báo Quick-Link.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  changePasswordApi,
  clearAuthToken,
  fetchMeApi,
  getAuthToken,
  loginApi,
  quickLoginApi,
  setAuthToken,
} from '../api';
import { ensureStarted } from '../hooks/useRealtime';
import { UserRecord } from '../types';
import { ToastKind } from '../components/Toasts';
import { useToast } from './ToastContext';

interface AuthContextValue {
  currentUser: UserRecord | null;
  authChecking: boolean;
  loginError: string | null;
  showPasswordModal: boolean;
  setShowPasswordModal: React.Dispatch<React.SetStateAction<boolean>>;
  /** Đăng nhập username/password — trả về user vừa đăng nhập */
  login: (username: string, password: string) => Promise<UserRecord>;
  /** Xóa token & user hiện tại (App tự reset trạng thái ván đấu liên quan) */
  logout: () => void;
  /** Đổi mật khẩu + tên hiển thị, tự làm mới token */
  changePassword: (
    newPassword: string,
    displayName: string,
    currentPassword?: string
  ) => Promise<void>;
  /** Làm mới currentUser từ backend (ví dụ sau ván có elo mới) */
  refreshCurrentUser: () => Promise<UserRecord>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{
  children: React.ReactNode;
  pushToast?: (msg: string, kind?: ToastKind) => void;
}> = ({ children, pushToast: propPushToast }) => {
  const toastCtx = useToast();
  const pushToast = propPushToast || toastCtx.pushToast;
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);

  // ------------------ Khởi tạo Auth & Quick-Link ------------------

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const quickToken = params.get('q') || params.get('login_token');
      if (quickToken) {
        try {
          const res = await quickLoginApi(quickToken);
          if (cancelled) return;
          setAuthToken(res.token);
          ensureStarted();
          window.history.replaceState({}, '', window.location.pathname);
          setCurrentUser(res.user);
          if (res.user.must_change_password) {
            setShowPasswordModal(true);
          }
          setAuthChecking(false);
          pushToast(
            `Xin chào ${res.user.display_name}! Đã đăng nhập qua Quick-Link.`,
            'success'
          );
          return;
        } catch (err) {
          console.error('Quick-link error:', err);
          window.history.replaceState({}, '', window.location.pathname);
          if (!cancelled) {
            setLoginError(
              err instanceof Error
                ? err.message
                : 'Quick-Link không hợp lệ hoặc đã hết hạn.'
            );
          }
        }
      }

      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          const me = await fetchMeApi();
          if (!cancelled) {
            ensureStarted();
            setCurrentUser(me);
          }
        } catch {
          clearAuthToken();
        }
      }
      if (!cancelled) {
        setAuthChecking(false);
      }
    };

    initAuth();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => {
    if (currentUser?.must_change_password) {
      setShowPasswordModal(true);
    }
  }, [currentUser?.must_change_password]);

  const login = useCallback(async (username: string, password: string) => {
    setLoginError(null);
    const res = await loginApi(username, password);
    setAuthToken(res.token);
    ensureStarted();
    setCurrentUser(res.user);
    if (res.user.must_change_password) {
      setShowPasswordModal(true);
    }
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setCurrentUser(null);
  }, []);

  const changePassword = useCallback(
    async (
      newPassword: string,
      displayName: string,
      currentPassword?: string
    ) => {
      const res = await changePasswordApi(
        newPassword,
        displayName,
        currentPassword
      );
      setAuthToken(res.token);
      setCurrentUser(res.user);
      setShowPasswordModal(false);
    },
    []
  );

  const refreshCurrentUser = useCallback(() => {
    return fetchMeApi().then((me) => {
      setCurrentUser(me);
      return me;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      authChecking,
      loginError,
      showPasswordModal,
      setShowPasswordModal,
      login,
      logout,
      changePassword,
      refreshCurrentUser,
    }),
    [
      currentUser,
      authChecking,
      loginError,
      showPasswordModal,
      login,
      logout,
      changePassword,
      refreshCurrentUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong <AuthProvider>');
  return ctx;
}
