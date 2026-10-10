import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percent, canMiss, mustAttend, forecast, status } from '../src/core.js';

// Brute-force checker: the slow, obviously-correct way. Count skips one at a time.
function slowCanMiss(a, t, P) {
  let k = 0;
  while ((a * 100) / (t + k + 1) >= P) k++;
  return k;
}
function slowMustAttend(a, t, P) {
  let n = 0;
  while (((a + n) * 100) / (t + n) < P) n++;
  return n;
}

test('canMiss and mustAttend agree with brute force for every case up to 80 lectures', () => {
  for (const P of [50, 60, 65, 70, 75, 80, 85, 90]) {
    for (let t = 1; t <= 80; t++) {
      for (let a = 0; a <= t; a++) {
        assert.equal(canMiss(a, t, P), slowCanMiss(a, t, P), `canMiss(${a}, ${t}, ${P})`);
        assert.equal(mustAttend(a, t, P), slowMustAttend(a, t, P), `mustAttend(${a}, ${t}, ${P})`);
      }
    }
  }
});

test('the textbook float formula is wrong at 80% (why core.js uses integers)', () => {
  // ceil((0.8 * t - a) / (1 - 0.8)) with a = 3, t = 5 gives 6, but the answer is 5.
  const naive = Math.ceil((0.8 * 5 - 3) / (1 - 0.8));
  assert.equal(naive, 6);
  assert.equal(mustAttend(3, 5, 80), 5);
});

test('worked examples from the landing page', () => {
  assert.equal(canMiss(32, 38, 75), 4);
  assert.equal(canMiss(32, 42, 75), 0);
  assert.equal(mustAttend(32, 46, 75), 10);
  assert.equal(percent(42, 56), 75);
  assert.equal(status(42, 56, 75), 'edge');
});

test('edge cases', () => {
  assert.equal(percent(0, 0), null);
  assert.equal(status(0, 0, 75), 'empty');
  assert.equal(canMiss(0, 0, 75), 0);
  assert.equal(mustAttend(0, 0, 75), 0);
  assert.equal(mustAttend(9, 10, 100), Infinity);
  assert.equal(mustAttend(10, 10, 100), 0);
  assert.equal(canMiss(10, 10, 100), 0);
  assert.equal(status(30, 40, 75), 'edge'); // exactly 75% counts as safe, with nothing to spare
  assert.equal(status(29, 40, 75), 'below');
  assert.equal(status(31, 40, 75), 'safe');
});

test('forecast to end of semester', () => {
  // 20 of 30 so far (66.7%), 30 lectures left: need ceil(0.75 * 60) = 45 attended in total.
  assert.deepEqual(forecast(20, 30, 75, 30), { total: 60, needed: 45, maxSkip: 5, reachable: true, best: 83.33333333333333 });
  // 5 of 30 with 10 left can never reach 75%.
  assert.equal(forecast(5, 30, 75, 10).reachable, false);
  // Already safe with no lectures left: maxSkip is capped at 0 remaining.
  assert.equal(forecast(40, 40, 75, 0).maxSkip, 0);
});
