/**
 * DmChatModal — modal chat riêng giữa 2 user (topic dm:{a}:{b}, id sorted).
 * Đóng modal = unsubscribe (hub tự dọn khi hết handler).
 */
import React from 'react';
import { X } from 'lucide-react';
import type { UserRecord } from '../types';
import { ChatBox } from './ChatBox';
import { buildDmTopic } from '../hooks/useChat';

interface DmChatModalProps {
  target: UserRecord;
  currentUser: UserRecord;
  onClose: () => void;
}

export const DmChatModal: React.FC<DmChatModalProps> = ({
  target,
  currentUser,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-panel border border-line-strong rounded-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink truncate">
              {target.display_name}
            </div>
            <div className="text-[10px] font-mono text-ink-3">
              @{target.username} · {target.rating} Elo
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-ink-2 hover:text-ink hover:bg-card transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3">
          <ChatBox
            topic={buildDmTopic(currentUser.id, target.id)}
            currentUser={currentUser}
            getName={(id) => (id === target.id ? target.display_name : 'Bạn')}
            getUsername={(id) => (id === target.id ? target.username : currentUser.username)}
            heightClass="h-72"
            placeholder={`Nhắn tới ${target.display_name}…`}
          />
        </div>
      </div>
    </div>
  );
};
