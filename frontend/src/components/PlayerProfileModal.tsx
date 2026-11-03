import React, { useEffect, useState } from 'react';
import {
  Award,
  Eye,
  Flame,
  History,
  Shield,
  Swords,
  Target,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { fetchUserProfileApi } from '../api';
import { MatchSummaryItem, UserRecord } from '../types';
import { formatLastSeen, getRankBadge } from '../gameUtils';

interface PlayerProfileModalProps {
  userId: string | null;
  initialUser?: UserRecord | null;
  currentUser: UserRecord;
  isOnline?: boolean;
  activeMatchId?: string | null;
  onClose: () => void;
  onChallengePlayer: (player: UserRecord) => void;
  onOpenLiveMatch: (matchId: string) => void;
  onOpenHistoryMatchReview: (matchId: string) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  userId,
  initialUser,
  currentUser,
  isOnline = false,
  activeMatchId = null,
  onClose,
  onChallengePlayer,
  onOpenLiveMatch,
  onOpenHistoryMatchReview,
}) => {
  const [profileUser, setProfileUser] = useState<UserRecord | null>(
    initialUser || null
  );
  const [recentMatches, setRecentMatches] = useState<MatchSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (initialUser) {
      setProfileUser(initialUser);
    }
    let cancelled = false;
    setLoading(true);
    fetchUserProfileApi(userId)
      .then((res) => {
        if (cancelled) return;
        setProfileUser(res.user);
        setRecentMatches(res.recent_matches);
      })
      .catch(() => {
        // giữ nguyên initialUser nếu có
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, initialUser]);

  if (!userId || !profileUser) return null;

  const isMe = profileUser.id === currentUser.id;
  const totalGames = Math.max(
    0,
    profileUser.games_played ||
      profileUser.wins + profileUser.draws + profileUser.losses
  );
  const winPct =
    totalGames > 0 ? Math.round((profileUser.wins / totalGames) * 100) : 0;
  const drawPct =
    totalGames > 0 ? Math.round((profileUser.draws / totalGames) * 100) : 0;
  const lossPct =
    totalGames > 0 ? Math.max(0, 100 - winPct - drawPct) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[3px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Hồ sơ kỳ thủ ${profileUser.display_name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-overlay border border-line-strong rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header Hồ sơ */}
        <div className="p-4 border-b border-line bg-panel flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-inset border border-line-strong flex items-center justify-center shrink-0 relative">
              <User className="w-5 h-5 text-accent" />
              <span
                className={`w-3 h-3 rounded-full border-2 border-panel absolute -bottom-0.5 -right-0.5 ${
                  !isOnline
                    ? 'bg-ink-3'
                    : activeMatchId
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                title={
                  !isOnline
                    ? 'Ngoại tuyến'
                    : activeMatchId
                    ? 'Đang thi đấu'
                    : 'Đang trực tuyến'
                }
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base font-semibold text-ink truncate">
                  {profileUser.display_name}
                </h2>
                {isMe && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-mono font-semibold">
                    BẠN
                  </span>
                )}
                {(() => {
                  const rank = getRankBadge(profileUser.rating);
                  return (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold border shrink-0 ${rank.bgClass} ${rank.colorClass} ${rank.borderClass}`}
                      title={`${rank.label} (Elo ${profileUser.rating})`}
                    >
                      {rank.badge} · {rank.label}
                    </span>
                  );
                })()}
                {profileUser.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-mono">
                    <Shield className="w-2.5 h-2.5" />
                    Admin
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-ink-2 font-mono mt-0.5">
                <span>@{profileUser.username}</span>
                <span>·</span>
                <span
                  className={
                    !isOnline
                      ? 'text-ink-3'
                      : activeMatchId
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                  }
                >
                  {!isOnline
                    ? `○ Ngoại tuyến (${formatLastSeen(profileUser.last_seen_at)})`
                    : activeMatchId
                    ? '● Đang trong bàn đấu'
                    : '● Đang trực tuyến tại sảnh'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-inset hover:bg-card border border-line text-ink-2 hover:text-ink transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nội dung chi tiết */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {profileUser.bio && (
            <div className="px-3 py-2 rounded-lg bg-inset border border-line text-xs text-ink-2 italic">
              “{profileUser.bio}”
            </div>
          )}

          {/* 4 Thẻ chỉ số chính */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-lg bg-inset border border-line">
              <div className="text-[10px] text-ink-3 flex items-center gap-1">
                <Trophy className="w-3 h-3 text-accent" />
                Hệ số Elo
              </div>
              <div className="font-mono text-base font-bold text-ink mt-0.5">
                {profileUser.rating}
              </div>
              <div className="text-[10px] font-mono text-ink-3">
                Đỉnh: {profileUser.peak_rating}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-inset border border-line">
              <div className="text-[10px] text-ink-3 flex items-center gap-1">
                <Award className="w-3 h-3 text-emerald-400" />
                Số ván đấu
              </div>
              <div className="font-mono text-base font-bold text-ink mt-0.5">
                {totalGames}
              </div>
              <div className="text-[10px] font-mono text-ink-3">
                Tỷ lệ thắng: {winPct}%
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-inset border border-line">
              <div className="text-[10px] text-ink-3 flex items-center gap-1">
                <Target className="w-3 h-3 text-sky-400" />
                Độ chuẩn TB
              </div>
              <div className="font-mono text-base font-bold text-ink mt-0.5">
                {profileUser.avg_accuracy != null
                  ? `${profileUser.avg_accuracy.toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-[10px] font-mono text-ink-3">
                Qua các ván Review
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-inset border border-line">
              <div className="text-[10px] text-ink-3 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                Chuỗi thắng
              </div>
              <div className="font-mono text-base font-bold text-ink mt-0.5">
                {profileUser.current_streak > 0
                  ? `+${profileUser.current_streak}`
                  : profileUser.current_streak}
              </div>
              <div className="text-[10px] font-mono text-ink-3">
                Kỷ lục: {profileUser.best_win_streak}
              </div>
            </div>
          </div>

          {/* Thanh tỷ lệ Thắng / Hòa / Thua */}
          <div className="p-3 rounded-lg bg-inset border border-line space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-emerald-400 font-semibold">
                {profileUser.wins} Thắng ({winPct}%)
              </span>
              <span className="text-amber-300">
                {profileUser.draws} Hòa ({drawPct}%)
              </span>
              <span className="text-red-400">
                {profileUser.losses} Thua ({lossPct}%)
              </span>
            </div>

            <div className="h-2 rounded-full bg-card overflow-hidden flex">
              {totalGames > 0 ? (
                <>
                  <div
                    style={{ width: `${winPct}%` }}
                    className="bg-emerald-400 h-full"
                  />
                  <div
                    style={{ width: `${drawPct}%` }}
                    className="bg-amber-400 h-full"
                  />
                  <div
                    style={{ width: `${lossPct}%` }}
                    className="bg-red-400 h-full"
                  />
                </>
              ) : (
                <div className="w-full h-full bg-line" />
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-ink-3 font-mono">
              <span>Thắng quân Trắng: {profileUser.white_wins}</span>
              <span>Thắng quân Đen: {profileUser.black_wins}</span>
            </div>
          </div>

          {/* Danh sách ván đấu gần đây */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-accent" />
                Lịch sử ván đấu gần đây
              </span>
              {loading && (
                <span className="text-[10px] font-mono text-ink-3">
                  Đang tải...
                </span>
              )}
            </div>

            {recentMatches.length === 0 ? (
              <div className="py-5 text-center text-xs text-ink-3 bg-inset border border-line rounded-lg">
                Kỳ thủ này chưa có ván đấu nào được ghi nhận.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {recentMatches.map((item) => {
                  const m = item.match;
                  const isWhite = m.white_user_id === profileUser.id;
                  const opponent = isWhite
                    ? item.black_player
                    : item.white_player;
                  const isLive = m.status === 'playing';
                  let badgeText: string = m.result;
                  let badgeClass = 'bg-card text-ink-2 border-line';

                  if (isLive) {
                    badgeText = 'LIVE';
                    badgeClass =
                      'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
                  } else if (m.status === 'finished') {
                    const won =
                      (isWhite && m.result === '1-0') ||
                      (!isWhite && m.result === '0-1');
                    const drew = m.result === '1/2-1/2';
                    if (won) {
                      badgeText = 'THẮNG';
                      badgeClass =
                        'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
                    } else if (drew) {
                      badgeText = 'HÒA';
                      badgeClass =
                        'bg-amber-500/15 text-amber-300 border-amber-500/40';
                    } else {
                      badgeText = 'THUA';
                      badgeClass =
                        'bg-red-500/15 text-red-300 border-red-500/40';
                    }
                  }

                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        onClose();
                        if (isLive) {
                          onOpenLiveMatch(m.id);
                        } else {
                          onOpenHistoryMatchReview(m.id);
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-inset border border-line hover:border-accent/60 transition flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${badgeClass}`}
                        >
                          {badgeText}
                        </span>
                        <span className="text-xs text-ink truncate">
                          vs{' '}
                          <strong className="font-medium">
                            {opponent.display_name}
                          </strong>{' '}
                          <span className="font-mono text-[10px] text-ink-3">
                            ({opponent.rating})
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-ink-3">
                        <span>{Math.ceil(m.total_plies / 2)} nước</span>
                        <span className="text-accent hover:underline">
                          {isLive ? 'Xem live →' : 'Review →'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer hành động */}
        <div className="p-3.5 border-t border-line bg-panel flex items-center justify-end gap-2">
          {activeMatchId && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLiveMatch(activeMatchId);
              }}
              className="px-3.5 py-2 rounded-lg bg-inset hover:bg-card border border-line text-xs font-medium text-ink inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              Xem ván đang đấu
            </button>
          )}

          {!isMe && !profileUser.is_bot && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onChallengePlayer(profileUser);
              }}
              className="px-4 py-2 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5" />
              Thách đấu {profileUser.display_name}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-inset hover:bg-card border border-line text-xs text-ink-2 hover:text-ink transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
