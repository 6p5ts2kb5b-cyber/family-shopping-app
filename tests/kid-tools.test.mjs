// タイマー・とうひょう（タブレットの中だけ）の判定テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationOrder, nextInOrder, clampMinutes, startTimer, pauseTimer, resumeTimer, remainingMs, isRunning, isFinished, formatClock, createPoll, castVote, tally, winners, pickRandom } from '../lib/kid-tools.js';

test('順番は日が変わると1人ずつずれ、3日で1周する', () => {
  const a = rotationOrder('2026-10-20'), b = rotationOrder('2026-10-21'), c = rotationOrder('2026-10-22'), d = rotationOrder('2026-10-23');
  assert.deepEqual(b, [...a.slice(1), a[0]]);
  assert.deepEqual(c, [...b.slice(1), b[0]]);
  assert.deepEqual(d, a);
  assert.equal(new Set([a[0], b[0], c[0]]).size, 3); // 3日で全員が1番になる
  assert.deepEqual(rotationOrder('2026-12-31').length, 3);
  assert.deepEqual(rotationOrder('2027-01-01'), [...rotationOrder('2026-12-31').slice(1), rotationOrder('2026-12-31')[0]]); // 年をまたいでも続く
});
test('順番モード：終わった人をとばして次の人。全員終わったら null', () => {
  const o = ['child2', 'child3', 'child1'];
  assert.equal(nextInOrder(o, []), 'child2');
  assert.equal(nextInOrder(o, ['child2']), 'child3');
  assert.equal(nextInOrder(o, ['child3']), 'child2');
  assert.equal(nextInOrder(o, ['child1', 'child2', 'child3']), null);
});
test('時間の設定は1〜60分（壊れた値は10分）', () => {
  assert.equal(clampMinutes(10), 10); assert.equal(clampMinutes(0), 1); assert.equal(clampMinutes(99), 60);
  assert.equal(clampMinutes('15'), 15); assert.equal(clampMinutes('abc'), 10); assert.equal(clampMinutes(7.6), 8);
});
test('タイマー：残り時間・一時停止・再開・終わり（時計で計算）', () => {
  const t0 = 1_000_000;
  let t = startTimer('child1', 10, t0);
  assert.equal(remainingMs(t, t0), 600000); assert.ok(isRunning(t));
  assert.equal(formatClock(remainingMs(t, t0 + 61000)), '8:59');
  t = pauseTimer(t, t0 + 120000);
  assert.ok(!isRunning(t)); assert.equal(remainingMs(t, t0 + 999999), 480000); // 止めている間は減らない
  t = resumeTimer(t, t0 + 300000);
  assert.equal(remainingMs(t, t0 + 300000 + 479000), 1000);
  assert.ok(isFinished(t, t0 + 300000 + 480000)); assert.equal(formatClock(remainingMs(t, t0 + 900000)), '0:00');
  assert.equal(formatClock(1), '0:01'); assert.equal(formatClock(600000), '10:00');
  assert.equal(pauseTimer(pauseTimer(t, t0 + 300001), t0 + 400000).leftMs, pauseTimer(t, t0 + 300001).leftMs); // 2回押しても同じ
});
test('とうひょう：質問と選択肢（空欄・重複を除く、2〜6個）', () => {
  assert.deepEqual(createPoll(' ゆうはん ', ['カレー', '', 'カレー', 'すし ']).choices, ['カレー', 'すし']);
  assert.equal(createPoll('', ['a', 'b']), null);
  assert.equal(createPoll('q', ['a']), null);
  assert.equal(createPoll('q', ['1', '2', '3', '4', '5', '6', '7']), null);
});
test('とうひょう：1人1票・変更・取り消し、5人分', () => {
  let p = createPoll('ゆうはん', ['カレー', 'すし', 'うどん']);
  p = castVote(p, 'father', 0); p = castVote(p, 'mother', 1); p = castVote(p, 'child1', 1);
  p = castVote(p, 'child2', 2); p = castVote(p, 'child2', 0);   // 変更
  p = castVote(p, 'child3', 2); p = castVote(p, 'child3', 2);   // 取り消し
  p = castVote(p, 'stranger', 1); p = castVote(p, 'father', 9); // 無効
  const t = tally(p);
  assert.deepEqual(t.map((r) => r.count), [2, 2, 0]);
  assert.deepEqual(t[0].voters, ['father', 'child2']);
  assert.deepEqual(winners(p), [0, 1]);                          // 同点は両方
  assert.deepEqual(winners(castVote(p, 'child3', 1)), [1]);
  assert.deepEqual(winners(createPoll('q', ['a', 'b'])), []);    // まだだれも入れていない
});
test('ランダム：同点・ルーレットは候補の中から必ず1つ', () => {
  assert.equal(pickRandom(['a', 'b', 'c'], () => 0), 'a');
  assert.equal(pickRandom(['a', 'b', 'c'], () => 0.9999), 'c');
  assert.equal(pickRandom([], () => 0.5), null);
  const seen = new Set(); for (let i = 0; i < 300; i++) seen.add(pickRandom([1, 2, 3]));
  assert.equal(seen.size, 3);
});

test('カウントアップ／ダウン：表示する時間とアナログの割合', async () => {
  const { elapsedMs, shownMs, dialFraction, wedgePath, startPrep, PREP_MIN } = await import('../lib/kid-tools.js');
  const t0 = 0, t = startTimer('child1', 10, t0);
  assert.equal(shownMs(t, 3 * 60000, 'down'), 7 * 60000);
  assert.equal(shownMs(t, 3 * 60000, 'up'), 3 * 60000);
  assert.equal(elapsedMs(t, 99 * 60000), 10 * 60000);            // 終わったら最大で全体の時間
  assert.equal(dialFraction(t, 0, 'down'), 1); assert.equal(dialFraction(t, 0, 'up'), 0);
  assert.equal(dialFraction(t, 5 * 60000, 'down'), 0.5); assert.equal(dialFraction(t, 5 * 60000, 'up'), 0.5);
  assert.equal(wedgePath(0), '');
  assert.match(wedgePath(0.25), /^M 100 100 L 100 10 A 90 90 0 0 1 190\.00 100\.00 Z$/);
  assert.match(wedgePath(0.75), / 0 1 1 /);                       // 半分より大きいと大きい弧
  assert.match(wedgePath(1), /^M 100 10 A/);
  const p = startPrep('child2', 1000);
  assert.ok(p.prep); assert.equal(p.kid, 'child2'); assert.equal(remainingMs(p, 1000), PREP_MIN * 60000);
  assert.equal(PREP_MIN, 2);
});
