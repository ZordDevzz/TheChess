import { useEffect, useRef } from 'react';
import { fetchLobbyApi, getMatchApi } from '../api';
import { useMatchChannel } from './useMatchChannel';
import {
  AppScreen,
  GameOverInfo,
  GamePhase,
  MatchRecord,
  MatchWithDetailsResponse,
  MoveRecord,
  UserRecord,
} from '../types';
import { detailRecordsToMoveRecords } from '../gameUtils';
import { ToastKind } from '../components/Toasts';

interface UseMatchSyncParams {
  screen: AppScreen;
  activeMatch: MatchRecord | null;
  currentUser: UserRecord | null;
  isSpectator: boolean;
  moves: MoveRecord[];
  currentPly: number;
  /** Hydrate toàn bộ ván đấu từ response server (do App sở hữu trạng thái ván) */
  hydrateMatchFromServer: (
    res: MatchWithDetailsResponse,
    viewer: UserRecord,
    options?: { openReview?: boolean }
  ) => void;
  pushToast: (msg: string, kind?: ToastKind) => void;
  setActiveMatch: React.Dispatch<React.SetStateAction<MatchRecord | null>>;
  setMoves: React.Dispatch<React.SetStateAction<MoveRecord[]>>;
  setCurrentPly: React.Dispatch<React.SetStateAction<number>>;
  setPhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  setGameOver: React.Dispatch<React.SetStateAction<GameOverInfo | null>>;
  setShowGameOver: React.Dispatch<React.SetStateAction<boolean>>;
  /** Snapshot đồng hồ Fischer từ useChessClock khi có dữ liệu mới */
  syncClockFromServer: (
    white: number | null,
    black: number | null,
    serverMoves: MoveRecord[]
  ) => void;
}

/**
 * Polling đồng bộ trận đấu Multiplayer: phòng chờ chờ đối thủ vào,
 * nước đi mới từ đối thủ/hệ thống, và trường hợp khán giả xem trực tiếp
 * (tự chuyển sang ván biểu diễn mới khi ván AI vs AI kết thúc).
 */
