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
  showPasswordModal: boolean;
  setShowPasswordModal: (show: boolean) => void;
  onPasswordChange: (
    newPass: string,
    displayName: string,
    currentPass?: string
  ) => Promise<void>;

  toasts: ToastItem[];
  dismissToast: (id: number) => void;

  dmTarget: UserRecord | null;
  setDmTarget: (user: UserRecord | null) => void;
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

      {/* Modal đổi mật khẩu (bắt buộc lần đầu hoặc chủ động từ UserDropdownMenu) */}
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

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {/* Modal chat DM (mở từ Sảnh hoặc từ notification) */}
      {dmTarget && (
        <DmChatModal
          target={dmTarget}
          currentUser={currentUser}
          onClose={() => setDmTarget(null)}
        />
      )}
    </>
  );
};
