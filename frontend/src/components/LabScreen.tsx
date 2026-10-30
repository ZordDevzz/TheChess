import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CircleDot,
  FlaskConical,
  RefreshCw,
  Swords,
  ArrowLeftRight,
  Trophy,
} from 'lucide-react';
import {
  createLabMatchApi,
  createLabTournamentApi,
  fetchLobbyApi,
  getLabTournamentApi,
  listLabMatchesApi,
  listLabTournamentsApi,
} from '../api';
import {
  LabMatchListResponse,
  LabTournament,
  MatchSummaryItem,
  UserRecord,
} from '../types';
import { useRealtime } from '../hooks/useRealtime';

interface LabScreenProps {
  onOpenMatch: (matchId: string) => Promise<void>;
  onNotify: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

/** Preset thời gian cho trận Lab (untimed = chơi không đồng hồ, chỉ đếm nước). */
const LAB_TIME_PRESETS = [
  { id: 'untimed', label: 'Không đồng hồ', type: 'untimed' as const, initialMs: null, incMs: 0 },
  { id: '3+2', label: '3+2 Blitz', type: 'blitz' as const, initialMs: 180_000, incMs: 2_000 },
  { id: '10+5', label: '10+5 Rapid', type: 'rapid' as const, initialMs: 600_000, incMs: 5_000 },
];

const RESULT_LABEL: Record<string, string> = {
  '1-0': '1-0 Trắng',
  '0-1': '0-1 Đen',
  '1/2-1/2': 'Hòa',
};

function botLabel(u: UserRecord): string {
  return u.display_name || u.username;
}

function matchTitle(m: MatchSummaryItem): string {
  return `${botLabel(m.white_player)} vs ${botLabel(m.black_player)}`;
}

/**
 * Phòng Lab: tổ chức trận AI vs AI & giải round-robin.
 * Trận chạy nền bằng engine thật trên server; bấm "Xem" mở MatchScreen
 * ở chế độ khán giả (WS từng nước + phân loại realtime + EvalGraph).
 */
export const LabScreen: React.FC<LabScreenProps> = ({ onOpenMatch, onNotify }) => {
  const [bots, setBots] = useState<UserRecord[]>([]);
  const [matches, setMatches] = useState<LabMatchListResponse>({ live: [], recent: [] });
  const [tournaments, setTournaments] = useState<LabTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form tạo trận đơn
  const [whiteId, setWhiteId] = useState('');
  const [blackId, setBlackId] = useState('');
  const [timePreset, setTimePreset] = useState('untimed');

  // Form tạo giải
  const [tournamentName, setTournamentName] = useState('');
  const [selectedBots, setSelectedBots] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [lobby, matchList, tourList] = await Promise.all([
        fetchLobbyApi(false),
        listLabMatchesApi(),
        listLabTournamentsApi(),
      ]);
      setBots(lobby.bots);
      setMatches(matchList);
      setTournaments(tourList);
    } catch {
      // im lặng — sẽ thử lại ở chu kỳ poll kế tiếp
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime: topic `lobby` phủ cả dữ liệu Lab (trận mới, nước đi, kết quả giải)
  // -> refetch ngay; poll chỉ còn fallback chậm.
  const { subscribe: subscribeRealtime } = useRealtime();
  useEffect(() => {
    return subscribeRealtime('lobby', () => {
      refresh();
    });
  }, [subscribeRealtime, refresh]);

  useEffect(() => {
    refresh();
    // Poll 30s: chỉ bắt lỗi bỏ lỡ event khi WS chết (hub tự reconnect).
    const t = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Chọn bot mặc định khi danh sách về
  useEffect(() => {
    if (bots.length >= 2 && !whiteId && !blackId) {
      const maia1500 = bots.find((b) => b.username === 'bot_maia_1500') ?? bots[0];
      const maia1700 = bots.find((b) => b.username === 'bot_maia_1700') ?? bots[1];
      setWhiteId(maia1500.id);
      setBlackId(maia1700.id);
    }
  }, [bots, whiteId, blackId]);

  const handleCreateMatch = async () => {
    if (!whiteId || !blackId || busy) return;
    const tp = LAB_TIME_PRESETS.find((p) => p.id === timePreset) ?? LAB_TIME_PRESETS[0];
    setBusy(true);
    try {
      const res = await createLabMatchApi({
        white_bot_id: whiteId,
        black_bot_id: blackId,
        time_control_type: tp.type,
        initial_time_ms: tp.initialMs,
        increment_ms: tp.incMs,
      });
      onNotify('Trận Lab đã bắt đầu — engine đang tự đấu.', 'success');
      await refresh();
      await onOpenMatch(res.match.id);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Không tạo được trận Lab.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTournament = async () => {
    if (selectedBots.length < 2 || busy) return;
    const name = tournamentName.trim() || `Giải Lab ${new Date().toLocaleDateString('vi-VN')}`;
    setBusy(true);
    try {
      const t = await createLabTournamentApi({ name, bot_ids: selectedBots });
      onNotify(`Đã tạo giải "${t.name}" — các trận đấu tuần tự.`, 'success');
      setTournamentName('');
      setSelectedBots([]);
      const detail = await getLabTournamentApi(t.id);
      setTournaments((prev) => [detail, ...prev.filter((x) => x.id !== t.id)]);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Không tạo được giải Lab.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleTournamentBot = (id: string) => {
    setSelectedBots((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const scheduleCount = useMemo(
    () => (selectedBots.length >= 2 ? (selectedBots.length * (selectedBots.length - 1)) / 2 : 0),
    [selectedBots]
  );

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tiêu đề */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-accent" />
            <h1 className="font-display text-xl font-semibold tracking-tight">
              Phòng Lab — AI vs AI
            </h1>
          </div>
          <button
            onClick={() => refresh()}
            className="p-2 rounded-md bg-inset hover:bg-card border border-line text-ink-2 transition cursor-pointer"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Tạo trận đơn */}
          <section className="rounded-lg border border-line bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Swords className="w-4 h-4 text-accent" /> Tạo trận đơn
            </h2>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="text-xs text-ink-2 space-y-1 block">
                <span>Trắng</span>
                <select
                  value={whiteId}
                  onChange={(e) => setWhiteId(e.target.value)}
                  className="w-full rounded-md bg-inset border border-line px-2 py-1.5 text-sm text-ink"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {botLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  setWhiteId(blackId);
                  setBlackId(whiteId);
                }}
                className="mt-5 p-1.5 rounded-md bg-inset hover:bg-card border border-line text-ink-2 transition cursor-pointer"
                title="Đổi bên"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
              <label className="text-xs text-ink-2 space-y-1 block">
                <span>Đen</span>
                <select
                  value={blackId}
                  onChange={(e) => setBlackId(e.target.value)}
                  className="w-full rounded-md bg-inset border border-line px-2 py-1.5 text-sm text-ink"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {botLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-xs text-ink-2 space-y-1 block">
              <span>Thời gian</span>
              <select
                value={timePreset}
                onChange={(e) => setTimePreset(e.target.value)}
                className="w-full rounded-md bg-inset border border-line px-2 py-1.5 text-sm text-ink"
              >
                {LAB_TIME_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleCreateMatch}
              disabled={busy || !whiteId || !blackId}
              className="w-full py-2 rounded-md bg-accent hover:opacity-90 disabled:opacity-40 text-accent-ink text-sm font-semibold transition cursor-pointer"
            >
              Bắt đầu trận
            </button>
          </section>

          {/* Tạo giải round-robin */}
          <section className="rounded-lg border border-line bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-accent" /> Giải round-robin
            </h2>
            <input
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              placeholder="Tên giải (tùy chọn)"
              className="w-full rounded-md bg-inset border border-line px-2 py-1.5 text-sm text-ink"
            />
            <div className="flex flex-wrap gap-1.5">
              {bots.map((b) => {
                const active = selectedBots.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleTournamentBot(b.id)}
                    className={`px-2 py-1 rounded-full text-xs border transition cursor-pointer flex items-center gap-1 ${
                      active
                        ? 'bg-accent text-accent-ink border-accent font-medium'
                        : 'bg-inset text-ink-2 border-line hover:bg-card'
                    }`}
                  >
                    <Bot className="w-3 h-3" />
                    {botLabel(b)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-2">
              Đã chọn {selectedBots.length} bot · {scheduleCount} trận (mỗi cặp 1 lượt,
              đấu tuần tự)
            </p>
            <button
              onClick={handleCreateTournament}
              disabled={busy || selectedBots.length < 2}
              className="w-full py-2 rounded-md bg-accent hover:opacity-90 disabled:opacity-40 text-accent-ink text-sm font-semibold transition cursor-pointer"
            >
              Tạo giải đấu
            </button>
          </section>
        </div>

        {/* Trận đang chạy */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <CircleDot className="w-4 h-4 text-emerald-400" /> Đang diễn ra (
            {matches.live.length})
          </h2>
          {matches.live.length === 0 && (
            <p className="text-xs text-ink-2 px-1">Chưa có trận nào đang chạy.</p>
          )}
          {matches.live.map((m) => (
            <div
              key={m.match.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{matchTitle(m)}</p>
                <p className="text-[11px] text-ink-2">
                  {m.match.total_plies} nước ·{' '}
                  {m.match.mode === 'vs_ai' ? 'AI vs AI' : m.match.mode}
                </p>
              </div>
              <button
                onClick={() => onOpenMatch(m.match.id)}
                className="shrink-0 px-3 py-1.5 rounded-md bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold transition cursor-pointer"
              >
                Xem trực tiếp
              </button>
            </div>
          ))}
        </section>

        {/* Giải đấu */}
        {tournaments.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-accent" /> Giải đấu
            </h2>
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-line bg-card p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      t.status === 'running'
                        ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                        : 'text-ink-2 border-line bg-inset'
                    }`}
                  >
                    {t.status === 'running' ? 'Đang chạy' : 'Kết thúc'}
                  </span>
                </div>

                {/* Bảng xếp hạng */}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-2 border-b border-line">
                      <th className="text-left py-1 font-medium">#</th>
                      <th className="text-left py-1 font-medium">Bot</th>
                      <th className="text-center py-1 font-medium">T-H-B</th>
                      <th className="text-right py-1 font-medium">Điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.standings.map((s, i) => (
                      <tr key={s.bot_id} className="border-b border-line/50">
                        <td className="py-1 text-ink-2">{i + 1}</td>
                        <td className="py-1">{s.label}</td>
                        <td className="py-1 text-center text-ink-2">
                          {s.wins}-{s.draws}-{s.losses}
                        </td>
                        <td className="py-1 text-right font-mono font-semibold">
                          {s.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Lịch đấu */}
                <div className="flex flex-wrap gap-1.5">
                  {t.schedule.map((slot, i) => {
                    const w = t.participants.find((p) => p.bot_id === slot.white_bot_id);
                    const b = t.participants.find((p) => p.bot_id === slot.black_bot_id);
                    const label = `${w?.label ?? '?'} vs ${b?.label ?? '?'}`;
                    const done = slot.result !== null;
                    const inner = done ? (
                      <>
                        {label}{' '}
                        <span className="text-ink-2 font-mono">
                          {RESULT_LABEL[slot.result ?? '']}
                        </span>
                      </>
                    ) : slot.match_id ? (
                      <span className="text-emerald-400">{label} · live</span>
                    ) : (
                      <span className="text-ink-2">{label} · chờ</span>
                    );
                    return slot.match_id ? (
                      <button
                        key={i}
                        onClick={() => onOpenMatch(slot.match_id!)}
                        className={`px-2 py-1 rounded border text-[11px] transition cursor-pointer ${
                          done
                            ? 'bg-inset border-line text-ink-2 hover:bg-card'
                            : 'bg-emerald-400/10 border-emerald-400/40 text-ink hover:bg-emerald-400/20'
                        }`}
                      >
                        {inner}
                      </button>
                    ) : (
                      <span
                        key={i}
                        className="px-2 py-1 rounded border border-line bg-inset text-[11px] text-ink-2"
                      >
                        {inner}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Trận đã kết thúc gần đây */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-2">
            Ván đã kết thúc ({matches.recent.length})
          </h2>
          {matches.recent.map((m) => (
            <div
              key={m.match.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{matchTitle(m)}</p>
                <p className="text-[11px] text-ink-2 font-mono">
                  {m.match.result} · {m.match.total_plies} nước
                </p>
              </div>
              <button
                onClick={() => onOpenMatch(m.match.id)}
                className="shrink-0 px-3 py-1.5 rounded-md bg-inset hover:bg-card border border-line text-ink-2 text-xs transition cursor-pointer"
              >
                Xem lại
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default LabScreen;
