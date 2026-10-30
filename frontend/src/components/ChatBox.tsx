/**
 * ChatBox — component chat generic theo channel topic, tái dùng cho:
 * chat trong trận (MatchScreen), chat Sảnh (LobbyChat), DM (modal).
 *
 * - Nội dung render dạng text thuần (React escape sẵn — không HTML/markdown).
 * - `locked`: khóa gửi (chat trận sau khi ván kết thúc — chỉ xem lại).
 * - `canModerate`: admin hiện nút xóa từng tin (server publish chat_deleted).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Send } from 'lucide-react';
import type { UserRecord } from '../types';
import { useChat } from '../hooks/useChat';

interface ChatBoxProps {
  topic: string | null;
  currentUser: UserRecord;
  /** Hiển thị tên người gửi theo sender_id */
  getName: (senderId: string) => string;
  /** Khóa ô nhập (mặc định: không) */
  locked?: boolean;
  lockedHint?: string;
  canModerate?: boolean;
  /** Chiều cao vùng tin nhắn (tailwind class) */
  heightClass?: string;
  placeholder?: string;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  topic,
  currentUser,
  getName,
  locked = false,
  lockedHint = 'Kênh chat đã khóa.',
  canModerate = false,
  heightClass = 'h-56',
  placeholder = 'Nhập tin nhắn… (Enter để gửi)',
}) => {
  const { messages, sending, error, send, removeMessage } = useChat(
    topic,
    currentUser
  );
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, topic]);

  if (!topic) return null;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const ok = await send(body);
    if (ok) setDraft('');
  };

  return (
    <div className="flex flex-col min-h-0">
      <div
        ref={scrollRef}
        className={`${heightClass} overflow-y-auto space-y-1.5 pr-1 text-xs`}
      >
        {messages.length === 0 && (
          <div className="text-ink-3 text-center py-6">Chưa có tin nhắn nào.</div>
        )}
        {messages.map((m) => {
          const isMine = m.sender_id === currentUser.id;
          return (
            <div
              key={m.id}
              className={`group flex flex-col ${
                isMine ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-3">
                <span className="font-semibold text-ink-2">
                  {isMine ? 'Bạn' : getName(m.sender_id)}
                </span>
                <span>
                  {new Date(m.created_at).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {canModerate && (
                  <button
                    type="button"
                    onClick={() => removeMessage(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-red-400 transition cursor-pointer"
                    title="Xóa tin nhắn (Admin)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div
                className={`max-w-[85%] px-2 py-1 rounded-lg break-words whitespace-pre-wrap ${
                  isMine
                    ? 'bg-accent/20 text-ink'
                    : 'bg-inset border border-line text-ink'
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {locked ? (
        <div className="mt-2 text-[10px] text-ink-3 italic px-1">{lockedHint}</div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={500}
            placeholder={placeholder}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-inset border border-line text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="px-2 py-1.5 rounded-md bg-accent/20 border border-line text-accent hover:bg-accent/30 disabled:opacity-40 transition cursor-pointer shrink-0"
            title="Gửi"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {error && (
        <div className="mt-1 text-[10px] text-red-400 px-1">{error}</div>
      )}
    </div>
  );
};
