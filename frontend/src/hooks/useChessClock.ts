import { useCallback, useEffect, useRef, useState } from 'react';
import { finishMatchApi } from '../api';
import {
  AppScreen,
  GameOverInfo,
  GamePhase,
  MatchRecord,
  MoveRecord,
} from '../types';

interface UseChessClockParams {
  screen: AppScreen;
  phase: GamePhase;
  activeMatch: MatchRecord | null;
  isSpectator: boolean;
  /** Bên đang đi từ thế cờ hiện tại — quyết định đồng hồ nào được trừ giờ */
  turn: 'w' | 'b';
  /** App cập nhật trạng thái ván đấu (gameOver/phase/showGameOver) khi hết giờ */
  onTimeout: (info: GameOverInfo) => void;
}

/**
 * Quản lý đồng hồ Fischer (Multiplayer V3):
 * - Đếm ngược theo wall-clock neo tại `lastTurnStartRef` + `turnStartClockRef`
 *   (tránh lệch đồng hồ khi tab bị throttle/nghỉ).
 * - Phát hiện hết giờ và báo kết quả backend.
 * - Cung cấp snapshot đồng hồ khi hydrate/poll-sync từ server và reset ván mới.
 */
export function useChessClock({
  screen,
  phase,
  activeMatch,
  isSpectator,
  turn,
  onTimeout,
}: UseChessClockParams) {
  const [whiteClockMs, setWhiteClockMs] = useState<number | null>(null);
  const [blackClockMs, setBlackClockMs] = useState<number | null>(null);
  const lastTurnStartRef = useRef<number>(Date.now());
  // Đồng hồ (ms) của bên đang đi tại thời điểm bắt đầu lượt — neo để tính
  // thời gian còn lại theo wall-clock, tránh lệch khi tab bị throttle/nghỉ.
  const turnStartClockRef = useRef<number | null>(null);

  // Đồng hồ Fischer đếm ngược khi ván đang playing và có giới hạn thời gian
  useEffect(() => {
    if (
      screen !== 'match' ||
      phase !== 'playing' ||
      !activeMatch ||
      activeMatch.status !== 'playing' ||
      activeMatch.initial_time_ms == null
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      const turnStartClockMs = turnStartClockRef.current;
      if (turnStartClockMs == null) return;
      const remaining = Math.max(
        0,
        turnStartClockMs - (Date.now() - lastTurnStartRef.current)
      );
      if (turn === 'w') {
        setWhiteClockMs(remaining);
      } else {
        setBlackClockMs(remaining);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [screen, phase, activeMatch, turn]);

  // Phát hiện hết giờ (Timeout)
  useEffect(() => {
    if (
      screen !== 'match' ||
      phase !== 'playing' ||
      !activeMatch ||
      activeMatch.status !== 'playing' ||
      activeMatch.initial_time_ms == null ||
      isSpectator
    ) {
      return;
    }
    if (whiteClockMs !== null && whiteClockMs <= 0) {
      const info: GameOverInfo = {
        result: '0-1',
        reason: 'Trắng hết giờ',
        winner: 'b',
      };
      onTimeout(info);
      finishMatchApi(activeMatch.id, '0-1', 'timeout').catch(console.error);
    } else if (blackClockMs !== null && blackClockMs <= 0) {
      const info: GameOverInfo = {
        result: '1-0',
        reason: 'Đen hết giờ',
        winner: 'w',
      };
      onTimeout(info);
      finishMatchApi(activeMatch.id, '1-0', 'timeout').catch(console.error);
    }
  }, [
    screen,
    phase,
    activeMatch,
    whiteClockMs,
    blackClockMs,
    isSpectator,
    onTimeout,
  ]);

  /** Chốt snapshot đồng hồ khi hydrate/poll-sync từ dữ liệu server */
  const syncClockFromServer = useCallback(
    (
      white: number | null,
      black: number | null,
      serverMoves: MoveRecord[]
    ) => {
      setWhiteClockMs(white);
      setBlackClockMs(black);
      lastTurnStartRef.current = Date.now();
      turnStartClockRef.current =
        serverMoves.length > 0 && serverMoves[serverMoves.length - 1].turn === 'w'
          ? black
          : white;
    },
    []
  );

  /** Xóa sạch đồng hồ khi bắt đầu ván cờ mới (ngoài hệ thống DB) */
  const resetClocks = useCallback(() => {
    setWhiteClockMs(null);
    setBlackClockMs(null);
    turnStartClockRef.current = null;
  }, []);

  return {
    whiteClockMs,
    blackClockMs,
    setWhiteClockMs,
    setBlackClockMs,
    lastTurnStartRef,
    turnStartClockRef,
    syncClockFromServer,
    resetClocks,
  };
}
