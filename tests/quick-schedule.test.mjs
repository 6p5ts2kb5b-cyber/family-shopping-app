// かんたん予定入力の解析テスト（基準日：2026-10-12 月曜）
// 実行：node --test tests/quick-schedule.test.mjs   （追加のインストール不要）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickSchedule, readyToSave, setWhoNames } from '../lib/quick-schedule.js';

const NOW = new Date(2026, 9, 12, 9, 0); // 2026-10-12
const P = (t) => parseQuickSchedule(t, NOW);
const pick = (r) => ({ date: r.date, name: r.name, departure: r.departure, returnTime: r.returnTime, who: r.who });

// [入力, 期待値, 説明]
const CASES = [
  // --- 指示書の例 ---
  ['11.3野球大会6:00から17:00', { date: '2026-11-03', name: '野球大会', departure: '06:00', returnTime: '17:00', who: '' }, '指示書の例（区切りなし）'],
  ['11/3 野球大会 6:00〜17:00', { date: '2026-11-03', name: '野球大会', departure: '06:00', returnTime: '17:00', who: '' }, 'スラッシュ＋波ダッシュ'],
  ['11月3日 買い物 10時から12時', { date: '2026-11-03', name: '買い物', departure: '10:00', returnTime: '12:00', who: '' }, '漢字の日付と「時」'],
  ['明日 病院 9:00〜11:00', { date: '2026-10-13', name: '病院', departure: '09:00', returnTime: '11:00', who: '' }, '明日'],
  ['10.25 子どもの行事 8:30から15:00', { date: '2026-10-25', name: '子どもの行事', departure: '08:30', returnTime: '15:00', who: '' }, 'ドット日付'],
  // --- 全角・表記ゆれ ---
  ['１１／３　野球大会　６：００～１７：００', { date: '2026-11-03', name: '野球大会', departure: '06:00', returnTime: '17:00', who: '' }, '全角数字・全角記号'],
  ['11/3 野球大会 6:00-17:00', { date: '2026-11-03', name: '野球大会', departure: '06:00', returnTime: '17:00', who: '' }, 'ハイフン区切り'],
  ['11月3日(火) 野球大会 6時〜17時', { date: '2026-11-03', name: '野球大会', departure: '06:00', returnTime: '17:00', who: '' }, '曜日つき'],
  ['10/20 歯医者 10時半から11時半', { date: '2026-10-20', name: '歯医者', departure: '10:30', returnTime: '11:30', who: '' }, '「半」'],
  ['10/20 美容院 午後2時から午後4時', { date: '2026-10-20', name: '美容院', departure: '14:00', returnTime: '16:00', who: '' }, '午後'],
  ['10/20 会議 9時15分〜10時45分', { date: '2026-10-20', name: '会議', departure: '09:15', returnTime: '10:45', who: '' }, '「分」'],
  ['2026/12/24 クリスマス会 18:00〜21:00', { date: '2026-12-24', name: 'クリスマス会', departure: '18:00', returnTime: '21:00', who: '' }, '年つき'],
  ['2026年12月24日 クリスマス会', { date: '2026-12-24', name: 'クリスマス会', departure: '', returnTime: '', who: '' }, '年つき漢字・時刻なし'],
  ['今日 買い物 15:00', { date: '2026-10-12', name: '買い物', departure: '15:00', returnTime: '', who: '' }, '今日・時刻1つ＝出発'],
  ['あさって 実家 10:00〜', { date: '2026-10-14', name: '実家', departure: '10:00', returnTime: '', who: '' }, 'あさって・終わり未定'],
  ['明日 飲み会 23時まで', { date: '2026-10-13', name: '飲み会', departure: '', returnTime: '23:00', who: '' }, '「まで」だけ＝帰宅'],
  ['明日 出発7:30 帰宅19:00 出勤', { date: '2026-10-13', name: '出勤', departure: '07:30', returnTime: '19:00', who: '' }, '出発・帰宅の明示'],
  // --- 誰の予定 ---
  ['夫 11/3 野球大会 6:00〜17:00', { date: '2026-11-03', name: '野球大会', departure: '06:00', returnTime: '17:00', who: 'husband' }, '先頭に「夫」'],
  ['明日 パート 8:40〜15:00 妻', { date: '2026-10-13', name: 'パート', departure: '08:40', returnTime: '15:00', who: 'wife' }, '末尾に「妻」'],
  ['10/18 家族 まとめ買い 10時〜12時', { date: '2026-10-18', name: 'まとめ買い', departure: '10:00', returnTime: '12:00', who: 'family' }, '「家族」'],
  ['10/18 みんなで動物園 9:00〜16:00', { date: '2026-10-18', name: 'みんなで動物園', departure: '09:00', returnTime: '16:00', who: '' }, '「みんなで」は語の一部なので読まない'],
  ['明日 夫の実家 10時', { date: '2026-10-13', name: '夫の実家', departure: '10:00', returnTime: '', who: '' }, '「夫の〜」は誰の予定と決めつけない'],
];

for (const [input, expected, label] of CASES) {
  test(`${label}：${input}`, () => assert.deepEqual(pick(P(input)), expected));
}

