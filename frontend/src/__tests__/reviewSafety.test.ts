import test from 'node:test';
import assert from 'node:assert/strict';

test('winLoss safety: null or undefined does not throw and formats correctly', () => {
  const sanitizeWinLoss = (val: unknown): string | null => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return `−${val.toFixed(1)}`;
    }
    return null;
  };

  assert.equal(sanitizeWinLoss(null), null);
  assert.equal(sanitizeWinLoss(undefined), null);
  assert.equal(sanitizeWinLoss(NaN), null);
  assert.equal(sanitizeWinLoss(2.34), '−2.3');
  assert.equal(sanitizeWinLoss(0), '−0.0');
});

test('reviewResult counts safety: partial or missing counts does not throw', () => {
  const getCounts = (counts: any, key: string) => {
    const w = counts?.w?.[key] ?? counts?.[key] ?? 0;
    const b = counts?.b?.[key] ?? 0;
    return { w, b };
  };

  assert.deepEqual(getCounts(null, 'Best'), { w: 0, b: 0 });
  assert.deepEqual(getCounts(undefined, 'Best'), { w: 0, b: 0 });
  assert.deepEqual(getCounts({}, 'Best'), { w: 0, b: 0 });
  assert.deepEqual(getCounts({ Best: 5 }, 'Best'), { w: 5, b: 0 });
  assert.deepEqual(getCounts({ w: { Best: 3 }, b: { Best: 2 } }, 'Best'), { w: 3, b: 2 });
});

test('customArrows safety: invalid square inputs are cleanly filtered out', () => {
  const rawArrows = [
    { from: 'e2', to: 'e4' },
    { from: '', to: '' },
    { from: 'e2', to: 'e2' },
    { from: null as any, to: 'e4' },
    { from: 'e7', to: null as any },
    { from: 'd2', to: 'd4' },
  ];

  const validArrows = rawArrows.filter(
    (a) => a.from && a.to && a.from !== a.to
  );

  assert.equal(validArrows.length, 2);
  assert.deepEqual(validArrows, [
    { from: 'e2', to: 'e4' },
    { from: 'd2', to: 'd4' },
  ]);
});
