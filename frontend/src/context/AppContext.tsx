import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchStatus } from '../api';
import { EngineStatus, NotificationItem, UserRecord } from '../types';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useNotifications } from '../hooks/useNotifications';
import { notifyBrowser, playTickSound } from '../components/NotificationBell';

interface AppContextValue {
  status: EngineStatus | null;
  backendError: string | null;
  dmTarget: UserRecord | null;
  setDmTarget: React.Dispatch<React.SetStateAction<UserRecord | null>>;
  openDm: (userId: string, displayName: string) => void;
  notifications: NotificationItem[];
  unread: number;
  markAllRead: () => void;
  refreshNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [dmTarget, setDmTarget] = useState<UserRecord | null>(null);

  // Lấy trạng thái Engine & Presets khi khởi động app
  useEffect(() => {
    fetchStatus()
      .then((data) => {
        setStatus(data);
        setBackendError(null);
      })
      .catch((err) => {
        console.error('Lỗi kết nối backend:', err);
        setBackendError(
          'Không kết nối được backend engine. Hãy khởi động backend bằng ./run.sh rồi tải lại trang.'
        );
      });
  }, []);

  // Xử lý thông báo realtime cho user
  const handleNewNotifications = useCallback(
    (items: NotificationItem[]) => {
      for (const n of items) {
        const p = n.payload as Record<string, unknown>;
        switch (n.kind) {
          case 'turn': {
            if (document.hidden) {
              pushToast('Đến lượt bạn!', 'info');
              notifyBrowser('Đến lượt bạn', 'Đối thủ đã đi nước của họ.');
              playTickSound();
            }
            break;
          }
          case 'challenge':
            pushToast(
              `${String(p.from_display_name ?? 'Có người')} thách đấu bạn — mở chuông thông báo để vào phòng.`,
              'info'
            );
            notifyBrowser(
              'Thách đấu mới',
              `${String(p.from_display_name ?? 'Kỳ thủ')} thách đấu bạn.`
            );
            break;
          case 'match_started':
            pushToast(
              `${String(p.by_display_name ?? 'Đối thủ')} đã vào phòng — ván bắt đầu!`,
              'success'
            );
            notifyBrowser(
              'Ván bắt đầu',
              `${String(p.by_display_name ?? 'Đối thủ')} đã vào phòng.`
            );
            break;
          default:
            break;
        }
      }
    },
    [pushToast]
  );


  const {
    notifications,
    unread,
    refresh: refreshNotifications,
    markAllRead,
  } = useNotifications(currentUser?.id ?? null, handleNewNotifications);

  const openDm = useCallback(
    (userId: string, displayName: string) => {
      if (!currentUser || userId === currentUser.id) return;
      setDmTarget({
        id: userId,
        username: displayName,
        display_name: displayName,
      } as UserRecord);
    },
    [currentUser]
  );

  return (
    <AppContext.Provider
      value={{
        status,
        backendError,
        dmTarget,
        setDmTarget,
        openDm,
        notifications,
        unread,
        markAllRead,
        refreshNotifications,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