test('過去の日付（年省略）は確認を求め、来年の候補を出す。日付は勝手に変えない', () => {
  const r = P('4/1 入学式 9:00〜12:00');
  assert.equal(r.date, '2026-04-01');
  assert.deepEqual(r.needsConfirm, [{ type: 'past-date', date: '2026-04-01', nextYearDate: '2027-04-01' }]);
});

test('年を書いた過去の日付も確認を求める（来年候補は出さない）', () => {
  const r = P('2026/1/5 初詣');
  assert.deepEqual(r.needsConfirm, [{ type: 'past-date', date: '2026-01-05', nextYearDate: '' }]);
});

test('今日・未来の日付は確認不要', () => {
  assert.deepEqual(P('今日 買い物').needsConfirm, []);
  assert.deepEqual(P('10/12 買い物').needsConfirm, []);
});

test('ありえない日付は読まずに警告', () => {
  const r = P('2/30 買い物');
  assert.equal(r.date, '');
  assert.ok(r.missing.includes('date'));
  assert.equal(r.warnings[0].type, 'invalid-date');
});

test('24:00 など不正な時刻は読まずに警告', () => {
  const r = P('明日 夜勤 22:00〜24:00');
  assert.equal(r.departure, '22:00');
  assert.equal(r.returnTime, '');
  assert.ok(r.warnings.some((w) => w.type === 'invalid-time'));
});

test('帰宅が出発より前なら警告（勝手に入れ替えない）', () => {
  const r = P('明日 夜勤 22:00〜6:00');
  assert.equal(r.departure, '22:00');
  assert.equal(r.returnTime, '06:00');
  assert.ok(r.warnings.some((w) => w.type === 'return-before-departure'));
});

test('日付がなければ空欄のまま（今日と決めつけない）', () => {
  const r = P('野球大会 6:00〜17:00');
  assert.equal(r.date, '');
  assert.ok(r.missing.includes('date'));
  assert.equal(r.name, '野球大会');
});

test('予定内容がなければ空欄', () => {
  const r = P('11/3 6:00〜17:00');
  assert.equal(r.name, '');
  assert.ok(r.missing.includes('name'));
});

test('夫と妻が両方書かれていたら決めずに警告', () => {
  const r = P('明日 夫 妻 買い物');
  assert.equal(r.who, '');
  assert.ok(r.warnings.some((w) => w.type === 'multiple-who'));
});

test('時刻の名前の混同：「6時」を日付と読まない／「11.3」を時刻と読まない', () => {
  const r = P('11.3 6時 集合');
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.departure, '06:00');
  assert.equal(r.name, '集合');
});

test('保存できる条件：日付・内容・誰の予定がそろったとき', () => {
  const r = P('11/3 野球大会 6:00〜17:00');
  assert.equal(readyToSave(r), false); // 誰の予定が未選択
  assert.equal(readyToSave({ ...r, who: 'husband' }), true);
});

test('保存形式はFirestoreルールと同じ（HH:MM の2桁・YYYY-MM-DD）', () => {
  const r = P('1/5 新年会 9:05〜21:30');
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(r.departure, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.match(r.returnTime, /^([01]\d|2[0-3]):[0-5]\d$/);
});

test('空の入力', () => {
  const r = P('   ');
  assert.deepEqual(r.missing, ['date', 'name', 'who', 'departure', 'returnTime']);
});

test('家族設定の表示名（テスト用の名前）で誰の予定かを読む', () => {
  setWhoNames({ husband: '一郎', wife: '花子', child1: '空', child2: '海', child3: '陸' });
  try {
    assert.equal(P('一郎 11/3 野球大会 6:00〜17:00').who, 'husband');
    assert.equal(P('明日 パート 8:40〜15:00 花子').who, 'wife');
    const r = P('空 明日 サッカー 9:00');
    assert.equal(r.who, 'child1'); assert.equal(r.name, 'サッカー');
    assert.equal(P('明日 海 スイミング').who, 'child2');
    assert.equal(P('明日 ピアノ 陸').who, 'child3');
    assert.equal(readyToSave({ ...P('明日 ピアノ 陸') }), true);
    // 名前の漢字を含む予定名は決めつけない／2人書いたら決めない
    const k = P('10/17 空港へ迎え');
    assert.equal(k.who, ''); assert.equal(k.name, '空港へ迎え');
    assert.equal(P('明日 海水浴').name, '海水浴');
    assert.equal(P('明日 空 海 プール').who, '');
    // 夫・妻・パパなどの言葉は今までどおり
    assert.equal(P('夫 明日 出張').who, 'husband');
  } finally { setWhoNames({}); }
  // 名前を設定していなければ読まない
  assert.equal(P('空 明日 サッカー').who, '');
});
test('表示名に使えない値（記号・長すぎ・既存の言葉・重複）は無視', () => {
  setWhoNames({ husband: 'パ.パ', wife: 'ママ', child1: 'あ'.repeat(13), child2: '同じ', child3: '同じ' });
  try {
    assert.equal(P('明日 同じ 会議').who, 'child2');
    assert.equal(P('明日 ママ 会議').who, 'wife');
  } finally { setWhoNames({}); }
});
