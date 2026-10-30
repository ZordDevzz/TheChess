/**
 * LobbyChat — chat Sảnh (topic "lobby").
 * - Chế độ khối (fillHeight = false): chiều cao cố định, dùng cho nhúng trong luồng.
 * - Chế độ rail (fillHeight = true): chiếm trọn chiều cao cha (rail phải trên
 *   màn 2xl+), vùng tin nhắn cuộn nội bộ.
 * Tên người gửi resolve từ danh sách user Sảnh (cache), fallback rút gọn id.
 */
import React from 'react';
import type { UserRecord } from '../types';
import { ChatBox } from './ChatBox';

interface LobbyChatProps {
  currentUser: UserRecord;
  /** Danh sách user để hiện display_name cho sender_id */
  knownUsers: UserRecord[];
  canModerate?: boolean;
  /** Chiếm trọn chiều cao cha (rail full-height trên 2xl+) */
  fillHeight?: boolean;
}

export const LobbyChat: React.FC<LobbyChatProps> = ({
  currentUser,
  knownUsers,
  canModerate = false,
  fillHeight = false,
}) => {
  const nameMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const u of knownUsers) m.set(u.id, u.display_name);
    return m;
  }, [knownUsers]);

  return (
    <div
      className={`bg-card border border-line rounded-xl p-3.5 flex flex-col min-h-0 ${
        fillHeight ? 'flex-1' : ''
      }`}
    >
      <div className="text-[11px] font-semibold text-ink mb-2 shrink-0">
        Chat Sảnh
        <span className="ml-1.5 text-[9px] font-normal text-ink-3">
          mọi thành viên
        </span>
      </div>
      <ChatBox
        topic="lobby"
        currentUser={currentUser}
        getName={(id) => nameMap.get(id) ?? 'Kỳ thủ'}
        canModerate={canModerate}
        fillHeight={fillHeight}
        heightClass={fillHeight ? undefined : 'h-48'}
        placeholder="Trò chuyện với cả câu lạc bộ…"
      />
    </div>
  );
};
