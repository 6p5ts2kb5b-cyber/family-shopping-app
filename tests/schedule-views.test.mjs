// 予定の表示ロジック（今日／明日／週末／週間）のテスト
// 実行：node --test tests/schedule-views.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekendOf, weekOf, sortDay, findOverlaps, clampDay, homeWeekendPreview, initialView } from '../lib/schedule-views.js';
import { parseQuickSchedule } from '../lib/quick-schedule.js';

const D = (y, m, d) => new Date(y, m - 1, d, 9, 0);
const MON = D(2026, 10, 12), THU = D(2026, 10, 15), FRI = D(2026, 10, 16), SAT = D(2026, 10, 17), SUN = D(2026, 10, 18);
const ev = (id, date, who, name, departure = '', returnTime = '') => ({ id, date, who, name, departure, returnTime });

// ---- 週末の範囲 ----
test('今週末：平日は次の土日', () => {
  assert.deepEqual(weekendOf(MON), { sat: '2026-10-17', sun: '2026-10-18' });
  assert.deepEqual(weekendOf(FRI), { sat: '2026-10-17', sun: '2026-10-18' });
});
test('今週末：土曜・日曜当日は「その週末」', () => {
  assert.deepEqual(weekendOf(SAT), { sat: '2026-10-17', sun: '2026-10-18' });
  assert.deepEqual(weekendOf(SUN), { sat: '2026-10-17', sun: '2026-10-18' });
});
test('来週末', () => {
  assert.deepEqual(weekendOf(MON, 1), { sat: '2026-10-24', sun: '2026-10-25' });
  assert.deepEqual(weekendOf(SUN, 1), { sat: '2026-10-24', sun: '2026-10-25' });
});
test('年をまたぐ週末', () => {
  assert.deepEqual(weekendOf(D(2026, 12, 31)), { sat: '2027-01-02', sun: '2027-01-03' });
});

// ---- 週間（月〜日） ----
test('週間は月曜はじまり・日曜おわり', () => {
  const w = weekOf(SUN);
  assert.equal(w[0], '2026-10-12');
  assert.equal(w[6], '2026-10-18');
  assert.equal(w.length, 7);
});
test('次の週・月をまたぐ週', () => {
  assert.equal(weekOf(MON, 1)[0], '2026-10-19');
  assert.deepEqual([weekOf(D(2026, 10, 31))[0], weekOf(D(2026, 10, 31))[6]], ['2026-10-26', '2026-11-01']);
});

// ---- 並び順 ----
test('1日の並び：出発順、未定は最後、同時刻は 夫→妻→家族、旧meは夫', () => {
  const day = sortDay([
    ev('a', 'x', 'family', '夕食', '18:00'),
    ev('b', 'x', 'wife', '美容院', '10:00'),
    ev('c', 'x', 'husband', '洗車'),
    ev('d', 'x', 'me', '野球', '10:00'),
  ]);
  assert.deepEqual(day.map((e) => e.id), ['d', 'b', 'a', 'c']);
});

// ---- 重なり ----
test('同じ人の時間の重なりだけを知らせる', () => {
  const o = findOverlaps([
    ev('a', '2026-10-17', 'wife', '美容院', '10:00', '12:00'),
    ev('b', '2026-10-17', 'wife', 'ランチ', '11:30', '14:00'),
    ev('c', '2026-10-17', 'husband', '野球大会', '06:00', '17:00'),
  ]);
  assert.equal(o.get('a'), 'ランチ');
  assert.equal(o.get('b'), '美容院');
  assert.equal(o.has('c'), false); // 夫と妻の重なりは普通のこと
});
test('重なり：ぴったり続く予定は重ならない／帰宅未定は1時間とみなす／出発未定は判定しない／別の日は別', () => {
  assert.equal(findOverlaps([ev('a', 'd', 'wife', 'A', '10:00', '12:00'), ev('b', 'd', 'wife', 'B', '12:00', '13:00')]).size, 0);
  assert.equal(findOverlaps([ev('a', 'd', 'wife', 'A', '10:00'), ev('b', 'd', 'wife', 'B', '10:30', '11:00')]).size, 2);
  assert.equal(findOverlaps([ev('a', 'd', 'wife', 'A'), ev('b', 'd', 'wife', 'B', '10:30', '11:00')]).size, 0);
  assert.equal(findOverlaps([ev('a', 'd1', 'wife', 'A', '10:00', '12:00'), ev('b', 'd2', 'wife', 'B', '10:00', '12:00')]).size, 0);
});
test('重なり：夜勤（日をまたぐ）も判定できる', () => {
  assert.equal(findOverlaps([ev('a', 'd', 'husband', '夜勤', '22:00', '06:00'), ev('b', 'd', 'husband', '飲み会', '23:00', '23:30')]).size, 2);
});

