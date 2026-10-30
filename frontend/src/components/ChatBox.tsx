/**
 * ChatBox — component chat generic theo channel topic, tái dùng cho:
 * chat trong trận (MatchScreen), chat Sảnh (LobbyChat), DM (modal).
 *
 * - Tin nhắn dạng bubble có avatar + grouping (cùng người gửi liên tiếp
 *   trong 3 phút thì gộp header), text render thuần (React escape sẵn).
 * - Mention: gõ @ hiển thị gợi ý từ `mentionables`; @username trong tin
 *   nhắn được highlight; click tên người gửi chèn mention nhanh.
 * - `locked`: khóa gửi (chat trận sau khi ván kết thúc — chỉ xem lại).
 * - `canModerate` + `onManageUser`: admin thấy nút xóa tin & quản lý
 *   người gửi trên từng tin (hover).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Send, ShieldCheck } from 'lucide-react';
import type { UserRecord } from '../types';
import { useChat } from '../hooks/useChat';

interface ChatBoxProps {
  topic: string | null;
  currentUser: UserRecord;
  /** Hiển thị tên người gửi theo sender_id */
  getName: (senderId: string) => string;
  /** Username theo sender_id — dùng để highlight mention @username */
  getUsername?: (senderId: string) => string;
  /** Danh sách user để gợi ý mention khi gõ @ */
  mentionables?: UserRecord[];
  /** Khóa ô nhập (mặc định: không) */
  locked?: boolean;
  lockedHint?: string;
  canModerate?: boolean;
  /** Admin: mở quản lý người gửi (mở modal hồ sơ/quản trị) */
  onManageUser?: (senderId: string) => void;
  /** Chiều cao vùng tin nhắn (tailwind class) — bỏ qua khi fillHeight */
  heightClass?: string;
  /** Chiếm trọn chiều cao cha (rail chat), vùng tin nhắn co giãn theo */
  fillHeight?: boolean;
  placeholder?: string;
}

/** Màu avatar ổn định theo user id (hash -> hue). */
function avatarStyle(id: string): { background: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return { background: `hsl(${h} 45% 38%)` };
}

/** Tách body thành segment thường / mention (@username) để render highlight. */
function splitMentions(
  body: string,
  currentUsername: string | undefined
): Array<{ text: string; mention: boolean; isSelf: boolean }> {
  const parts: Array<{ text: string; mention: boolean; isSelf: boolean }> = [];
  const re = /@([A-Za-z0-9_]{3,64})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ text: body.slice(last, m.index), mention: false, isSelf: false });
    parts.push({
      text: m[0],
      mention: true,
      isSelf: !!currentUsername && m[1].toLowerCase() === currentUsername.toLowerCase(),
    });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), mention: false, isSelf: false });
  return parts;
}

const GROUP_WINDOW_MS = 3 * 60 * 1000;

