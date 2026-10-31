import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTING_FEN,
  alignPlayersWithColor,
  buildPgn,
  detectGameOver,
  getMaterialInfo,
  makeDefaultPlayers,
  recordsFromUciList,
  resolveFeatureVisibility,
  getRankBadge,
  formatLastSeen,
} from '../gameUtils';
import { GameConfig } from '../types';

test('detectGameOver: trả về null khi ván cờ đang tiếp diễn', () => {
  assert.equal(detectGameOver(STARTING_FEN), null);
});

test('detectGameOver: phát hiện chiếu hết (Fool’s Mate — Đen thắng)', () => {
  const foolsMateFen =
    'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
  const res = detectGameOver(foolsMateFen);
  assert.deepEqual(res, {
    result: '0-1',
    reason: 'Chiếu hết',
    winner: 'b',
  });
});

test('detectGameOver: phát hiện hết nước đi (Stalemate)', () => {
  const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
  const res = detectGameOver(stalemateFen);
  assert.deepEqual(res, {
    result: '1/2-1/2',
    reason: 'Hết nước đi (stalemate)',
    winner: null,
  });
});

test('detectGameOver: phát hiện hòa do không đủ quân chiếu hết', () => {
  const insufficientFen = '8/8/4k3/8/8/3K4/8/8 w - - 0 1';
  const res = detectGameOver(insufficientFen);
  assert.deepEqual(res, {
    result: '1/2-1/2',
    reason: 'Không đủ quân để chiếu hết',
    winner: null,
  });
});

test('getMaterialInfo: thế cờ xuất phát có chênh lệch bằng 0 và chưa ăn quân nào', () => {
  const mat = getMaterialInfo(STARTING_FEN);
  assert.equal(mat.diff, 0);
  assert.deepEqual(mat.capturedByWhite, []);
  assert.deepEqual(mat.capturedByBlack, []);
});

test('getMaterialInfo: tính đúng quân bị bắt và lợi thế vật chất (Trắng chấp Hậu)', () => {
  const queenOddsFen =
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1';
  const mat = getMaterialInfo(queenOddsFen);
  assert.equal(mat.diff, -9);
  assert.deepEqual(mat.capturedByBlack, ['wQ']);
  assert.deepEqual(mat.capturedByWhite, []);
});

test('alignPlayersWithColor: đổi màu từ Trắng sang Đen khi đấu AI tự động hoán đổi players.w và players.b', () => {
  const initial = makeDefaultPlayers('w');
  assert.equal(initial.w.type, 'human');
  assert.equal(initial.b.type, 'ai');

  const switchedToBlack = alignPlayersWithColor(initial, 'b', 'ai');
  assert.equal(switchedToBlack.b.type, 'human');
  assert.equal(switchedToBlack.b.name, 'Player');
  assert.equal(switchedToBlack.w.type, 'ai');
  assert.equal(switchedToBlack.w.ai?.engine, 'maia');
});

test('resolveFeatureVisibility: khóa thông tin engine khi đang thi đấu ở chế độ vs_ai @ off, mở lại khi finished', () => {
  const vsAiOff: GameConfig = {
    mode: 'vs_ai',
    analysis: 'off',
    allowTakeback: false,
    allowHints: false,
    opponent: 'ai',
  };

  const setupVis = resolveFeatureVisibility(vsAiOff, 'setup');
  assert.equal(setupVis.canMove, false);
  assert.equal(setupVis.evalBar, false);
  assert.equal(setupVis.arrows, false);

  const playingVis = resolveFeatureVisibility(vsAiOff, 'playing');
  assert.equal(playingVis.canMove, true);
  assert.equal(playingVis.evalBar, false);
  assert.equal(playingVis.arrows, false);
  assert.equal(playingVis.classifyLive, false);
  assert.equal(playingVis.hints, false);
  assert.equal(playingVis.takeback, false);
  assert.equal(playingVis.reviewButton, false);

  const finishedVis = resolveFeatureVisibility(vsAiOff, 'finished');
  assert.equal(finishedVis.canMove, false);
  assert.equal(finishedVis.evalBar, true);
  assert.equal(finishedVis.arrows, true);
  assert.equal(finishedVis.reviewButton, true);
});

test('resolveFeatureVisibility: ván local vs_ai mở đủ công cụ thao tác', () => {
  const localVsAi: GameConfig = {
    mode: 'vs_ai',
    analysis: 'full',
    allowTakeback: true,
    allowHints: true,
    opponent: 'ai',
  };
  const vis = resolveFeatureVisibility(localVsAi, 'playing');
  assert.equal(vis.openConfig, true);
  assert.equal(vis.switchSides, true);
  assert.equal(vis.branchFromHere, true);
  assert.equal(vis.newGame, true);
  assert.equal(vis.triggerAiMove, false); // chỉ training mới có "AI đi"
  assert.equal(vis.resign, true);
  assert.equal(vis.playSuggestedMove, true);
  assert.equal(vis.evalGraph, true);
});