// ---- 多い日の表示 ----
test('1日に5件なら4件表示＋「ほか1件」', () => {
  const day = Array.from({ length: 5 }, (_, i) => ev(String(i), 'd', 'family', `予定${i}`, `0${i + 6}:00`));
  const r = clampDay(day, 4);
  assert.equal(r.shown.length, 4);
  assert.equal(r.more, 1);
  assert.equal(clampDay(day.slice(0, 3), 4).more, 0);
});

// ---- ホームの週末欄 ----
const weekendEvents = [
  ev('1', '2026-10-17', 'husband', '野球大会', '06:00', '17:00'),
  ev('2', '2026-10-17', 'wife', '美容院', '10:00', '12:00'),
  ev('3', '2026-10-17', 'family', '実家で夕食', '18:00', '21:00'),
  ev('4', '2026-10-18', 'family', 'まとめ買い', '10:00', '12:00'),
  ev('5', '2026-10-18', 'husband', '洗車'),
  ev('6', '2026-10-24', 'family', '来週の予定', '09:00'),
];
test('ホームの週末欄：月〜水と日曜は出さない', () => {
  assert.equal(homeWeekendPreview(MON, weekendEvents), null);
  assert.equal(homeWeekendPreview(D(2026, 10, 14), weekendEvents), null);
  assert.equal(homeWeekendPreview(SUN, weekendEvents), null);
});
test('ホームの週末欄：木・金は今週末を2件＋ほか件数', () => {
  for (const day of [THU, FRI]) {
    const p = homeWeekendPreview(day, weekendEvents);
    assert.equal(p.title, '今週末');
    assert.deepEqual(p.shown.map((e) => e.id), ['1', '2']);
    assert.equal(p.more, 3); // 来週の予定は含めない
  }
});
test('ホームの週末欄：土曜は「明日（日曜）」', () => {
  const p = homeWeekendPreview(SAT, weekendEvents);
  assert.equal(p.title, '明日');
  assert.deepEqual(p.shown.map((e) => e.id), ['4', '5']);
  assert.equal(p.more, 0);
});
test('ホームの週末欄：予定がなければ empty（「＋予定を追加」を出す）', () => {
  assert.equal(homeWeekendPreview(FRI, []).empty, true);
});

test('予定タブの初期表示は前回の選択、なければ今日', () => {
  assert.equal(initialView('weekend'), 'weekend');
  assert.equal(initialView(undefined), 'today');
  assert.equal(initialView('xxx'), 'today');
});

// ---- 文章入力：曜日・週末 ----
const P = (t, now = MON) => parseQuickSchedule(t, now);
test('「土曜」は今日を含めて次の土曜', () => {
  assert.equal(P('土曜 BBQ 10:00').date, '2026-10-17');
  assert.equal(P('土曜 BBQ 10:00', SAT).date, '2026-10-17');
  assert.equal(P('日曜日 洗車').date, '2026-10-18');
  assert.equal(P('土曜 BBQ 10:00').name, 'BBQ');
});
test('「来週土曜」「来週の火曜」は来週（月〜日）の曜日', () => {
  assert.equal(P('来週土曜 運動会 8:00').date, '2026-10-24');
  assert.equal(P('来週の火曜 健診').date, '2026-10-20');
  assert.equal(P('来週土曜 運動会 8:00', SUN).date, '2026-10-24');
});
test('「週末」「来週末」は土日どちらか選んでもらう（勝手に決めない）', () => {
  const r = P('週末 BBQ 10:00〜14:00');
  assert.equal(r.date, '');
  assert.deepEqual(r.needsConfirm, [{ type: 'pick-day', options: ['2026-10-17', '2026-10-18'] }]);
  assert.equal(r.name, 'BBQ');
  assert.deepEqual(P('来週末 キャンプ').needsConfirm[0].options, ['2026-10-24', '2026-10-25']);
});
test('「日」1文字は曜日と読まない', () => {
  assert.equal(P('日 洗車').date, '');
});
test('日付が書いてあれば曜日より日付を優先（11/3(火)）', () => {
  assert.equal(P('11/3(火) 野球大会').date, '2026-11-03');
});