export const ChatBox: React.FC<ChatBoxProps> = ({
  topic,
  currentUser,
  getName,
  getUsername,
  mentionables = [],
  locked = false,
  lockedHint = 'Kênh chat đã khóa.',
  canModerate = false,
  onManageUser,
  heightClass = 'h-56',
  fillHeight = false,
  placeholder = 'Nhập tin nhắn… (Enter để gửi)',
}) => {
  const { messages, sending, error, send, removeMessage } = useChat(
    topic,
    currentUser
  );
  const [draft, setDraft] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, topic]);

  // Trạng thái gợi ý mention: phát hiện "@query" đang gõ ở cuối draft
  const mentionQuery = useMemo(() => {
    const m = draft.match(/@([A-Za-z0-9_]*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [draft]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionables
      .filter(
        (u) =>
          u.id !== currentUser.id &&
          !u.is_bot &&
          (u.username.toLowerCase().startsWith(mentionQuery) ||
            u.display_name.toLowerCase().includes(mentionQuery))
      )
      .slice(0, 5);
  }, [mentionQuery, mentionables, currentUser.id]);

  useEffect(() => setMentionIdx(0), [mentionQuery]);

  const insertMention = (username: string) => {
    setDraft((prev) => prev.replace(/@([A-Za-z0-9_]*)$/, `@${username} `));
    inputRef.current?.focus();
  };

  const insertMentionForUser = (senderId: string) => {
    const uname = getUsername?.(senderId);
    if (uname && !locked) insertMention(uname);
  };

  if (!topic) return null;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const ok = await send(body);
    if (ok) setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIdx].username);
        return;
      }
      if (e.key === 'Escape') {
        // đóng gợi ý: chèn khoảng trắng để phá match @... cuối dòng
        setDraft((prev) => prev.replace(/@([A-Za-z0-9_]*)$/, '@ '));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col min-h-0 ${fillHeight ? 'flex-1' : ''}`}>
      <div
        ref={scrollRef}
        className={`${
          fillHeight ? 'flex-1 min-h-0' : heightClass
        } overflow-y-auto space-y-2 pr-1 text-xs`}
      >
        {messages.length === 0 && (
          <div className="text-ink-3 text-center py-6">Chưa có tin nhắn nào.</div>
        )}
        {messages.map((m, i) => {
          const isMine = m.sender_id === currentUser.id;
          const prev = messages[i - 1];
          const grouped =
            !!prev &&
            prev.sender_id === m.sender_id &&
            new Date(m.created_at).getTime() -
              new Date(prev.created_at).getTime() <
              GROUP_WINDOW_MS;
          const name = getName(m.sender_id);
          return (
            <div
              key={m.id}
              className={`group flex items-start gap-2 ${
                isMine ? 'flex-row-reverse' : ''
              } ${grouped ? 'mt-0.5' : 'mt-2'}`}
            >
              {/* Avatar — ẩn khi group để đọc mạch hội thoại */}
              <div className="w-6 shrink-0">
                {!grouped && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white/90 select-none"
                    style={avatarStyle(m.sender_id)}
                    title={name}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div
                className={`flex flex-col min-w-0 max-w-[78%] ${
                  isMine ? 'items-end' : 'items-start'
                }`}
              >
                {!grouped && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-3 mb-0.5">
                    <button
                      type="button"
                      onClick={() => insertMentionForUser(m.sender_id)}
                      className="font-semibold text-ink-2 hover:text-accent transition cursor-pointer"
                      title={`Nhắc đến ${name}`}
                    >
                      {isMine ? 'Bạn' : name}
                    </button>
                    <span>
                      {new Date(m.created_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                <div
                  className={`px-2.5 py-1.5 rounded-2xl break-words whitespace-pre-wrap ${
                    isMine
                      ? 'bg-accent/25 border border-accent/30 text-ink rounded-br-sm'
                      : 'bg-inset border border-line text-ink rounded-bl-sm'
                  }`}
                >
                  {splitMentions(m.body, currentUser.username).map((seg, j) =>
                    seg.mention ? (
                      <span
                        key={j}
                        className={`font-semibold rounded px-0.5 ${
                          seg.isSelf
                            ? 'bg-accent/40 text-accent-ink'
                            : 'text-accent'
                        }`}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <span key={j}>{seg.text}</span>
                    )
                  )}
                </div>
              </div>

              {/* Hành động admin trên từng tin (hover) */}
              {canModerate && (
                <div className="flex items-center gap-1 self-center opacity-0 group-hover:opacity-100 transition shrink-0">
                  {onManageUser && (
                    <button
                      type="button"
                      onClick={() => onManageUser(m.sender_id)}
                      className="p-1 rounded text-ink-3 hover:text-accent transition cursor-pointer"
                      title="Quản lý người gửi"
                    >
                      <ShieldCheck className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMessage(m.id)}
                    className="p-1 rounded text-ink-3 hover:text-red-400 transition cursor-pointer"
                    title="Xóa tin nhắn (Admin)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {locked ? (
        <div className="mt-2 text-[10px] text-ink-3 italic px-1">{lockedHint}</div>
      ) : (
        <div className="mt-2 flex flex-col relative">
          {/* Gợi ý mention */}
          {mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-56 bg-overlay border border-line-strong rounded-lg shadow-xl overflow-hidden z-10">
              {mentionCandidates.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => insertMention(u.username)}
                  onMouseEnter={() => setMentionIdx(i)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition cursor-pointer ${
                    i === mentionIdx ? 'bg-card' : ''
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white/90 shrink-0"
                    style={avatarStyle(u.id)}
                  >
                    {u.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-ink truncate">
                      {u.display_name}
                    </div>
                    <div className="text-[9px] font-mono text-ink-3 truncate">
                      @{u.username}
                    </div>
                  </div>
                </button>
              ))}
              <div className="px-2 py-1 border-t border-line text-[9px] text-ink-3">
                ↑↓ chọn · Tab/Enter chèn · Esc tắt
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
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
        </div>
      )}
      {error && (
        <div className="mt-1 text-[10px] text-red-400 px-1">{error}</div>
      )}
    </div>
  );
};
