import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDmTopic } from '../hooks/useChat';

test('buildDmTopic: 2 phía ra cùng topic bất kể thứ tự tham số (id sorted)', () => {
  const a = 'user-aaa';
  const b = 'user-zzz';
  assert.equal(buildDmTopic(a, b), buildDmTopic(b, a));
  assert.equal(buildDmTopic(a, b), 'dm:user-aaa:user-zzz');
});

test('buildDmTopic: topic của cặp khác thì khác', () => {
  assert.notEqual(buildDmTopic('a', 'b'), buildDmTopic('a', 'c'));
});
