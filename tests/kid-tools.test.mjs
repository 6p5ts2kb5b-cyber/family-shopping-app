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

test('しゅっぱつ まで：時刻の設定・のこり・表示する時間帯', async () => {
  const { normDepart, shiftDepart, departLabel, departState, departText, clockAngles, sectorPath, DEPART_DEFAULT } = await import('../lib/kid-tools.js');
  assert.deepEqual(normDepart(null), { ...DEPART_DEFAULT, times: { child1: '07:30', child2: '07:30', child3: '07:30' } });
  assert.equal(normDepart({ time: '04:00' }).time, '05:00');            // 5:00〜10:00 に収める
  assert.equal(normDepart({ time: 'x' }).time, '07:30');                // 壊れた値は初期値
  assert.equal(normDepart({ on: false, showNow: false }).on, false);
  assert.equal(shiftDepart('07:30', 1), '07:35'); assert.equal(shiftDepart('07:30', -2), '07:20');
  assert.equal(shiftDepart('09:58', 3), '10:00'); assert.equal(departLabel('07:05'), '7:05');
  const thu = (h, m, s = 0) => new Date(2026, 10, 5, h, m, s);   // 木曜
  let st = departState(thu(7, 5), {});
  assert.ok(st.show); assert.equal(st.phase, 'count'); assert.equal(st.leftMs, 25 * 60000);
  assert.equal(departState(thu(7, 26), {}).phase, 'soon');               // のこり5ふん以内
  st = departState(thu(7, 30), {}); assert.equal(st.phase, 'go'); assert.equal(st.leftMs, 0);
  assert.ok(departState(thu(7, 44), {}).show);                           // しゅっぱつ15ふん後まで出す
  assert.ok(!departState(thu(7, 45), {}).show);
  assert.ok(!departState(thu(7, 5), { on: false }).show);
  const sat = new Date(2026, 10, 7, 7, 5);
  assert.ok(!departState(sat, {}).show);                                 // へいじつだけ：土曜は出さない
  assert.ok(departState(sat, { weekdaysOnly: false }).show);
  assert.equal(departText(25 * 60000), 'あと 25ふん');
  assert.equal(departText(24 * 60000 + 1), 'あと 25ふん');               // 1びょうでも のこれば切り上げ
  assert.equal(departText(4 * 60000), 'あと 4ぷん'); assert.equal(departText(10 * 60000), 'あと 10ぷん');
  assert.equal(departText(70 * 60000), 'あと 1じかん 10ぷん'); assert.equal(departText(120 * 60000), 'あと 2じかん');
  assert.equal(departText(30000), 'あと すこし！'); assert.equal(departText(0), 'しゅっぱつ じかん！');
  const a = clockAngles(thu(7, 30));
  assert.equal(a.minute, 180); assert.equal(a.hour, 225);                // 7:30 → 長い針は6、短い針は7と8のあいだ
  assert.equal(sectorPath(0.5, 0.5), '');
  assert.match(sectorPath(0, 0.25), /^M 100 100 L 100\.00 10\.00 A 90 90 0 0 1 190\.00 100\.00 Z$/);
  assert.match(sectorPath(0.75, 1.25), /A 90 90 0 0 1 190\.00 100\.00 Z$/); // 12時をまたいでもよい
});

test('タイムタイマー型の扇形：0から左まわり', async () => {
  const { wedgePathCCW } = await import('../lib/kid-tools.js');
  assert.equal(wedgePathCCW(0), '');
  assert.equal(wedgePathCCW(0.25), 'M 100 100 L 100 10 A 90 90 0 0 0 10.00 100.00 Z');   // 15ふん → 左（9時）
  assert.match(wedgePathCCW(0.75), / 0 1 0 190\.00 100\.00 Z$/);                        // 45ふん → 右（3時）
  assert.match(wedgePathCCW(1), /^M 100 10 A 90 90 0 1 0 /);
});

test('しゅっぱつ：子どもごとの時刻', async () => {
  const { normDepart, departGroups, departPlan } = await import('../lib/kid-tools.js');
  // 以前の「みんな同じ時刻」の設定は、全員にひきつぐ
  assert.deepEqual(normDepart({ time: '07:40' }).times, { child1: '07:40', child2: '07:40', child3: '07:40' });
  const cfg = { times: { child3: '07:50' } };
  assert.deepEqual(departGroups(cfg), [{ time: '07:30', kids: ['child1', 'child2'] }, { time: '07:50', kids: ['child3'] }]);
  assert.deepEqual(departGroups({ times: { child1: '08:00', child2: '07:15' } }).map((g) => g.time), ['07:15', '07:30', '08:00']); // 早い順
  const fri = (h, m) => new Date(2026, 10, 6, h, m);
  let p = departPlan(fri(7, 15), cfg);
  assert.equal(p.target, 0); assert.equal(p.groups[0].leftMs, 15 * 60000);
  p = departPlan(fri(7, 33), cfg);
  assert.equal(p.target, 1); assert.equal(p.groups[0].phase, 'go'); assert.equal(p.groups[1].leftMs, 17 * 60000);
  p = departPlan(fri(7, 52), cfg);
  assert.equal(p.target, 1); assert.equal(p.groups[1].phase, 'go');            // 全員すぎたら 最後のグループ
  assert.ok(departPlan(fri(8, 4), cfg).show); assert.ok(!departPlan(fri(8, 5), cfg).show); // 最後の15ふん後まで
  assert.equal(normDepart({ times: { child2: '11:00' } }).times.child2, '10:00');   // はんいの外は 収める
});
