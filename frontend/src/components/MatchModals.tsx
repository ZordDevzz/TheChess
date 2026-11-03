import React from 'react';
import {
  GameConfig,
  GameOverInfo,
  GamePhase,
  GameReviewResult,
  MatchRecord,
  PlayerInfo,
  PresetPosition,
  UserRecord,
} from '../types';
import { PreMatchDialog } from './PreMatchDialog';
import { GameOverDialog } from './GameOverDialog';
import { ChangePasswordModal } from './LoginScreen';
import { DmChatModal } from './DmChatModal';
import { ToastItem, Toasts } from './Toasts';

export interface MatchModalsProps {
  screen: string;
  activeTab: 'play' | 'editor';
  showPreMatch: boolean;
  setShowPreMatch: (show: boolean) => void;
  phase: GamePhase;
  config: GameConfig;
  players: { w: PlayerInfo; b: PlayerInfo };
  playerColor: 'w' | 'b';
  initialFen: string;
  presets: PresetPosition[];
  hasMoves: boolean;
  lc0Ready?: boolean;
  onChangeConfig: (config: GameConfig) => void;
  onChangePlayers: (players: { w: PlayerInfo; b: PlayerInfo }) => void;
  onChangePlayerColor: (color: 'w' | 'b') => void;
  onSelectStartingFen: (fen: string) => void;
  onOpenBoardEditor: () => void;
  onStartGame: () => void;

  showGameOver: boolean;
  setShowGameOver: (show: boolean) => void;
  gameOver: GameOverInfo | null;
  reviewResult: GameReviewResult | null;
  activeMatch: MatchRecord | null;
  onNewGame: () => void;
  onRematch: () => void;
  onAnalyze: () => void;
  onExportPgn: () => void;

  currentUser: UserRecord;
  showPasswordModal?: boolean;
  setShowPasswordModal?: (show: boolean) => void;
  onPasswordChange?: (
    newPass: string,
    displayName: string,
    currentPass?: string
  ) => Promise<void>;

  toasts?: ToastItem[];
  dismissToast?: (id: number) => void;

  dmTarget?: UserRecord | null;
  setDmTarget?: (user: UserRecord | null) => void;

  showPausePrompt?: boolean;
  onConfirmPause?: () => void;
  onDismissPausePrompt?: () => void;
  resumeCountdown?: number | null;
}

export const MatchModals: React.FC<MatchModalsProps> = ({
  screen,
  activeTab,
  showPreMatch,
  setShowPreMatch,
  phase,
  config,
  players,
  playerColor,
  initialFen,
  presets,
  hasMoves,
  lc0Ready,
  onChangeConfig,
  onChangePlayers,
  onChangePlayerColor,
  onSelectStartingFen,
  onOpenBoardEditor,
  onStartGame,

  showGameOver,
  setShowGameOver,
  gameOver,
  reviewResult,
  activeMatch,
  onNewGame,
  onRematch,
  onAnalyze,
  onExportPgn,

  currentUser,
  showPasswordModal,
  setShowPasswordModal,
  onPasswordChange,

  toasts,
  dismissToast,

  dmTarget,
  setDmTarget,

  showPausePrompt,
  onConfirmPause,
  onDismissPausePrompt,
  resumeCountdown,
}) => {
  return (
    <>
      {/* Màn chuẩn bị ván đấu (dùng khi tinh chỉnh sâu trong MatchScreen) */}
      {screen === 'match' && activeTab === 'play' && (
        <PreMatchDialog
          open={showPreMatch && phase === 'setup'}
          config={config}
          players={players}
          playerColor={playerColor}
          initialFen={initialFen}
          presets={presets}
          hasMoves={hasMoves}
          lc0Ready={lc0Ready}
          onChangeConfig={onChangeConfig}
          onChangePlayers={onChangePlayers}
          onChangePlayerColor={onChangePlayerColor}
          onSelectStartingFen={onSelectStartingFen}
          onOpenBoardEditor={onOpenBoardEditor}
          onStart={onStartGame}
          onClose={() => setShowPreMatch(false)}
        />
      )}

      {/* Modal kết thúc ván đấu */}
      {screen === 'match' && (
        <GameOverDialog
          open={showGameOver && !!gameOver}
          gameOver={gameOver}
          players={players}
          accuracy={
            reviewResult
              ? { w: reviewResult.white_accuracy, b: reviewResult.black_accuracy }
              : activeMatch?.white_accuracy != null &&
                activeMatch?.black_accuracy != null
              ? {
                  w: activeMatch.white_accuracy,
                  b: activeMatch.black_accuracy,
                }
              : null
          }
          onNewGame={onNewGame}
          onRematch={onRematch}
          onAnalyze={onAnalyze}
          onExportPgn={onExportPgn}
          onClose={() => setShowGameOver(false)}
        />
      )}

      {/* Modal đổi mật khẩu nếu có */}
      {showPasswordModal && onPasswordChange && setShowPasswordModal && (
        <ChangePasswordModal
          open={currentUser.must_change_password || showPasswordModal}
          mandatory={currentUser.must_change_password}
          currentDisplayName={currentUser.display_name}
          onSubmit={onPasswordChange}
          onClose={
            currentUser.must_change_password
              ? undefined
              : () => setShowPasswordModal(false)
          }
        />
      )}

      {toasts && dismissToast && <Toasts toasts={toasts} onDismiss={dismissToast} />}

      {/* Modal chat DM nếu có */}
      {dmTarget && setDmTarget && (
        <DmChatModal
          target={dmTarget}
          currentUser={currentUser}
          onClose={() => setDmTarget(null)}
        />
      )}
      {/* Modal hỏi ý kiến đối thủ khi phát hiện ngắt kết nối */}
      {showPausePrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-line-strong rounded-xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <h3 className="font-display font-semibold text-base text-ink">
                Đối thủ đã mất kết nối
              </h3>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed">
              Đối thủ của bạn vừa bị ngắt kết nối khỏi phòng đấu. Bạn có đồng ý tạm dừng ván cờ (Time-out) để bảo lưu thế cờ và đồng hồ cho đến khi đối thủ kết nối lại không?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onDismissPausePrompt}
                className="px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-ink-2 hover:bg-inset hover:text-ink transition cursor-pointer"
              >
                Tiếp tục đợi đồng hồ
              </button>
              <button
                type="button"
                onClick={onConfirmPause}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-ink font-semibold text-xs transition cursor-pointer shadow-xs"
              >
                Đồng ý tạm dừng (Time-out)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal đếm ngược 3s khi kết nối lại để tiếp tục ván đấu */}
      {typeof resumeCountdown === 'number' && resumeCountdown > 0 && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-card border border-line-strong rounded-2xl shadow-2xl p-6 text-center space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider font-mono">
              Kỳ thủ đã sẵn sàng
            </div>
            <h3 className="font-display text-base font-bold text-ink">
              Ván đấu tiếp tục sau
            </h3>
            <div className="text-5xl font-black font-mono text-accent animate-pulse my-2">
              {resumeCountdown}
            </div>
            <p className="text-[11px] text-ink-3">
              Đồng hồ và bàn cờ sẽ mở khóa ngay lập tức.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
