/**
 * useNotifications — kênh thông báo cá nhân (topic user:{id}).
 *
 * - WS push event nhẹ {"type":"notification"} -> refetch REST (nguồn truth).
 * - Đồng bộ unread badge GIỮA CÁC TAB: khi 1 tab mark-read, ghi timestamp vào
 *   localStorage; các tab khác lắng nghe event `storage` rồi refetch.
 * - `onNewItems` gọi với các thông báo vừa tới (chưa đọc, mới hơn lần trước)
 *   để App xử lý toast / browser push / sound.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotificationsApi, markNotificationsReadApi } from '../api';
import type { NotificationItem } from '../types';
import { useRealtime } from './useRealtime';

const LS_READ_KEY = 'thechess_notif_read';

export function useNotifications(
  currentUserId: string | null,
  onNewItems?: (items: NotificationItem[]) => void
): {
  notifications: NotificationItem[];
  unread: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
} {
  const { subscribe } = useRealtime();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const lastSeenId = useRef<string | null>(null);
  const onNewItemsRef = useRef(onNewItems);
  onNewItemsRef.current = onNewItems;

  const refresh = useCallback(async () => {
    try {
      const data = await fetchNotificationsApi();
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      // bỏ qua — lần refetch kế theo sẽ tự hồi phục
    }
  }, []);

  const refreshAndDetectNew = useCallback(async () => {
    try {
      const data = await fetchNotificationsApi();
      setNotifications(data.notifications);
      setUnread(data.unread);
      // Thông báo mới = đứng đầu list, chưa đọc, và chưa từng thấy trong session
      const fresh: NotificationItem[] = [];
      for (const n of data.notifications) {
        if (n.id === lastSeenId.current) break;
        if (!n.read_at) fresh.push(n);
      }
      if (data.notifications.length) {
        lastSeenId.current = data.notifications[0].id;
      }
      if (fresh.length && onNewItemsRef.current) {
        onNewItemsRef.current(fresh);
      }
    } catch {
      // ignore
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const res = await markNotificationsReadApi();
      setUnread(res.unread);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
      );
      // Báo các tab khác cùng user (đồng bộ badge)
      try {
        window.localStorage.setItem(LS_READ_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    refreshAndDetectNew();
    const unsub = subscribe(`user:${currentUserId}`, (event) => {
      if (event.type === 'notification') {
        refreshAndDetectNew();
      }
    });
    // Tab khác mark-read -> refetch để reset badge ở tab này
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_READ_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsub();
      window.removeEventListener('storage', onStorage);
    };
  }, [currentUserId, subscribe, refreshAndDetectNew, refresh]);

  return { notifications, unread, refresh, markAllRead };
}
