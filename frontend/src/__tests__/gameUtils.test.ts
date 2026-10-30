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
