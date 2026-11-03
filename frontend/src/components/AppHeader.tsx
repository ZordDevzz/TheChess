import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  AppScreen,
  EngineStatus,
  GameConfig,
  GamePhase,
  MatchRecord,
  NotificationItem,
  UserRecord,
} from '../types';
import { ANALYSIS_LEVEL_LABELS, fenToBoardMap, STARTING_FEN } from '../gameUtils';
import { ThemePicker } from '../theme/ThemePicker';
import { SoundPicker } from './SoundPicker';
import { NotificationBell } from './NotificationBell';
import { UserDropdownMenu } from './UserDropdownMenu';

export interface AppHeaderProps {
  screen?: AppScreen;
  setScreen?: (screen: AppScreen) => void;
  activeTab?: 'play' | 'editor';
  setActiveTab?: (tab: 'play' | 'editor') => void;
  activeMatch?: MatchRecord | null;
  isSpectator?: boolean;
  phase?: GamePhase;
  config?: GameConfig;
  status?: EngineStatus | null;
  chessInstance?: Chess | null;
  currentFen?: string;
  setEditorBoardMap?: (map: Record<string, string>) => void;
  currentUser: UserRecord;
  notifications: NotificationItem[];
  unread: number;
  markAllRead: () => void;
  onOpenNotificationMatch: (matchId: string) => void;
  onOpenDm: (userId: string, displayName: string) => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  modeLabel?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  screen,
  setScreen,
  activeTab,
  setActiveTab,
  activeMatch = null,
  isSpectator = false,
  phase = 'setup',
  config,
  status = null,
  chessInstance = null,
  currentFen = STARTING_FEN,
  setEditorBoardMap,
  currentUser,
  notifications,
  unread,
  markAllRead,
  onOpenNotificationMatch,
  onOpenDm,
  onOpenChangePassword,
  onLogout,
  modeLabel = 'Tiêu chuẩn',
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname;
  const currentTab = new URLSearchParams(location.search).get('tab');

  const resolvedScreen: AppScreen =
    screen ??
    (currentPath === '/'
      ? 'home'
      : currentPath === '/lab'
      ? 'lab'
      : currentPath === '/admin'
      ? 'admin'
      : 'match');

  const resolvedTab = activeTab ?? (currentTab === 'editor' ? 'editor' : 'play');

  return (
    <header className="h-11 shrink-0 border-b border-line bg-panel px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => {
            setScreen?.('home');
            navigate('/');
          }}
          className="font-display text-sm font-semibold text-ink hover:text-accent tracking-tight transition cursor-pointer shrink-0"
          title="Về Sảnh chính"
        >
          TheChess
        </button>

        {/* Thanh điều hướng chính (Primary Navigation) đặt trực tiếp trên Topbar */}
        <nav
          aria-label="Điều hướng chính"
          className="inline-flex items-center bg-inset p-0.5 rounded-md border border-line shrink-0"
        >
          <button
            type="button"
            onClick={() => {
              setScreen?.('home');
              navigate('/');
            }}
            className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
              resolvedScreen === 'home'
                ? 'bg-accent text-accent-ink font-semibold'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            Sảnh câu lạc bộ
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab?.('play');
              setScreen?.('match');
              navigate('/play');
            }}
            className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
              resolvedScreen === 'match' && resolvedTab === 'play'
                ? 'bg-accent text-accent-ink font-semibold'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            Bàn đấu
          </button>
          <button
            type="button"
            onClick={() => {
              setEditorBoardMap?.(fenToBoardMap(currentFen));
              setActiveTab?.('editor');
              setScreen?.('match');
              navigate('/play?tab=editor');
            }}
            className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
              resolvedScreen === 'match' && resolvedTab === 'editor'
                ? 'bg-accent text-accent-ink font-semibold'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            Xếp cờ
          </button>
          <button
            type="button"
            onClick={() => {
              setScreen?.('lab');
              navigate('/lab');
            }}
            className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition cursor-pointer ${
              resolvedScreen === 'lab'
                ? 'bg-accent text-accent-ink font-semibold'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            Phòng Lab
          </button>
        </nav>

        <span className="hidden sm:inline text-ink-3">/</span>

        <div className="hidden sm:flex items-center gap-2 truncate">
          {resolvedScreen === 'home' ? (
            <span className="text-xs text-ink-2 truncate">
              Trực tiếp &amp; Tạo trận
            </span>
          ) : resolvedScreen === 'admin' ? (
            <span className="text-xs text-ink-2 truncate">
              Quản trị tài khoản
            </span>
          ) : resolvedScreen === 'lab' ? (
            <span className="text-xs text-ink-2 truncate">
              AI vs AI · engine thật
            </span>
          ) : chessInstance ? (
            <>
              <span
                className={`w-2 h-2 rounded-full shrink-0 border border-line-strong ${
                  chessInstance.turn() === 'w' ? 'bg-sq-w' : 'bg-sq-b'
                }`}
              />
              <span className="text-xs text-ink-2 truncate">
                {resolvedTab === 'editor'
                  ? 'Thiết lập thế cờ tùy chỉnh'
                  : activeMatch?.status === 'waiting'
                  ? `Phòng chờ #${activeMatch.room_code} · Đang đợi đối thủ`
                  : isSpectator
                  ? `Đang xem trực tiếp${
                      activeMatch?.room_code
                        ? ` #${activeMatch.room_code}`
                        : ''
                    }`
                  : phase === 'setup'
                  ? 'Chuẩn bị ván đấu'
                  : chessInstance.isCheckmate()
                  ? `Chiếu hết · ${
                      chessInstance.turn() === 'w' ? 'Đen' : 'Trắng'
                    } thắng`
                  : chessInstance.isDraw()
                  ? 'Ván cờ hòa'
                  : `Lượt ${chessInstance.turn() === 'w' ? 'Trắng' : 'Đen'}${
                      chessInstance.inCheck() ? ' · Chiếu!' : ''
                    }`}
              </span>
            </>
          ) : (
            <span className="text-xs text-ink-2 truncate">
              {resolvedTab === 'editor' ? 'Thiết lập thế cờ tùy chỉnh' : 'Bàn đấu & Phân tích cờ'}
            </span>
          )}
        </div>
      </div>

      {/* Cụm công cụ phải tối giản */}
      <div className="flex items-center gap-2 shrink-0">
        {resolvedScreen === 'match' && status?.stockfish_ready && config && (
          <span className="hidden md:inline-block text-[11px] font-mono text-ink-2 mr-1">
            {isSpectator ? 'Khán giả · Live Eval' : modeLabel}
            {!isSpectator && phase === 'playing'
              ? ` · ${ANALYSIS_LEVEL_LABELS[config.analysis].label}`
              : ''}
          </span>
        )}

        {/* Giao diện & chất liệu bàn */}
        <ThemePicker />

        {/* Âm thanh trò chơi */}
        <SoundPicker />

        {/* Chuông thông báo realtime */}
        <NotificationBell
          currentUser={currentUser}
          notifications={notifications}
          unread={unread}
          onMarkAllRead={markAllRead}
          onOpenMatch={onOpenNotificationMatch}
          onOpenDm={onOpenDm}
        />

        {/* Menu Tài khoản & Link Admin UI */}
        <UserDropdownMenu
          user={currentUser}
          currentScreen={resolvedScreen}
          onNavigate={(s) => {
            setScreen?.(s);
            navigate(s === 'home' ? '/' : `/${s}`);
          }}
          onOpenChangePassword={onOpenChangePassword}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
};

