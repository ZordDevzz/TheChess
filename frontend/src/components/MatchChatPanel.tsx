/**
 * MatchChatPanel — chat trong trận (topic match:{id}), cho cả 2 kỳ thủ và
 * khán giả. Thu gọn được; khóa gửi khi ván kết thúc (chat vẫn xem lại được).
 */
import React, { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import type { MatchRecord, UserRecord } from '../types';
import { ChatBox } from './ChatBox';

interface MatchChatPanelProps {
  match: MatchRecord;
  currentUser: UserRecord;
  /** Bản đồ sender_id -> display name (từ players + cache lobby) */
  getName: (senderId: string) => string;
  canModerate?: boolean;
}

export const MatchChatPanel: React.FC<MatchChatPanelProps> = ({
  match,
  currentUser,
  getName,
  canModerate = false,
}) => {
  const [open, setOpen] = useState(true);
  const locked = match.status === 'finished' || match.status === 'aborted';

  return (
    <div className="shrink-0 border-b border-line bg-panel px-3.5 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-[11px] font-medium text-ink-2 hover:text-ink transition cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          Chat trận
          {locked && (
            <span className="text-[9px] text-ink-3 italic">
              (đã khóa — xem lại)
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      {open && (
        <div className="mt-2">
          <ChatBox
            topic={`match:${match.id}`}
            currentUser={currentUser}
            getName={getName}
            locked={locked}
            lockedHint="Ván đấu đã kết thúc — kênh chat bị khóa, lịch sử vẫn được giữ lại."
            canModerate={canModerate}
            heightClass="h-44"
            placeholder="Nhắn trong trận… (khán giả cũng xem được)"
          />
        </div>
      )}
    </div>
  );
};
