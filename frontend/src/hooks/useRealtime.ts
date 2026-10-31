/**
 * useRealtime — kết nối WebSocket DUY NHẤT cho toàn app (server broadcast +
 * client subscribe theo topic): `match:{id}` | `lobby` | `review:{id}`.
 *
 * Kết nối là singleton mức module (mở lazy khi component đầu tiên mount,
 * đóng khi logout qua `resetRealtime`). Mẫu notify + refetch: server chỉ push
 * event nhẹ, client tự refetch REST (nguồn dữ liệu authority). Tự reconnect
 * backoff, heartbeat "ping" 25s giữ kết nối qua proxy. HTTP còn lại giữ vai
 * trò: snapshot lần đầu, mutations, và poll fallback chậm khi WS rớt.
 */
import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '../api';

export interface RealtimeEvent {
  topic: string;
  type: string;
  [key: string]: unknown;
}

type EventHandler = (event: RealtimeEvent) => void;
type ConnectedListener = (connected: boolean) => void;

const HEARTBEAT_MS = 25_000;
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000];
const BACKOFF_MAX_MS = 10_000;

/** Server đóng kết nối với các code này — retry không thay đổi kết quả */
const FATAL_CLOSE_CODES = new Set([4401, 4404]);

function buildWsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/ws?token=${encodeURIComponent(
    token
  )}`;
}

// ---------------------------------------------------------------------------
// Singleton kết nối (module scope) — mọi hook dùng chung 1 WebSocket.
// ---------------------------------------------------------------------------
const topicHandlers = new Map<string, Set<EventHandler>>();
const connectedListeners = new Set<ConnectedListener>();
let socket: WebSocket | null = null;
let disposed = false;
let attempts = 0;
let reconnectTimer = 0;
let heartbeatTimer = 0;

function setConnected(next: boolean) {
  for (const l of [...connectedListeners]) l(next);
}

function sendAction(action: string, topic: string) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ action, topic }));
  }
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
  }
}

function connect() {
  if (disposed) return;
  const token = getAuthToken();
  if (!token) return;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  socket = new WebSocket(buildWsUrl(token));

  socket.onopen = () => {
    if (disposed) return;
    attempts = 0;
    setConnected(true);
    // Re-subscribe toàn bộ topic còn handler (server không giữ state)
    for (const topic of topicHandlers.keys()) {
      sendAction('subscribe', topic);
    }
    heartbeatTimer = window.setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send('ping');
      }
    }, HEARTBEAT_MS);
  };

  socket.onmessage = (msg: MessageEvent) => {
    if (disposed) return;
    try {
      const data = JSON.parse(String(msg.data)) as RealtimeEvent;
      if (!data.topic) return; // pong / ack / error frame
      const handlers = topicHandlers.get(data.topic);
      if (handlers) {
        for (const h of [...handlers]) h(data);
      }
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
}

export function ensureStarted() {
  disposed = false;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (reconnectTimer) {
    return;
  }
  connect();
}

/**
 * Đóng kết nối & dọn state (gọi khi logout / đổi tài khoản). Lần mount kế tiếp
 * (đăng nhập mới) sẽ tự mở lại với token mới.
 */
export function resetRealtime() {
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
}

function subscribeTopic(topic: string, handler: EventHandler) {
  let set = topicHandlers.get(topic);
  const isNewTopic = !set || set.size === 0;
  if (!set) {
    set = new Set();
    topicHandlers.set(topic, set);
  }
  set.add(handler);
  if (isNewTopic) sendAction('subscribe', topic);
  return () => {
    const s = topicHandlers.get(topic);
    if (!s) return;
    s.delete(handler);
    if (!s.size) {
      topicHandlers.delete(topic);
      sendAction('unsubscribe', topic);
    }
  };
}

// ---------------------------------------------------------------------------
// Hook — mọi component gọi useRealtime() dùng chung singleton trên.
// ---------------------------------------------------------------------------
export function useRealtime(): {
  connected: boolean;
  subscribe: (topic: string, handler: EventHandler) => () => void;
} {
  const [connected, setLocalConnected] = useState(
    Boolean(socket && socket.readyState === WebSocket.OPEN)
  );

  useEffect(() => {
    ensureStarted();
    const listener: ConnectedListener = (b) => setLocalConnected(b);
    connectedListeners.add(listener);
    setLocalConnected(Boolean(socket && socket.readyState === WebSocket.OPEN));
    return () => {
      connectedListeners.delete(listener);
    };
  }, []);

  const subscribe = useCallback(
    (topic: string, handler: EventHandler) => subscribeTopic(topic, handler),
    []
  );

  return { connected, subscribe };
}
