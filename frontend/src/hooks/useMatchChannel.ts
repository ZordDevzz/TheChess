/**
 * useMatchChannel — kênh WebSocket push cho một trận đấu (P2-1):
 * server đẩy sự kiện nhẹ `match_updated` / `match_finished`, client refetch REST
 * (nguồn dữ liệu authority) ngay khi nhận. Tự reconnect với backoff, heartbeat
 * "ping" giữ kết nối qua proxy, dọn sạch khi unmount / đổi matchId.
 */
import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../api';

export type MatchChannelEventType = 'match_updated' | 'match_finished';

interface UseMatchChannelParams {
  matchId: string | null;
  enabled: boolean;
  /** Được gọi khi server đẩy `match_updated` / `match_finished` */
  onEvent: (type: MatchChannelEventType) => void;
}

const HEARTBEAT_MS = 25_000;
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000];
const BACKOFF_MAX_MS = 10_000;

/** Server đóng kết nối với các code này — retry không thay đổi kết quả */
const FATAL_CLOSE_CODES = new Set([4401, 4404]);

function buildWsUrl(matchId: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/ws/matches/${encodeURIComponent(
    matchId
  )}?token=${encodeURIComponent(token)}`;
}

/**
 * Mở WebSocket cùng origin cho trận đấu; trả về `connected` để caller điều chỉnh
 * tần suất polling fallback.
 */
export function useMatchChannel({
  matchId,
  enabled,
  onEvent,
}: UseMatchChannelParams): boolean {
  const [connected, setConnected] = useState(false);

  // Giữ callback mới nhất qua ref để đổi onEvent không tái tạo kết nối WS.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !matchId) {
      setConnected(false);
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setConnected(false);
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let heartbeatTimer = 0;
    let attempts = 0;

    const clearHeartbeat = () => {
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = 0;
      }
    };

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(buildWsUrl(matchId, token));

      socket.onopen = () => {
        if (disposed) return;
        attempts = 0;
        setConnected(true);
        heartbeatTimer = window.setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send('ping');
          }
        }, HEARTBEAT_MS);
      };

      socket.onmessage = (msg: MessageEvent) => {
        if (disposed) return;
        try {
          const data = JSON.parse(String(msg.data)) as { type?: unknown };
          if (
            data.type === 'match_updated' ||
            data.type === 'match_finished'
          ) {
            onEventRef.current(data.type);
          }
          // `pong` và các type khác: bỏ qua
        } catch {
          // Frame không phải JSON — bỏ qua
        }
      };

      socket.onclose = (ev: CloseEvent) => {
        clearHeartbeat();
        setConnected(false);
        socket = null;
        if (disposed || FATAL_CLOSE_CODES.has(ev.code)) return;
        const delay =
          attempts < BACKOFF_STEPS_MS.length
            ? BACKOFF_STEPS_MS[attempts]
            : BACKOFF_MAX_MS;
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose sẽ theo sau — xử lý tập trung ở onclose
      };
    };

    connect();

    return () => {
      disposed = true;
      clearHeartbeat();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close(1000);
        } catch {
          // ignore
        }
        socket = null;
      }
      setConnected(false);
    };
  }, [matchId, enabled]);

  return connected;
}
