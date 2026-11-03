/**
 * useMatchChannel — kênh realtime của 1 trận đấu, chạy trên kết nối WS chung
 * của app (useRealtime hub, topic `match:{id}`). Server đẩy event nhẹ
 * `match_updated` / `match_finished`, client refetch REST (authority).
 * Polling fallback do caller quyết định dựa trên `connected` trả về.
 */
import { useEffect, useRef } from 'react';
import { useRealtime } from './useRealtime';

export type MatchChannelEventType =
  | 'match_updated'
  | 'match_finished'
  | 'match_paused'
  | 'match_resumed';

interface UseMatchChannelParams {
  matchId: string | null;
  enabled: boolean;
  /** Được gọi khi server đẩy `match_updated` / `match_finished` */
  onEvent: (type: MatchChannelEventType) => void;
}

/**
 * Subscribe topic `match:{id}` trên hub chung; trả về `connected` của hub để
 * caller điều chỉnh tần suất polling fallback.
 */
export function useMatchChannel({
  matchId,
  enabled,
  onEvent,
}: UseMatchChannelParams): boolean {
  const { connected, subscribe } = useRealtime();

  // Giữ callback mới nhất qua ref để đổi onEvent không re-subscribe.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !matchId) return;
    const topic = `match:${matchId}`;
    return subscribe(topic, (event) => {
      if (
        event.type === 'match_updated' ||
        event.type === 'match_finished' ||
        event.type === 'match_paused' ||
        event.type === 'match_resumed'
      ) {
        onEventRef.current(event.type);
      }
    });
  }, [matchId, enabled, subscribe]);

  return connected;
}
