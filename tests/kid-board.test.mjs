// 伝言板の判定（朝夕・お休み・今日だけ／明日だけ・並び・できた！の記録）と QR 登録の小さな関数
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { periodAt, isPaused, onceDate, repeatChoice, draftFromChoice, boardFor, staleOnceIds, isDone, setDone, pruneDone, completionKey, isValidNoticeDraft } from '../lib/kid-notices.js';
import { newToken, sha256Hex, pairUrl, parsePair, checkEmojis, emojiChoices, TOKEN_RE } from '../lib/kid-pairing.js';

const N = (id, o = {}) => ({ id, text: id, targets: ['child1', 'child2', 'child3'], period: 'morning', repeat: 'daily', onDate: '', active: true, updatedAt: { seconds: 100, nanoseconds: 0 }, ...o });
const THU = new Date(2026, 9, 15, 7, 30); // 2026-10-15（木）

class Mem { constructor() { this.m = new Map(); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

test('朝／夕方：初期値は12:00で切り替え、設定で変えられる', () => {
  assert.equal(periodAt(new Date(2026, 9, 15, 6, 0)), 'morning');
  assert.equal(periodAt(new Date(2026, 9, 15, 11, 59)), 'morning');
  assert.equal(periodAt(new Date(2026, 9, 15, 12, 0)), 'evening');
  assert.equal(periodAt(new Date(2026, 9, 15, 23, 59)), 'evening');
  assert.equal(periodAt(new Date(2026, 9, 16, 0, 0)), 'morning');
  assert.equal(periodAt(new Date(2026, 9, 15, 14, 0), '15:00'), 'morning');
  assert.equal(periodAt(new Date(2026, 9, 15, 15, 0), '15:00'), 'evening');
  assert.equal(periodAt(new Date(2026, 9, 15, 13, 0), 'bad'), 'evening'); // 壊れた設定は初期値
});

test('お休みモード：今日だけは翌日に自動解除、解除するまでは続く', () => {
  assert.equal(isPaused('', '2026-10-15'), false);
  assert.equal(isPaused('2026-10-15', '2026-10-15'), true);
  assert.equal(isPaused('2026-10-15', '2026-10-16'), false);
  assert.equal(isPaused('on', '2026-12-31'), true);
  const b = boardFor([N('a')], '2026-10-15', 'morning', '2026-10-15');
  assert.deepEqual([b.child1.length, b.child2.length, b.child3.length], [0, 0, 0]);
  assert.equal(boardFor([N('a')], '2026-10-16', 'morning', '2026-10-15').child1.length, 1);
});

test('今日だけ／明日だけ：前日の夜に入れた「明日だけ」は翌朝に出る', () => {
  const night = new Date(2026, 9, 15, 21, 0);
  const d = draftFromChoice('tomorrow', night);
  assert.deepEqual(d, { repeat: 'once', onDate: '2026-10-16' });
  const n = N('水筒', { ...d, targets: ['child2'] });
  assert.equal(boardFor([n], '2026-10-15', 'morning').child2.length, 0);
  assert.equal(boardFor([n], '2026-10-16', 'morning').child2.length, 1);
  assert.equal(boardFor([n], '2026-10-17', 'morning').child2.length, 0);
  assert.equal(onceDate('today', new Date(2026, 11, 31, 22)), '2026-12-31');
  assert.equal(onceDate('tomorrow', new Date(2026, 11, 31, 22)), '2027-01-01');
  assert.equal(repeatChoice(n, night), 'tomorrow');
  assert.equal(repeatChoice(n, new Date(2026, 9, 16, 7)), 'today');
  assert.equal(repeatChoice(n, new Date(2026, 9, 20, 7)), 'date');
  assert.equal(repeatChoice(N('x', { repeat: 'weekdays' }), night), 'weekdays');
  assert.deepEqual(draftFromChoice('daily', night), { repeat: 'daily', onDate: '' });
  assert.throws(() => draftFromChoice('weekly', night));
});

test('3人それぞれ・2人だけ・朝夕・平日だけの振り分け', () => {
  const at = (s) => ({ updatedAt: { seconds: s, nanoseconds: 0 } });
  const list = [
    N('全員', at(1)), N('1人目だけ', { targets: ['child1'], ...at(2) }), N('2人', { targets: ['child2', 'child3'], ...at(3) }),
    N('夕方', { period: 'evening' }), N('平日', { repeat: 'weekdays' }), N('停止中', { active: false }),
  ];
  const fri = boardFor(list, '2026-10-16', 'morning');
  assert.deepEqual(fri.child1.map((n) => n.id), ['全員', '1人目だけ', '平日']);
  assert.deepEqual(fri.child2.map((n) => n.id), ['全員', '2人', '平日']);
  assert.deepEqual(fri.child3.map((n) => n.id), ['全員', '2人', '平日']);
  const sat = boardFor(list, '2026-10-17', 'morning');
  assert.deepEqual(sat.child1.map((n) => n.id), ['全員', '1人目だけ']);
  assert.deepEqual(boardFor(list, '2026-10-16', 'evening').child2.map((n) => n.id), ['夕方']);
});

test('並び：今日だけの伝言が先、そのあと毎日・平日', () => {
  const b = boardFor([N('毎日'), N('平日', { repeat: 'weekdays' }), N('今日', { repeat: 'once', onDate: '2026-10-15' })], '2026-10-15', 'morning');
  assert.deepEqual(b.child1.map((n) => n.id), ['今日', '毎日', '平日']);
});

test('古い今日だけ・明日だけ（7日より前）を掃除対象にする', () => {
  const list = [N('old', { repeat: 'once', onDate: '2026-10-07' }), N('keep', { repeat: 'once', onDate: '2026-10-08' }), N('daily')];
  assert.deepEqual(staleOnceIds(list, '2026-10-15'), ['old']);
});

test('できた！：押す・取り消す。日付・文面の変更で外れる。古い記録は掃除', () => {
  const s = new Mem(), n = N('a');
  assert.equal(isDone(s, '2026-10-15', 'child1', 'morning', n), false);
  setDone(s, '2026-10-15', 'child1', 'morning', n, true);
  assert.equal(isDone(s, '2026-10-15', 'child1', 'morning', n), true);
  assert.equal(isDone(s, '2026-10-15', 'child2', 'morning', n), false);       // 別の子
  assert.equal(isDone(s, '2026-10-15', 'child1', 'evening', n), false);       // 夕方
  assert.equal(isDone(s, '2026-10-16', 'child1', 'morning', n), false);       // 翌日
  assert.equal(isDone(s, '2026-10-15', 'child1', 'morning', { ...n, updatedAt: { seconds: 200, nanoseconds: 0 } }), false); // 文面を直した
  setDone(s, '2026-10-15', 'child1', 'morning', n, false);
  assert.equal(isDone(s, '2026-10-15', 'child1', 'morning', n), false);
  setDone(s, '2026-10-14', 'child1', 'morning', n, true);
  setDone(s, '2026-10-15', 'child1', 'morning', n, true);
  s.setItem('other', 'x');
  assert.equal(pruneDone(s, '2026-10-15'), 1);
  assert.equal(s.length, 2);
  assert.ok(completionKey('2026-10-15', 'child1', 'morning', n).includes('100.0'));
  // 保存できない端末（プライベートモード等）でも落ちない
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, get length() { throw new Error('x'); } };
  assert.equal(isDone(broken, '2026-10-15', 'child1', 'morning', n), false);
  assert.equal(setDone(broken, '2026-10-15', 'child1', 'morning', n, true), false);
  assert.equal(pruneDone(broken, '2026-10-15'), 0);
  assert.equal(isDone(null, '2026-10-15', 'child1', 'morning', n), false);
});

test('QR：トークンは128bitの乱数（22文字）で毎回違う', () => {
  const a = newToken(), b = newToken();
  assert.match(a, TOKEN_RE); assert.equal(a.length, 22); assert.notEqual(a, b);
});

test('QR：SHA-256 はルール側と同じ16進小文字', async () => {
  const t = 'AbCdEfGhIjKlMnOpQrStUv12';
  assert.equal(await sha256Hex(t), createHash('sha256').update(t).digest('hex'));
});

test('QR：URL は # の後ろに uid とトークン。形が違うものは受け付けない', () => {
  const url = pairUrl('https://example.github.io/app/app.html', 'abcDEF123456', 'AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(url, 'https://example.github.io/app/app.html#pair=abcDEF123456.AbCdEfGhIjKlMnOpQrStUv');
  assert.deepEqual(parsePair('#pair=abcDEF123456.AbCdEfGhIjKlMnOpQrStUv'), { uid: 'abcDEF123456', token: 'AbCdEfGhIjKlMnOpQrStUv' });
  for (const bad of ['', '#pair=abc', '#pair=abcDEF123456.short', '#pair=abc/DEF.AbCdEfGhIjKlMnOpQrStUv', '#x=abcDEF123456.AbCdEfGhIjKlMnOpQrStUv', '#pair=abcDEF123456.AbCdEfGhIjKlMnOpQrStUv&x=1'])
    assert.equal(parsePair(bad), null, bad);
  assert.throws(() => pairUrl('https://x', 'a/b', 'AbCdEfGhIjKlMnOpQrStUv'));
});

test('QR：確認の絵はトークンごとに決まり、両方の端末で同じ', async () => {
  const t = 'AbCdEfGhIjKlMnOpQrStUv12';
  const a = await checkEmojis('uid123', t), b = await checkEmojis('uid123', t);
  assert.equal(a.length, 3); assert.deepEqual(a, b);
  assert.notDeepEqual(a, await checkEmojis('uid123', 'ZZZZZZZZZZZZZZZZZZZZZZ'));
  assert.notDeepEqual(a, await checkEmojis('uid999', t)); // 別の端末なら違う絵
  const ch = emojiChoices(a);
  assert.equal(ch.length, 4); assert.equal(ch.filter((s) => s.join('') === a.join('')).length, 1);
  assert.equal(new Set(ch.map((s) => s.join(''))).size, 4);
});

test('休日のみ（weekends）＝土・日だけ。平日だけ（weekdays）は月〜金のまま', () => {
  const we = N('休日', { repeat: 'weekends' }), wd = N('平日', { repeat: 'weekdays' });
  const days = { '2026-10-16': '金', '2026-10-17': '土', '2026-10-18': '日', '2026-10-19': '月' };
  const got = Object.keys(days).map((d) => boardFor([we, wd], d, 'morning').child1.map((n) => n.id).join());
  assert.deepEqual(got, ['平日', '休日', '休日', '平日']);
  assert.equal(boardFor([we], '2026-02-30', 'morning').child1.length, 0);      // ありえない日付は出さない
  assert.equal(boardFor([we], '2026-10-17', 'morning', '2026-10-17').child1.length, 0); // お休みモードが優先
  assert.equal(boardFor([we], '2026-10-17', 'evening').child1.length, 0);      // 時間帯は別
});
test('休日のみ：保存できる形・親の画面の選択と戻し', () => {
  const night = new Date(2026, 9, 15, 21, 0);
  assert.deepEqual(draftFromChoice('weekends', night), { repeat: 'weekends', onDate: '' });
  assert.equal(repeatChoice(N('x', { repeat: 'weekends' }), night), 'weekends');
  assert.equal(isValidNoticeDraft({ ...N('x', { repeat: 'weekends' }) }), true);
  assert.equal(isValidNoticeDraft({ ...N('x', { repeat: 'weekends', onDate: '2026-10-17' }) }), false);
  assert.equal(isValidNoticeDraft({ ...N('x', { repeat: 'holidays' }) }), false);
  // 既存の種類はそのまま
  for (const r of ['daily', 'weekdays']) assert.equal(isValidNoticeDraft(N('x', { repeat: r })), true);
  assert.equal(isValidNoticeDraft(N('x', { repeat: 'once', onDate: '2026-10-16' })), true);
});
