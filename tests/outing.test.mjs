// おでかけのしおり：画面に依存しない関数のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTheme, themeOf, daysUntil, countdown, isPast, fmtDay, fmtDayKids, stayLabel, splitOutings, sortSteps, cleanStep, stepTitle, stepDetail, stepKids,
  mapUrl, transitUrl, cleanItem, applyTemplate, TEMPLATES, checkId, checkMap, groupItems, doneCount, itemCount, cleanOuting, outingProblem, shareText, isYmd } from '../lib/outing.js';

test('表紙の見た目：名前・行き先から自動で選ぶ', () => {
  assert.equal(autoTheme('動物園の日'), 'zoo');
  assert.equal(autoTheme('', 'テスト水族館'), 'sea');
  assert.equal(autoTheme('夏休み', '海'), 'sea');
  assert.equal(autoTheme('テストランド'), 'park');
  assert.equal(autoTheme('テスト山 ハイキング'), 'nature');
  assert.equal(autoTheme('おばあちゃんの家'), 'plain');
  assert.equal(themeOf({ theme: 'auto', title: '動物園' }), 'zoo');
  assert.equal(themeOf({ theme: 'sea', title: '動物園' }), 'sea');   // 選んだものが先
  assert.equal(themeOf({ theme: 'bad', title: '' }), 'plain');
});

test('日にち：あと何日・今日・おでかけ中・終わり', () => {
  assert.equal(daysUntil('2026-11-29', '2026-11-22'), 7);
  assert.equal(daysUntil('2027-01-02', '2026-12-31'), 2);
  assert.equal(countdown({ date: '2026-11-29' }, '2026-11-22'), 'あと7日');
  assert.equal(countdown({ date: '2026-11-29' }, '2026-11-22', true), 'あと 7 にち');
  assert.equal(countdown({ date: '2026-11-22' }, '2026-11-22'), '今日！');
  assert.equal(countdown({ date: '2026-11-21', endDate: '2026-11-23' }, '2026-11-22'), 'おでかけ中');
  assert.equal(countdown({ date: '2026-11-21' }, '2026-11-22'), '終わりました');
  assert.equal(isPast({ date: '2026-11-21', endDate: '2026-11-22' }, '2026-11-22'), false);
  assert.equal(fmtDay('2026-11-29'), '11/29（日）');
  assert.equal(fmtDayKids('2026-11-29'), '11がつ29にち（にち）');
  assert.equal(stayLabel({ date: '2026-11-29', endDate: '' }), '日帰り');
  assert.equal(stayLabel({ date: '2026-11-29', endDate: '2026-11-30' }), '1泊2日');
  const { up, past } = splitOutings([{ date: '2026-12-10' }, { date: '2026-11-25' }, { date: '2026-11-01' }, { date: 'x' }], '2026-11-22');
  assert.deepEqual(up.map((o) => o.date), ['2026-11-25', '2026-12-10']);
  assert.deepEqual(past.map((o) => o.date), ['2026-11-01']);
  assert.equal(isYmd('2026-02-30'), false);
});

test('予定の流れ：時刻の順・電車の書き方・地図', () => {
  const st = sortSteps([{ time: '12:00', text: 'b' }, { time: '', text: 'c' }, { time: '08:00', text: 'a' }]);
  assert.deepEqual(st.map((s) => s.text), ['a', 'b', 'c']);
  const tr = cleanStep({ kind: 'train', time: '08:21', arr: '08:44', from: 'テストA駅', to: 'テストB駅', line: 'テスト線', track: '3', text: '' });
  assert.equal(stepTitle(tr), '電車　テストA駅 → テストB駅');
  assert.equal(stepDetail(tr), 'テスト線・3番線　8:21 発 → 8:44 着');
  assert.equal(stepKids(tr), 'でんしゃ（テストB駅 まで）');
  assert.equal(cleanStep({ kind: 'plan', text: '  ' }), null);
  assert.equal(cleanStep({ kind: 'plan', time: '25:00', text: 'x', from: 'y' }).time, '');
  assert.equal(cleanStep({ kind: 'plan', text: 'x', from: 'y' }).from, '');            // 予定には駅を持たない
  assert.equal(cleanStep({ kind: 'car', text: 'x', track: '3' }).track, '');
  assert.match(mapUrl({ place: 'テスト動物園' }), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(mapUrl({}), '');
  assert.match(transitUrl(tr), /travelmode=transit/);
});

test('持ち物：定番を足す（重複しない・保険証は入れない）・チェックをまとめる', () => {
  assert.equal(cleanItem({ text: ' ' }), null);
  assert.equal(cleanItem({ text: 'x', who: 'bad' }).who, 'all');
  let items = applyTemplate([], 'day');
  const n = items.length;
  assert.equal(n, TEMPLATES.day.all.length + TEMPLATES.day.kid.length * 3);
  items = applyTemplate(items, 'day');
  assert.equal(items.length, n);                              // 2回押しても増えない
  assert.ok(!JSON.stringify(TEMPLATES).includes('保険'));
  const docs = [{ outing: 'o1', item: items[0].id, done: true, by: 'child1' }, { outing: 'o2', item: items[1].id, done: true }];
  const m = checkMap(docs, 'o1');
  assert.deepEqual(Object.keys(m), [items[0].id]);
  const g = groupItems(items, m);
  assert.deepEqual(g.map((x) => x.who), ['all', 'child1', 'child2', 'child3']);
  assert.equal(doneCount(g), 1); assert.equal(itemCount(g), n);
  assert.equal(checkId('o1', 'i1'), 'o1__i1');
});

test('保存する形：長さ・日付・最後の日', () => {
  const o = cleanOuting({ title: ' テスト動物園の日 ', date: '2026-11-29', endDate: '2026-11-28', theme: 'x', steps: [{ text: 'a' }, { text: '' }], items: [{ text: 'b', who: 'child1' }], ticket: { ref: 'R1' }, extra: 1 });
  assert.equal(o.title, 'テスト動物園の日');
  assert.equal(o.endDate, '');                                // 前の日は入れない
  assert.equal(o.theme, 'auto');
  assert.equal(o.steps.length, 1); assert.equal(o.items[0].who, 'child1');
  assert.deepEqual(Object.keys(o).sort(), ['address', 'date', 'emergency', 'endDate', 'hasPhoto', 'items', 'place', 'steps', 'theme', 'ticket', 'title']);
  assert.equal(outingProblem({ title: '', date: '2026-11-29' }), 'おでかけの名前を入れてください');
  assert.equal(outingProblem({ title: 'a', date: '' }), '日にちを入れてください');
  assert.equal(outingProblem({ title: 'a', date: '2026-11-29' }), '');
});

test('送る文章：行き先・流れ・持ち物（チェック）・もしも', () => {
  const o = cleanOuting({ title: 'テスト動物園の日', date: '2026-11-29', place: 'テスト動物園', steps: [{ kind: 'train', time: '08:21', from: 'テストA駅', to: 'テストB駅' }], items: [{ id: 'i1', who: 'child1', text: 'すいとう' }], emergency: { meet: 'テスト入口' } });
  const t = shareText(o, { child1: 'テ一' }, { i1: { done: true } });
  assert.match(t, /【おでかけのしおり】テスト動物園の日/);
  assert.match(t, /2026年11月29日（日）（日帰り）/);
  assert.match(t, /8:21　電車　テストA駅 → テストB駅/);
  assert.match(t, /テ一：✓すいとう/);
  assert.match(t, /はぐれたら：テスト入口/);
});
