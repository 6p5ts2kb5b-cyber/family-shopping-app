// 予定を送る（1か月分）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, shareDays, shareDaysRange, shareWeekTitle, shareTitle, shareText, timeText, setMemberLabels } from '../lib/schedule-views.js';

const ev = (id, date, who, name, departure = '', returnTime = '') => ({ id, date, who, name, departure, returnTime });
const E = [
  ev('a', '2026-10-16', 'husband', '病院', '19:00', '20:30'),
  ev('b', '2026-10-17', 'family', 'テスト運動会'),
  ev('c', '2026-10-18', 'husband', '野球', '06:30', '15:00'),
  ev('d', '2026-10-18', 'wife', '美容院', '10:00', '12:00'),
  ev('e', '2026-10-25', 'me', '旧データの予定', '09:00'),
  ev('f', '2026-11-01', 'husband', '来月', '08:00'),
  ev('g', '2026-09-30', 'husband', '先月', '08:00'),
];

test('月の範囲（月末・うるう年）', () => {
  assert.deepEqual(monthRange(2026, 10), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(monthRange(2028, 2), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(monthRange(2026, 12), { start: '2026-12-01', end: '2026-12-31' });
});

test('全員・毎日：その月の予定がある日だけ、日付順', () => {
  const d = shareDays(E, 2026, 10);
  assert.deepEqual(d.map((x) => x.date), ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-25']);
  assert.equal(d[0].label, '10/16（金）');
  assert.ok(!d.some((x) => x.events.some((e) => e.id === 'f' || e.id === 'g')), '前後の月は入らない');
});

test('夫だけ：夫と旧データの「私」だけ（家族・妻は入らない）', () => {
  const d = shareDays(E, 2026, 10, { who: 'husband' });
  assert.deepEqual(d.flatMap((x) => x.events.map((e) => e.id)), ['a', 'c', 'e']);
});

test('週末だけ：土日だけ。予定のない土日も「予定なし」で並ぶ', () => {
  const d = shareDays(E, 2026, 10, { weekendOnly: true });
  assert.equal(d.length, 9); // 2026年10月の土日は 3,4,10,11,17,18,24,25,31
  assert.ok(d.every((x) => /（[土日]）/.test(x.label)));
  assert.deepEqual(d.find((x) => x.date === '2026-10-18').events.map((e) => e.id), ['c', 'd']);
  assert.equal(d.find((x) => x.date === '2026-10-03').events.length, 0);
  assert.ok(!d.some((x) => x.date === '2026-10-16'), '金曜は入らない');
});

test('夫だけ＋週末だけ', () => {
  const d = shareDays(E, 2026, 10, { who: 'husband', weekendOnly: true });
  assert.deepEqual(d.flatMap((x) => x.events.map((e) => e.id)), ['c', 'e']);
});

test('見出し', () => {
  assert.equal(shareTitle(2026, 10), '2026年10月の予定');
  assert.equal(shareTitle(2026, 10, { who: 'husband', weekendOnly: true }), '2026年10月の予定（夫の予定・週末だけ）');
});

test('時刻の書き方', () => {
  assert.equal(timeText(ev('x', 'd', 'h', 'n', '06:30', '15:00')), '6:30→15:00');
  assert.equal(timeText(ev('x', 'd', 'h', 'n', '09:00')), '9:00〜');
  assert.equal(timeText(ev('x', 'd', 'h', 'n', '', '17:00')), '〜17:00');
  assert.equal(timeText(ev('x', 'd', 'h', 'n')), '時間未定');
});

test('文章版', () => {
  const s = shareText(shareDays(E, 2026, 10, { who: 'husband', weekendOnly: true }), '10月の予定');
  assert.ok(s.startsWith('【10月の予定】'));
  assert.ok(s.includes('10/18（日）\n・夫｜野球　6:30→15:00'));
  assert.ok(s.includes('10/3（土）\n・予定なし'));
  assert.equal(shareText([], 'x'), '【x】\n予定はありません');
});

test('子ども（child1）だけを選べる', () => {
  const d = shareDays([...E, ev('k', '2026-10-17', 'child1', 'サッカー', '09:00', '12:00')], 2026, 10, { who: 'child1' });
  assert.deepEqual(d.map((x) => x.events.map((e) => e.name)), [['サッカー']]);
  assert.equal(shareTitle(2026, 10, { who: 'child1' }), '2026年10月の予定（子ども1の予定）');
  assert.ok(shareText(d, 'x').includes('・子ども1｜サッカー　9:00→12:00'));
});

test('1週間分：予定のない日も7日すべて並ぶ', () => {
  const d = shareDaysRange(E, '2026-10-12', '2026-10-18', { fillAll: true });
  assert.equal(d.length, 7);
  assert.equal(d[0].label, '10/12（月）');
  assert.deepEqual(d[0].events, []);
  assert.deepEqual(d[6].events.map((e) => e.name), ['野球', '美容院']);
});
test('1週間分＋人＋週末だけ', () => {
  const d = shareDaysRange(E, '2026-10-12', '2026-10-18', { who: 'husband', weekendOnly: true, fillAll: true });
  assert.deepEqual(d.map((x) => x.date), ['2026-10-17', '2026-10-18']);
  assert.deepEqual(d[1].events.map((e) => e.name), ['野球']);
  assert.equal(shareWeekTitle('2026-10-12', '2026-10-18', { who: 'husband', weekendOnly: true }), '10/12〜10/18の予定（夫の予定・週末だけ）');
  assert.equal(shareWeekTitle('2026-10-26', '2026-11-01'), '10/26〜11/1の予定');
});

test('家族設定の表示名を反映できる（空なら既定の呼び名）', () => {
  setMemberLabels({ husband: 'テスト夫', child1: ' テスト一 ' });
  try {
    assert.equal(shareTitle(2026, 10, { who: 'husband' }), '2026年10月の予定（テスト夫の予定）');
    assert.equal(shareTitle(2026, 10, { who: 'child1' }), '2026年10月の予定（テスト一の予定）');
    assert.equal(shareTitle(2026, 10, { who: 'wife' }), '2026年10月の予定（妻の予定）');
  } finally { setMemberLabels({}); }
  assert.equal(shareTitle(2026, 10, { who: 'husband' }), '2026年10月の予定（夫の予定）');
});
