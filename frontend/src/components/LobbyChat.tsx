/**
 * LobbyChat — chat Sảnh (topic "lobby"), khối dưới danh sách Kỳ thủ trên Sảnh.
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
}

export const LobbyChat: React.FC<LobbyChatProps> = ({
  currentUser,
  knownUsers,
  canModerate = false,
}) => {
  const nameMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const u of knownUsers) m.set(u.id, u.display_name);
    return m;
  }, [knownUsers]);

  return (
    <div className="bg-card border border-line rounded-xl p-3.5">
      <div className="text-[11px] font-semibold text-ink mb-2">
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
        heightClass="h-48"
        placeholder="Trò chuyện với cả câu lạc bộ…"
      />
    </div>
  );
};
