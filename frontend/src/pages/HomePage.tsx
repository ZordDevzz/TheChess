import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeScreen, QuickCreateMatchOptions } from '../components/HomeScreen';
import { createMatchApi, joinMatchApi } from '../api';
import { STARTING_FEN } from '../gameUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApp } from '../context/AppContext';
import { UserRecord } from '../types';

export const HomePage: React.FC = () => {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const { status, setDmTarget } = useApp();
  const navigate = useNavigate();

  const handleOpenLiveMatch = async (matchId: string) => {
    navigate(`/match/${matchId}`);
  };

  const handleOpenHistoryMatchReview = async (matchId: string) => {
    navigate(`/match/${matchId}?review=1`);
  };

  const handleJoinMatchByCodeOrId = async (codeOrId: string) => {
    if (!currentUser) return;
    try {
      const res = await joinMatchApi(codeOrId);
      pushToast(
        `Đã vào bàn đấu #${res.match.room_code || res.match.id.slice(0, 6)}!`,
        'success'
      );
      navigate(`/match/${res.match.id}`, { state: { matchData: res } });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Không thể tham gia phòng đấu.', 'error');
    }
  };

  const handleCreateMatchFromLobby = async (opts: QuickCreateMatchOptions) => {
    if (!currentUser) return;

    const chosenColor: 'w' | 'b' =
      opts.side === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : opts.side;

    let whiteId = currentUser.id;
    let blackId = currentUser.id;
    let matchStatus: 'waiting' | 'playing' = 'playing';

    const useBotOpponent =
      opts.mode === 'vs_ai' ||
      (opts.mode === 'training' && opts.opponentType === 'ai');

    if (opts.mode === 'online') {
      matchStatus = 'waiting';
      if (opts.targetOpponentId && opts.targetOpponentId !== currentUser.id) {
        if (chosenColor === 'w') {
          whiteId = currentUser.id;
          blackId = opts.targetOpponentId;
        } else {
          whiteId = opts.targetOpponentId;
          blackId = currentUser.id;
        }
      } else {
        whiteId = currentUser.id;
        blackId = currentUser.id;
      }
    } else if (useBotOpponent) {
      const nearestMaia = Math.min(
        1900,
        Math.max(1100, Math.round(opts.aiElo / 100) * 100)
      );
      const botId =
        opts.aiEngine === 'stockfish'
          ? 'bot_stockfish'
          : `bot_maia_${nearestMaia}`;
      if (chosenColor === 'w') {
        whiteId = currentUser.id;
        blackId = botId;
      } else {
        whiteId = botId;
        blackId = currentUser.id;
      }
    }

    const analysisLevel = opts.mode === 'online' ? 'off' : opts.analysisLevel;
    const allowTakeback = opts.mode === 'online' ? false : opts.allowTakeback;
    const allowHints = opts.mode === 'online' ? false : opts.allowHints;

    try {
      const res = await createMatchApi({
        mode: opts.mode,
        status: matchStatus,
        is_rated: opts.isRated,
        white_user_id: whiteId,
        black_user_id: blackId,
        ai_elo_override: useBotOpponent ? opts.aiElo : null,
        analysis_level: analysisLevel,
        allow_takeback: allowTakeback,
        allow_hints: allowHints,
        time_control_type: opts.timeControlType,
        initial_time_ms: opts.initialTimeMs,
        increment_ms: opts.incrementMs,
        preset_id: opts.presetId ?? null,
        initial_fen: opts.initialFen || STARTING_FEN,
        generate_room_code: opts.mode === 'online',
      });

      if (res.match.status === 'waiting') {
        pushToast(
          `Đã tạo phòng chờ #${res.match.room_code}. Chia sẻ mã này cho đối thủ!`,
          'info'
        );
      } else {
        pushToast('Đã bắt đầu ván đấu mới!', 'success');
      }

      navigate(`/match/${res.match.id}`, { state: { matchData: res } });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Không thể tạo ván đấu.', 'error');
    }
  };

  if (!currentUser) return null;

  return (
    <HomeScreen
      currentUser={currentUser}
      presets={status?.presets || []}
      lc0Ready={status?.lc0_binary_ready}
      onOpenLiveMatch={handleOpenLiveMatch}
      onJoinMatchByCodeOrId={handleJoinMatchByCodeOrId}
      onCreateMatch={handleCreateMatchFromLobby}
      onOpenHistoryMatchReview={handleOpenHistoryMatchReview}
      onOpenDm={(u: UserRecord) => setDmTarget(u)}
      onOpenBoardEditor={() => navigate('/play?tab=editor')}
    />
  );
};

export default HomePage;
