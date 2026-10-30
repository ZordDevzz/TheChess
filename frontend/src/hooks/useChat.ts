/**
 * useChat — chat theo channel topic dựa trên useRealtime (mẫu notify + refetch):
 * server push event nhẹ {"type":"chat" | "chat_deleted"}, client tự fetch lại
 * từ REST (nguồn truth). Dùng chung cho 3 nơi: chat trận, chat Sảnh, DM.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChatMessagesApi,
  sendChatMessageApi,
  deleteChatMessageApi,
} from '../api';
import type { ChatMessage, UserRecord } from '../types';
import { useRealtime } from './useRealtime';

export function useChat(
  topic: string | null,
  currentUser: UserRecord
): {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  send: (body: string) => Promise<boolean>;
  removeMessage: (id: string) => Promise<void>;
} {
  const { subscribe } = useRealtime();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  // Snapshot ban đầu + refetch khi có event "chat" trên topic.
  useEffect(() => {
    if (!topic) {
      setMessages([]);
      knownIds.current = new Set();
      return;
    }
    let cancelled = false;

    const refetchLatest = async () => {
      try {
        const latest = await fetchChatMessagesApi(topic, undefined, 50);
        if (cancelled) return;
        knownIds.current = new Set(latest.map((m) => m.id));
        setMessages(latest);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi tải chat');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    setError(null);
    refetchLatest();

    const unsub = subscribe(topic, (event) => {
      if (event.type === 'chat') {
        // Ưu tiên dùng payload event (server gửi kèm message đầy đủ) — tránh
        // trùng lặp với chính tin mình vừa gửi.
        const msg = {
          id: String(event.message_id),
          topic,
          sender_id: String(event.sender_id),
          body: String(event.body),
          created_at: String(event.created_at),
        } as ChatMessage;
        if (!knownIds.current.has(msg.id)) {
          knownIds.current.add(msg.id);
          setMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg]);
        }
      } else if (event.type === 'chat_deleted') {
        const id = String(event.message_id);
        knownIds.current.delete(id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [topic, subscribe]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!topic || !body.trim()) return false;
      setSending(true);
      setError(null);
      try {
        // Không optimistic-add: chính mình cũng nhận event qua topic subscribe
        // (single source) — tránh hiện 2 lần.
        await sendChatMessageApi(topic, body.trim());
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không gửi được tin nhắn.');
        return false;
      } finally {
        setSending(false);
      }
    },
    [topic]
  );

  const removeMessage = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteChatMessageApi(id);
      knownIds.current.delete(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được tin nhắn.');
    }
  }, []);

  return { messages, loading, sending, error, send, removeMessage };
}

/** Topic DM chuẩn hóa: 2 id sort tăng dần để 2 phía ra cùng topic. */
export function buildDmTopic(userAId: string, userBId: string): string {
  const [lo, hi] = [userAId, userBId].sort();
  return `dm:${lo}:${hi}`;
}