export function useMatchSync({
  screen,
  activeMatch,
  currentUser,
  isSpectator,
  moves,
  currentPly,
  hydrateMatchFromServer,
  pushToast,
  setActiveMatch,
  setMoves,
  setCurrentPly,
  setPhase,
  setGameOver,
  setShowGameOver,
  syncClockFromServer,
}: UseMatchSyncParams) {
  const movesLenRef = useRef<number>(moves.length);
  useEffect(() => {
    movesLenRef.current = moves.length;
  }, [moves.length]);

  const currentPlyRef = useRef<number>(currentPly);
  useEffect(() => {
    currentPlyRef.current = currentPly;
  }, [currentPly]);

  /** Ply đích của animation "đi tuần tự từng nước" cho khán giả đang theo dõi ván */
  const followTargetRef = useRef<number>(0);

  // ------------------ Kênh WebSocket push (P2-1) ------------------
  // Khi có activeMatch cần đồng bộ (online / spectator / phòng chờ), mở WS để
  // nhận `match_updated` / `match_finished` và refetch ngay thay vì chờ polling.
  const syncNowRef = useRef<(() => void) | null>(null);

  const channelEnabled =
    screen === 'match' &&
    !!activeMatch &&
    !!currentUser &&
    (activeMatch.status === 'waiting' ||
      activeMatch.mode === 'online' ||
      isSpectator);

  const wsConnected = useMatchChannel({
    matchId: activeMatch?.id ?? null,
    enabled: channelEnabled,
    onEvent: () => {
      // Nguồn dữ liệu authority vẫn là REST — event chỉ kích thích refetch.
      syncNowRef.current?.();
    },
  });

  useEffect(() => {
    if (screen !== 'match' || !activeMatch || !currentUser) return;
    const shouldPoll =
      activeMatch.status === 'waiting' ||
      activeMatch.mode === 'online' ||
      isSpectator;
    if (!shouldPoll) return;

    let cancelled = false;
    let inFlight = false;
    let animTimer: number | null = null;
    const matchId = activeMatch.id;
    const prevStatus = activeMatch.status;

    /**
     * Khán giả đang ở nước cuối mới nhất -> nếu sync về 2+ nước dồn dập
     * (polling giãn nhịp, mất WS, đối thủ đi nhanh), cho currentPly đi
     * TUẦN TỪ từng nước thay vì nhảy cóc — mỗi nước cách nhau 350ms.
     */
    const advanceFollow = (fromPly: number) => {
      if (cancelled || animTimer !== null) {
        // animation đang chạy: chỉ cần cập nhật target ở nơi gọi
        return;
      }
      let ply = fromPly;
      const runner = () => {
        const target = followTargetRef.current;
        if (cancelled || ply >= target) {
          animTimer = null;
          return;
        }
        ply += 1;
        setCurrentPly(ply);
        animTimer = ply < target ? window.setTimeout(runner, 350) : null;
      };
      animTimer = window.setTimeout(runner, 0);
    };

    const runSync = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await getMatchApi(matchId);
        if (cancelled) return;
        const m = res.match;

        // Phòng chờ vừa có người vào
        if (prevStatus === 'waiting' && m.status === 'playing') {
          hydrateMatchFromServer(res, currentUser);
          pushToast('Đối thủ đã vào bàn! Ván đấu bắt đầu.', 'success');
          return;
        }

        // Cập nhật biên bản nếu có nước đi mới từ đối thủ hoặc hệ thống
        if (
          res.moves.length !== movesLenRef.current ||
          m.status !== prevStatus
        ) {
          setActiveMatch(m);
          const built = detailRecordsToMoveRecords(res.moves);
          setMoves((prevMoves) =>
            built.map((bm) => {
              const existing = prevMoves.find(
                (pm) => pm.ply === bm.ply && pm.uci === bm.uci
              );
              if (!existing) return bm;
              return {
                ...bm,
                cp: bm.cp ?? existing.cp,
                mate: bm.mate ?? existing.mate,
                winPercentWhite:
                  bm.winPercentWhite ?? existing.winPercentWhite,
                classification: bm.classification ?? existing.classification,
                symbol: bm.symbol ?? existing.symbol,
                color: bm.color ?? existing.color,
              };
            })
          );
          // Theo dõi nước mới nhất: nếu đang ở (gần) nước cuối thì auto-follow.
          // Gap >1 nước -> đi tuần tự để khán giả thấy từng nước một.
          const autoFollow =
            currentPlyRef.current >= Math.max(0, movesLenRef.current - 1);
          if (autoFollow) {
            followTargetRef.current = built.length;
            if (built.length - movesLenRef.current <= 1) {
              setCurrentPly(built.length);
            } else {
              advanceFollow(movesLenRef.current);
            }
          }
          syncClockFromServer(
            m.white_clock_ms ?? m.initial_time_ms ?? null,
            m.black_clock_ms ?? m.initial_time_ms ?? null,
            built
          );

          if (m.status === 'finished' || m.status === 'aborted') {
            setPhase('finished');
            const winner =
              m.result === '1-0' ? 'w' : m.result === '0-1' ? 'b' : null;
            setGameOver({
              result: m.result === '*' ? '1/2-1/2' : m.result,
              reason: m.termination || 'Kết thúc ván đấu',
              winner,
            });
            if (!isSpectator) {
              setShowGameOver(true);
            } else if (res.white_player?.is_bot && res.black_player?.is_bot) {
              // Nếu đang xem trận biểu diễn AI vs AI và ván kết thúc, tự động chuyển sang ván biểu diễn mới
              pushToast(
                'Ván biểu diễn đã kết thúc — đang chuyển sang ván trực tiếp mới...',
                'info'
              );
              window.setTimeout(async () => {
                if (cancelled) return;
                try {
                  const lobbyData = await fetchLobbyApi(true);
                  const nextLive =
                    lobbyData.featured_match || lobbyData.live_matches[0];
                  if (nextLive && nextLive.match.id !== matchId) {
                    const nextRes = await getMatchApi(nextLive.match.id);
                    hydrateMatchFromServer(nextRes, currentUser);
                  }
                } catch {
                  // ignore
                }
              }, 2200);
            }
          }
        }
      } catch {
        // ignore transient network errors
      } finally {
        inFlight = false;
      }
    };

    // WS event (match_updated / match_finished) gọi refetch ngay qua ref này
    syncNowRef.current = runSync;

    // Polling fallback: WS đang connected thì kéo dài interval để giảm request
    // dư thừa; mất kết nối quay về nhịp 1800ms.
    const pollIntervalMs = wsConnected ? 8000 : 1800;
    const timer = window.setInterval(runSync, pollIntervalMs);

    return () => {
      cancelled = true;
      if (syncNowRef.current === runSync) {
        syncNowRef.current = null;
      }
      window.clearInterval(timer);
      if (animTimer !== null) {
        window.clearTimeout(animTimer);
        animTimer = null;
      }
    };
  }, [
    screen,
    activeMatch?.id,
    activeMatch?.status,
    activeMatch?.mode,
    currentUser,
    isSpectator,
    wsConnected,
    hydrateMatchFromServer,
    pushToast,
    setActiveMatch,
    setMoves,
    setCurrentPly,
    setPhase,
    setGameOver,
    setShowGameOver,
    syncClockFromServer,
  ]);
}
