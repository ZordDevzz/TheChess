import React, { Suspense } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import { ListOrdered, MessageSquare, AlertTriangle, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import {
  AssistantEngineConfig,
  FeatureVisibility,
  GameConfig,
  GamePhase,
  GameReviewResult,
  MatchRecord,
  MoveRecord,
  PlayerInfo,
  PresetPosition,
  PVLine,
  UserRecord,
} from '../types';
import type { EditorTool } from './BoardEditor';
import { cburnettPieces } from '../theme/pieces';
import { PlayerCard } from './PlayerCard';
import { CapturedBar } from './CapturedRail';
import { PromotionDialog } from './PromotionDialog';
import { EnginePanel } from './EnginePanel';
import { MatchChatPanel } from './MatchChatPanel';
import { ChatBox } from './ChatBox';
import { MoveHistory } from './MoveHistory';
import { EvalGraph } from './EvalGraph';

const BoardEditor = React.lazy(() =>
  import('./BoardEditor').then((m) => ({ default: m.BoardEditor }))
);
const ReviewScreen = React.lazy(() =>
  import('./ReviewScreen').then((m) => ({ default: m.ReviewScreen }))
);

const LazyFallback: React.FC = () => (
  <div className="flex-1 min-h-[200px] flex items-center justify-center text-xs font-mono text-ink-3">
    Đang tải...
  </div>
);

export interface MatchScreenProps {
  boardStageRef: React.Ref<HTMLDivElement>;
  boardSize: number;
  showSideRails: boolean;
  activeTab: 'play' | 'editor';
  setActiveTab: (tab: 'play' | 'editor') => void;
  reviewMode: boolean;
  setReviewMode: (mode: boolean) => void;

  topSide: 'w' | 'b';
  bottomSide: 'w' | 'b';
  displayedPosition: string;
  boardOrientation: 'white' | 'black';
  customArrows: Arrow[];
  customSquareStyles: Record<string, React.CSSProperties>;
  themeColors: { light: string; dark: string };
  onPieceDrop: (sourceSquare: Square, targetSquare: Square, piece: string) => boolean;
  onSquareClick: (square: Square) => void;

  pendingPromo: { from: string; to: string } | null;
  chessInstance: Chess;
  onPromoPick: (promotionPiece: string) => void;
  onPromoCancel: () => void;

  playerCardProps: (side: 'w' | 'b') => {
    player: PlayerInfo;
    side: 'w' | 'b';
    isTurn: boolean;
    isThinking?: boolean;
    isDisconnected?: boolean;
    rating?: number | null;
    clockMs?: number | null;
  };
  capturedBarProps: (
    side: 'w' | 'b',
    dock: 'bottom' | 'top'
  ) => {
    side: 'w' | 'b';
    symbols: string[];
    diff: number;
    boardSize: number;
    dock: 'bottom' | 'top';
  };

  activeMatch: MatchRecord | null;
  phase: GamePhase;
  showPreMatch: boolean;
  setShowPreMatch: (show: boolean) => void;
  showGameOver: boolean;
  setShowGameOver: (show: boolean) => void;
  onCopyRoomCode: () => void;
  onReturnToLobby: () => void;

  editorBoardMap: Record<string, string>;
  setEditorBoardMap: (map: Record<string, string>) => void;
  editorTool: EditorTool;
  setEditorTool: (tool: EditorTool) => void;
  presets: PresetPosition[];
  onApplyCustomPosition: (fen: string) => void;

  moves: MoveRecord[];
  currentPly: number;
  setCurrentPly: (ply: number) => void;
  reviewResult: GameReviewResult | null;
  isReviewing: boolean;
  reviewProgress: { done: number; total: number } | null;
  onRunGameReview: () => void;
  onUpdateReviewLines: (lines: PVLine[] | null) => void;
  onTryAlternativeMove: (plyBefore: number, uci: string) => void;
  reviewArrowMode?: 'played' | 'suggestions';
  onChangeReviewArrowMode?: (mode: 'played' | 'suggestions') => void;

  config: GameConfig;
  visibility: FeatureVisibility;
  isSpectator: boolean;
  modeLabel: string;
  onOpenConfig: () => void;
  onResign: () => void;
  onHint: () => void;
  canHint: boolean;
  showEval: boolean;
  setShowEval: React.Dispatch<React.SetStateAction<boolean>>;
  showArrows: boolean;
  setShowArrows: React.Dispatch<React.SetStateAction<boolean>>;
  multipv: number;
  setMultipv: (n: number) => void;
  depth: number;
  setDepth: (n: number) => void;
  analysis: any;
  isAnalyzing: boolean;
  onPlaySuggestedMove: (uci: string) => void;
  onTriggerAiMoveNow: () => void;
  isAiThinking: boolean;
  assistantEngine: AssistantEngineConfig;
  setAssistantEngine: React.Dispatch<React.SetStateAction<AssistantEngineConfig>>;

  currentUser: UserRecord;
  players: { w: PlayerInfo; b: PlayerInfo };

  onTakeback: () => void;
  onExportPgn: () => void;
  onBranchFromHere: () => void;
  onFlipBoard: () => void;
  onSwitchSides: () => void;
  onNewGame: () => void;
  onOpenReview: (forceRun?: boolean) => void;
  onResumeMatch?: () => void;
}

export const MatchScreen: React.FC<MatchScreenProps> = ({
  boardStageRef,
  boardSize,
  showSideRails,
  activeTab,
  setActiveTab,
  reviewMode,
  setReviewMode,

  topSide,
  bottomSide,
  displayedPosition,
  boardOrientation,
  customArrows,
  customSquareStyles,
  themeColors,
  onPieceDrop,
  onSquareClick,

  pendingPromo,
  chessInstance,
  onPromoPick,
  onPromoCancel,

  playerCardProps,
  capturedBarProps,

  activeMatch,
  phase,
  showPreMatch,
  setShowPreMatch,
  showGameOver,
  setShowGameOver,
  onCopyRoomCode,
  onReturnToLobby,

  editorBoardMap,
  setEditorBoardMap,
  editorTool,
  setEditorTool,
  presets,
  onApplyCustomPosition,

  moves,
  currentPly,
  setCurrentPly,
  reviewResult,
  isReviewing,
  reviewProgress,
  onRunGameReview,
  onUpdateReviewLines,
  onTryAlternativeMove,
  reviewArrowMode,
  onChangeReviewArrowMode,

  config,
  visibility,
  isSpectator,
  modeLabel,
  onOpenConfig,
  onResign,
  onHint,
  canHint,
  showEval,
  setShowEval,
  showArrows,
  setShowArrows,
  multipv,
  setMultipv,
  depth,
  setDepth,
  analysis,
  isAnalyzing,
  onPlaySuggestedMove,
  onTriggerAiMoveNow,
  isAiThinking,
  assistantEngine,
  setAssistantEngine,

  currentUser,
  players,

  onTakeback,
  onExportPgn,
  onBranchFromHere,
  onFlipBoard,
  onSwitchSides,
  onNewGame,
  onOpenReview,
  onResumeMatch,
}) => {
  const [sidebarTab, setSidebarTab] = React.useState<'moves' | 'chat'>('moves');

  const handleToggleEval = React.useCallback(
    () => setShowEval((v) => !v),
    [setShowEval]
  );
  const handleToggleArrows = React.useCallback(
    () => setShowArrows((v) => !v),
    [setShowArrows]
  );
  const handleSelectPly = React.useCallback(
    (ply: number) => setCurrentPly(ply),
    [setCurrentPly]
  );
  const handleRunReview = React.useCallback(
    () => onOpenReview(true),
    [onOpenReview]
  );
  const handleOpenReview = React.useCallback(
    () => onOpenReview(false),
    [onOpenReview]
  );
  const handleGetChatName = React.useCallback(
    (senderId: string) => {
      if (activeMatch) {
        if (senderId === activeMatch.white_user_id) return players.w.name;
        if (senderId === activeMatch.black_user_id) return players.b.name;
      }
      return 'Kỳ thủ';
    },
    [
      activeMatch?.white_user_id,
      activeMatch?.black_user_id,
      players.w.name,
      players.b.name,
    ]
  );

  return (
    <div className="flex-1 h-full min-h-0 w-full flex flex-col md:flex-row md:overflow-hidden">
      {/* Vùng bàn cờ trung tâm — tận dụng tối đa chiều dọc */}
      <div
        ref={boardStageRef}
        className="relative flex-1 min-w-0 min-h-[360px] md:min-h-0 md:h-full bg-base flex items-center justify-center px-2 py-1 overflow-hidden"
      >
        {activeTab === 'play' && (
          /* Đối xứng 3 cột trên màn hình rộng: rail trái (bottomSide) · cột giữa (tên + bàn + tên) · rail phải (topSide) */
          <div className="h-full flex items-center justify-center gap-2">
            {showSideRails && (
              <div className="hidden sm:block">
                <CapturedBar {...capturedBarProps(bottomSide, 'bottom')} />
              </div>
            )}

            <div className="h-full flex flex-col items-center justify-center gap-1">
              {/* Trên: thẻ người chơi của bên ở trên bàn */}
              <div style={{ width: boardSize }} className="shrink-0">
                <PlayerCard
                  {...playerCardProps(topSide)}
                  capturedSymbols={
                    !showSideRails
                      ? capturedBarProps(topSide, 'top').symbols
                      : undefined
                  }
                  materialDiff={
                    !showSideRails
                      ? capturedBarProps(topSide, 'top').diff
                      : undefined
                  }
                />
              </div>

              {activeMatch?.is_paused && (
                <div
                  style={{ width: boardSize }}
                  className="px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between shrink-0"
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span>Ván đấu đang tạm dừng (Time-out)</span>
                  </div>
                  {onResumeMatch && (
                    <button
                      type="button"
                      onClick={onResumeMatch}
                      className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-ink font-semibold text-[11px] transition cursor-pointer"
                    >
                      Tiếp tục ván đấu
                    </button>
                  )}
                </div>
              )}

              <div
                style={{ width: boardSize, height: boardSize }}
                className="relative rounded-md overflow-hidden shadow-2xl border border-line shrink-0"
              >
                <Chessboard
                  id="TheChessStudioBoard"
                  boardWidth={boardSize}
                  position={displayedPosition}
                  boardOrientation={boardOrientation}
                  onPieceDrop={onPieceDrop}
                  onSquareClick={onSquareClick}
                  customArrows={customArrows}
                  customSquareStyles={customSquareStyles}
                  customPieces={cburnettPieces}
                  customDarkSquareStyle={{ backgroundColor: themeColors.dark }}
                  customLightSquareStyle={{ backgroundColor: themeColors.light }}
                  animationDuration={160}
                />
                {pendingPromo && (
                  <PromotionDialog
                    color={chessInstance.turn()}
                    onPick={onPromoPick}
                    onCancel={onPromoCancel}
                  />
                )}

                {/* Overlay Phòng chờ (Waiting Room) khi tạo trận đấu người trực tuyến */}
                {activeMatch?.status === 'waiting' && (
                  <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-xs bg-panel border border-line rounded-xl p-5 text-center shadow-2xl">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-semibold uppercase tracking-wider mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Đang chờ đối thủ vào bàn
                      </div>
                      <div className="text-xs text-ink-2 mb-3">
                        Gửi mã phòng bên dưới cho bạn bè để vào đấu trực tiếp:
                      </div>
                      <div className="font-mono text-2xl font-bold tracking-widest text-accent bg-inset border border-line rounded-lg py-2.5 mb-3 select-all">
                        #{activeMatch.room_code}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onCopyRoomCode}
                          className="flex-1 py-2 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold transition cursor-pointer"
                        >
                          Sao chép mã phòng
                        </button>
                        <button
                          type="button"
                          onClick={onReturnToLobby}
                          className="px-3 py-2 rounded-lg bg-inset hover:bg-card border border-line text-xs text-ink-2 hover:text-ink transition cursor-pointer"
                        >
                          Về sảnh
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Overlay khi ván chưa bắt đầu */}
                {phase === 'setup' && !showPreMatch && (
                  <div className="absolute inset-0 z-10 bg-black/45 flex items-center justify-center">
                    <button
                      onClick={() => setShowPreMatch(true)}
                      className="px-4 py-2.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold shadow-2xl transition cursor-pointer"
                    >
                      Chuẩn bị &amp; Bắt đầu ván đấu
                    </button>
                  </div>
                )}

                {/* Nút mở lại tổng kết sau khi đóng modal */}
                {phase === 'finished' && !showGameOver && !reviewMode && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                    <button
                      onClick={() => setShowGameOver(true)}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-[11px] font-semibold shadow-2xl transition cursor-pointer"
                    >
                      Xem tổng kết ván đấu
                    </button>
                  </div>
                )}
              </div>

              {/* Dưới: thẻ người chơi của bên ở dưới bàn */}
              <div style={{ width: boardSize }} className="shrink-0">
                <PlayerCard
                  {...playerCardProps(bottomSide)}
                  capturedSymbols={
                    !showSideRails
                      ? capturedBarProps(bottomSide, 'bottom').symbols
                      : undefined
                  }
                  materialDiff={
                    !showSideRails
                      ? capturedBarProps(bottomSide, 'bottom').diff
                      : undefined
                  }
                />
              </div>
            </div>

            {showSideRails && (
              <div className="hidden sm:block">
                <CapturedBar {...capturedBarProps(topSide, 'top')} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'editor' && (
          <div
            style={{ width: boardSize, height: boardSize }}
            className="relative rounded-md overflow-hidden shadow-2xl border border-line shrink-0"
          >
            <Chessboard
              id="TheChessStudioBoard"
              boardWidth={boardSize}
              position={displayedPosition}
              boardOrientation={boardOrientation}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              customPieces={cburnettPieces}
              customDarkSquareStyle={{ backgroundColor: themeColors.dark }}
              customLightSquareStyle={{ backgroundColor: themeColors.light }}
              animationDuration={160}
            />
          </div>
        )}
      </div>

      {/* Cột công cụ bên phải — tự động mở rộng khi bật chế độ ReviewScreen (ISS-09) */}
      <aside
        className={`w-full ${
          reviewMode
            ? 'md:w-[460px] lg:w-[500px] xl:w-[560px]'
            : 'md:w-[390px] lg:w-[430px] xl:w-[480px]'
        } shrink-0 min-h-[420px] md:min-h-0 md:h-full border-t md:border-t-0 md:border-l border-line bg-panel flex flex-col overflow-hidden transition-[width] duration-200`}
      >
        {activeTab === 'editor' ? (
          <ErrorBoundary
            title="Không thể tải bộ chỉnh sửa bàn cờ"
            fallback={(err, reset) => (
              <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center p-6 text-center bg-panel">
                <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="font-display text-sm font-semibold text-ink mb-1">
                  Không thể nạp công cụ chỉnh sửa
                </h4>
                <p className="text-xs text-ink-2 max-w-xs mb-4 leading-relaxed">
                  {err.message || 'Đã xảy ra lỗi khi nạp thành phần chỉnh sửa bàn cờ.'}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Thử lại
                </button>
              </div>
            )}
          >
            <Suspense fallback={<LazyFallback />}>
              <BoardEditor
                boardMap={editorBoardMap}
                onUpdateBoardMap={setEditorBoardMap}
                selectedTool={editorTool}
                onSelectTool={setEditorTool}
                presets={presets}
                onApplyPosition={onApplyCustomPosition}
              />
            </Suspense>
          </ErrorBoundary>
        ) : reviewMode ? (
          <ErrorBoundary
            title="Không thể tải giao diện phân tích"
            fallback={(err, reset) => (
              <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center p-6 text-center bg-panel">
                <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="font-display text-sm font-semibold text-ink mb-1">
                  Không thể tải giao diện phân tích
                </h4>
                <p className="text-xs text-ink-2 max-w-xs mb-4 leading-relaxed">
                  {err.message || 'Đã xảy ra sự cố khi tải dữ liệu phân tích ván đấu.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Thử lại
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewMode(false)}
                    className="px-3 py-1.5 rounded-lg bg-inset hover:bg-card border border-line text-xs text-ink-2 hover:text-ink transition cursor-pointer"
                  >
                    Đóng phân tích
                  </button>
                </div>
              </div>
            )}
          >
            <Suspense fallback={<LazyFallback />}>
              <ReviewScreen
                onClose={() => setReviewMode(false)}
                moves={moves}
                currentPly={currentPly}
                onSelectPly={(ply) => setCurrentPly(ply)}
                reviewResult={reviewResult}
                isReviewing={isReviewing}
                reviewProgress={reviewProgress}
                onRunReview={onRunGameReview}
                onUpdateReviewLines={onUpdateReviewLines}
                onTryAlternativeMove={onTryAlternativeMove}
                arrowMode={reviewArrowMode}
                onChangeArrowMode={onChangeReviewArrowMode}
              />

              <EvalGraph
                moves={moves}
                currentPly={currentPly}
                onSelectPly={(ply) => setCurrentPly(ply)}
                reviewResult={reviewResult}
                isReviewing={isReviewing}
                embedded
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <>
            {/* Header chuyển Tab Sidebar nếu ván có chat */}
            {activeMatch && (
              <div className="shrink-0 flex items-center border-b border-line bg-inset p-1 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSidebarTab('moves')}
                  className={`flex-1 py-1.5 rounded-md font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    sidebarTab === 'moves'
                      ? 'bg-card text-ink font-semibold shadow-xs'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  Biên bản &amp; Đánh giá
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('chat')}
                  className={`flex-1 py-1.5 rounded-md font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    sidebarTab === 'chat'
                      ? 'bg-card text-ink font-semibold shadow-xs'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat trận
                </button>
              </div>
            )}

            {sidebarTab === 'chat' && activeMatch ? (
              <div className="flex-1 min-h-0 flex flex-col p-3">
                <ChatBox
                  topic={`match:${activeMatch.id}`}
                  currentUser={currentUser}
                  getName={handleGetChatName}
                  locked={
                    activeMatch.status === 'finished' ||
                    activeMatch.status === 'aborted'
                  }
                  lockedHint="Ván đấu đã kết thúc — kênh chat bị khóa, lịch sử vẫn được giữ lại."
                  canModerate={currentUser.role === 'admin'}
                  heightClass="flex-1 h-full min-h-[350px]"
                  placeholder="Nhắn trong trận… (khán giả cũng xem được)"
                />
              </div>
            ) : (
              <>
                <EnginePanel
                  phase={phase}
                  config={config}
                  visibility={visibility}
                  modeLabel={isSpectator ? 'Đang xem trực tiếp' : modeLabel}
                  onOpenConfig={onOpenConfig}
                  onResign={onResign}
                  onHint={onHint}
                  canHint={canHint}
                  showEval={showEval}
                  onToggleEval={handleToggleEval}
                  showArrows={showArrows}
                  onToggleArrows={handleToggleArrows}
                  multipv={multipv}
                  onChangeMultipv={setMultipv}
                  depth={depth}
                  onChangeDepth={setDepth}
                  analysis={analysis}
                  isAnalyzing={isAnalyzing}
                  onPlaySuggestedMove={onPlaySuggestedMove}
                  onTriggerAiMoveNow={onTriggerAiMoveNow}
                  isAiThinking={isAiThinking}
                  assistant={assistantEngine}
                  onChangeAssistant={setAssistantEngine}
                />

                <MoveHistory
                  moves={moves}
                  currentPly={currentPly}
                  phase={phase}
                  canTakeback={visibility.takeback}
                  visibility={visibility}
                  onSelectPly={handleSelectPly}
                  onTakeback={onTakeback}
                  onExportPgn={onExportPgn}
                  onBranchFromHere={onBranchFromHere}
                  onFlipBoard={onFlipBoard}
                  onSwitchSides={onSwitchSides}
                  onNewGame={onNewGame}
                />

                {visibility.evalGraph && (
                  <EvalGraph
                    moves={moves}
                    currentPly={currentPly}
                    onSelectPly={handleSelectPly}
                    reviewResult={reviewResult}
                    isReviewing={isReviewing}
                    onRunReview={handleRunReview}
                    onOpenReview={handleOpenReview}
                    canReview={visibility.reviewButton}
                  />
                )}

                {activeMatch && (
                  <div className="shrink-0 border-t border-line bg-inset px-3 py-1.5 flex items-center justify-between text-[11px] text-ink-2">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-accent" />
                      Chat trận
                    </span>
                    <button
                      type="button"
                      onClick={() => setSidebarTab('chat')}
                      className="text-accent hover:underline font-medium cursor-pointer"
                    >
                      Mở khung chat ↗
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
};