test('resolveFeatureVisibility: training là nơi duy nhất có nút "AI đi"', () => {
  const training: GameConfig = {
    mode: 'training',
    analysis: 'full',
    allowTakeback: true,
    allowHints: true,
    opponent: 'ai',
  };
  const vis = resolveFeatureVisibility(training, 'playing');
  assert.equal(vis.triggerAiMove, true);
  // Kết thúc ván thì ẩn (không còn nước để AI đi)
  assert.equal(resolveFeatureVisibility(training, 'finished').triggerAiMove, false);
  // Server vs_ai (từ Sảnh) không được nhờ engine đi thay mình
  const vsAiServer: GameConfig = { ...training, mode: 'vs_ai' };
  assert.equal(
    resolveFeatureVisibility(vsAiServer, 'playing', { isServerMatch: true })
      .triggerAiMove,
    false
  );
});

test('resolveFeatureVisibility: ván server (online) khóa công cụ can thiệp cấu trúc ván', () => {
  const online: GameConfig = {
    mode: 'online',
    analysis: 'off',
    allowTakeback: false,
    allowHints: false,
    opponent: 'human',
  };
  const vis = resolveFeatureVisibility(online, 'playing', { isServerMatch: true });
  assert.equal(vis.openConfig, false); // cấu hình do server sở hữu
  assert.equal(vis.switchSides, false);
  assert.equal(vis.branchFromHere, false);
  assert.equal(vis.newGame, true); // online: nút Ván mới = về Sảnh
  assert.equal(vis.evalBar, false); // analysis off khi đang thi đấu
  assert.equal(vis.evalGraph, false);
  assert.equal(vis.resign, true); // người chơi được đầu hàng
  assert.equal(vis.triggerAiMove, false);
});

test('resolveFeatureVisibility: khán giả chỉ được xem & phân tích, không thao tác', () => {
  const online: GameConfig = {
    mode: 'online',
    analysis: 'off',
    allowTakeback: true,
    allowHints: true,
    opponent: 'human',
  };
  const vis = resolveFeatureVisibility(online, 'playing', {
    isSpectator: true,
    isServerMatch: true,
  });
  assert.equal(vis.canMove, false);
  assert.equal(vis.evalBar, true);
  assert.equal(vis.arrows, true);
  assert.equal(vis.evalGraph, true);
  assert.equal(vis.hints, false); // allowHints của ván không áp dụng cho khán giả
  assert.equal(vis.takeback, false);
  assert.equal(vis.resign, false);
  assert.equal(vis.playSuggestedMove, false);
  assert.equal(vis.triggerAiMove, false);
  assert.equal(vis.openConfig, false);
  assert.equal(vis.switchSides, false);
  assert.equal(vis.branchFromHere, false);
  assert.equal(vis.newGame, false);
  assert.equal(vis.reviewButton, true);
});

test('resolveFeatureVisibility: training được đầu hàng, reviewButton luôn mở', () => {
  const training: GameConfig = {
    mode: 'training',
    analysis: 'eval_only',
    allowTakeback: true,
    allowHints: true,
    opponent: 'human',
  };
  const vis = resolveFeatureVisibility(training, 'playing');
  assert.equal(vis.resign, true);
  assert.equal(vis.reviewButton, true);
  assert.equal(vis.evalBar, true);
  assert.equal(vis.arrows, false); // eval_only: không mũi tên
  assert.equal(vis.playSuggestedMove, false);
});

test('recordsFromUciList & buildPgn: dựng biên bản chính xác và xuất PGN hợp lệ', () => {
  const records = recordsFromUciList(STARTING_FEN, ['e2e4', 'e7e5', 'g1f3']);
  assert.equal(records.length, 3);
  assert.equal(records[0].san, 'e4');
  assert.equal(records[1].san, 'e5');
  assert.equal(records[2].san, 'Nf3');
  assert.equal(records[2].moveNumber, 2);

  const pgn = buildPgn(STARTING_FEN, records);
  assert.ok(pgn.includes('1. e4 e5 2. Nf3'));
});

test('getRankBadge: phân loại chính xác các bậc rank Elo', () => {
  assert.equal(getRankBadge(2300).tier, 'grandmaster');
  assert.equal(getRankBadge(2300).badge, 'GM');

  assert.equal(getRankBadge(1850).tier, 'expert');
  assert.equal(getRankBadge(1850).badge, 'EXP');

  assert.equal(getRankBadge(1550).tier, 'intermediate');
  assert.equal(getRankBadge(1550).badge, 'INT');

  assert.equal(getRankBadge(1200).tier, 'novice');
  assert.equal(getRankBadge(1200).badge, 'NOV');
});

test('formatLastSeen: định dạng nhãn thời gian online/offline', () => {
  assert.equal(formatLastSeen(null), 'Chưa từng online');
  assert.equal(formatLastSeen(undefined), 'Chưa từng online');
  assert.equal(formatLastSeen('invalid-date'), 'Ngoại tuyến');

  const nowIso = new Date().toISOString();
  assert.equal(formatLastSeen(nowIso), 'Vừa online');

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(formatLastSeen(fiveMinAgo), '5p trước');
});
