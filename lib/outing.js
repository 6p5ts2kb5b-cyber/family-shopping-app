// おでかけのしおり（親のアプリ・子ども用タブレット共通）。画面に依存しない関数だけ。
// Firestore：outings/{id}          = { title, date, endDate, place, address, theme, hasPhoto, steps[], items[], ticket{}, emergency{}, updatedAt }
//            outingChecks/{id__item} = { outing, item, done, by, at }   … 持ち物のチェック（家族みんなに同じに見える）
//            outingPhotos/{id}       = { data, updatedAt }               … 表紙の写真（小さく縮めた JPEG の data URL）

export const WHO_KEYS = Object.freeze(['all', 'husband', 'wife', 'child1', 'child2', 'child3']);
export const KID_KEYS = Object.freeze(['child1', 'child2', 'child3']);
export const STEP_KINDS = Object.freeze(['plan', 'train', 'car']);
export const LIMITS = Object.freeze({ title: 40, place: 80, address: 120, text: 80, station: 40, line: 40, track: 10, item: 40, ticket: 80, emergency: 120, steps: 40, items: 120 });
export const PHOTO_MAX = 600000; // data URL の長さの上限（ルールと同じ）

const pad = (n) => String(n).padStart(2, '0');
const parse = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymdOf(parse(s)) === s;
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const KDOW = ['にち', 'げつ', 'か', 'すい', 'もく', 'きん', 'ど'];

/** 文字を整える（前後・連続の空白、長さ） */
export const clean = (s, max) => String(s ?? '').replace(/[\s　]+/g, ' ').trim().slice(0, max);
/** 文書IDに使える乱数 */
export const newId = () => (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);

// ---------- 表紙の見た目（行き先に合わせる） ----------
export const THEMES = Object.freeze({
  zoo:    { label: '動物園',     bg: '#B8601C', motif: '#D98A48', ink: '#7A3E0E', soft: '#FBE9D8' },
  sea:    { label: '海・水族館', bg: '#22649F', motif: '#4B8CC8', ink: '#174A7A', soft: '#E3EEF9' },
  nature: { label: '山・公園',   bg: '#3A7536', motif: '#5E9A58', ink: '#285426', soft: '#E4F0E2' },
  park:   { label: '遊園地',     bg: '#AD3D73', motif: '#CF6898', ink: '#842A55', soft: '#F8E3ED' },
  plain:  { label: 'ふつう',     bg: '#1F5C45', motif: '#3E7A62', ink: '#1F5C45', soft: '#E3EEE7' },
});
export const THEME_KEYS = Object.freeze(Object.keys(THEMES));
const THEME_WORDS = [
  ['zoo', /動物|どうぶつ|ズー|zoo|サファリ|ふれあい|牧場|ぼくじょう/i],
  ['sea', /水族館|すいぞく|海|うみ|ビーチ|プール|港|湖|川|釣|つり|アクア|aqua|シー|sea/i],
  ['park', /遊園地|ゆうえんち|ランド|テーマパーク|ディズニー|ユニバ|USJ|パーク|遊び|あそび|アスレチック|land/i],
  ['nature', /山|やま|公園|こうえん|キャンプ|ハイキング|森|もり|高原|花|はな|紅葉|もみじ|自然|ピクニック|いちご|ぶどう|りんご|狩り|がり/i],
];
/** 名前・行き先から表紙の見た目を選ぶ（どれにも当たらなければ「ふつう」） */
export function autoTheme(...texts) {
  const s = texts.map((t) => String(t ?? '')).join(' ');
  for (const [k, re] of THEME_WORDS) if (re.test(s)) return k;
  return 'plain';
}
/** しおりの見た目のキー（auto は自動で選ぶ） */
export const themeOf = (o) => (THEME_KEYS.includes(o?.theme) ? o.theme : autoTheme(o?.title, o?.place));

// ---------- 日にち ----------
/** 今日から何日後か（今日=0、過ぎたら負） */
export function daysUntil(ymd, todayYmd) {
  if (!isYmd(ymd) || !isYmd(todayYmd)) return null;
  return Math.round((parse(ymd) - parse(todayYmd)) / 86400000);
}
/** 「あと7日」「今日！」「おでかけ中」「おわり」 */
export function countdown(o, todayYmd, kids = false) {
  const n = daysUntil(o?.date, todayYmd);
  if (n === null) return '';
  const end = isYmd(o?.endDate) ? daysUntil(o.endDate, todayYmd) : n;
  if (n > 0) return kids ? `あと ${n} にち` : `あと${n}日`;
  if (n === 0) return kids ? 'きょう！' : '今日！';
  if (end >= 0) return kids ? 'おでかけちゅう' : 'おでかけ中';
  return kids ? 'おわったよ' : '終わりました';
}
export const isPast = (o, todayYmd) => (daysUntil(isYmd(o?.endDate) ? o.endDate : o?.date, todayYmd) ?? -1) < 0;
/** 11/29（日） */
export function fmtDay(ymd) { if (!isYmd(ymd)) return ''; const d = parse(ymd); return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`; }
/** 2026年11月29日（日） */
export function fmtDayLong(ymd) { if (!isYmd(ymd)) return ''; const d = parse(ymd); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`; }
/** 11がつ29にち（にち） */
export function fmtDayKids(ymd) { if (!isYmd(ymd)) return ''; const d = parse(ymd); return `${d.getMonth() + 1}がつ${d.getDate()}にち（${KDOW[d.getDay()]}）`; }
/** 日帰り・泊まり（2泊3日）の表示 */
export function stayLabel(o) {
  const n = isYmd(o?.endDate) ? daysUntil(o.endDate, o.date) : 0;
  return n > 0 ? `${n}泊${n + 1}日` : '日帰り';
}
/** これからのしおり（近い順）と、終わったしおり（新しい順） */
export function splitOutings(list, todayYmd) {
  const ok = (list || []).filter((o) => isYmd(o?.date));
  const up = ok.filter((o) => !isPast(o, todayYmd)).sort((a, b) => a.date.localeCompare(b.date));
  const past = ok.filter((o) => isPast(o, todayYmd)).sort((a, b) => b.date.localeCompare(a.date));
  return { up, past };
}

// ---------- 予定の流れ ----------
/** 時刻の順（時刻なしは最後、同じなら入れた順） */
export function sortSteps(steps) {
  return (steps || []).map((s, i) => [s, i]).sort((a, b) => {
    const ta = isTime(a[0].time) ? a[0].time : '99:99', tb = isTime(b[0].time) ? b[0].time : '99:99';
    return ta.localeCompare(tb) || a[1] - b[1];
  }).map((x) => x[0]);
}
/** 予定の1行を整える（形がおかしければ null） */
export function cleanStep(s) {
  const kind = STEP_KINDS.includes(s?.kind) ? s.kind : 'plan';
  const out = {
    id: clean(s?.id, 24) || newId(), kind,
    time: isTime(s?.time) ? s.time : '',
    text: clean(s?.text, LIMITS.text),
    from: kind === 'plan' ? '' : clean(s?.from, LIMITS.station),
    to: kind === 'plan' ? '' : clean(s?.to, LIMITS.station),
    arr: kind === 'plan' ? '' : (isTime(s?.arr) ? s.arr : ''),
    line: kind === 'plan' ? '' : clean(s?.line, LIMITS.line),
    track: kind === 'train' ? clean(s?.track, LIMITS.track) : '',
  };
  if (!out.text && !out.from && !out.to) return null;
  return out;
}
/** 電車・車の1行の見出し（「電車　A駅 → B駅」） */
export function stepTitle(s) {
  const k = s.kind === 'train' ? '電車' : s.kind === 'car' ? '車・バス' : '';
  const route = s.from || s.to ? `${s.from || '？'} → ${s.to || '？'}` : '';
  if (!k) return s.text;
  return [k, route, route ? '' : s.text].filter(Boolean).join('　');
}
/** 電車・車の1行の詳しいところ（「○○線・3番線　8:21 発 → 8:44 着」） */
export function stepDetail(s) {
  if (s.kind === 'plan') return '';
  const a = [s.line, s.track ? `${s.track}番線` : ''].filter(Boolean).join('・');
  const t = s.time || s.arr ? `${s.time ? s.time + ' 発' : ''}${s.time && s.arr ? ' → ' : ''}${s.arr ? s.arr + ' 着' : ''}` : '';
  return [a, t, (s.from || s.to) ? s.text : ''].filter(Boolean).join('　');
}
/** 子ども用の短い言い方 */
export function stepKids(s) {
  if (s.kind === 'train') return `でんしゃ${s.to ? '（' + s.to + ' まで）' : ''}${s.text && !(s.from || s.to) ? ' ' + s.text : ''}`;
  if (s.kind === 'car') return `くるま・バス${s.to ? '（' + s.to + ' まで）' : ''}`;
  return s.text;
}
/** 地図（Googleマップの検索） */
export const mapUrl = (o) => { const q = clean(o?.address, LIMITS.address) || clean(o?.place, LIMITS.place); return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : ''; };
/** 乗りかえ（Googleマップの電車の道順。時刻は自分で確かめる） */
export const transitUrl = (s) => (s?.from && s?.to ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(s.from)}&destination=${encodeURIComponent(s.to)}&travelmode=transit` : '');

// ---------- 持ち物 ----------
/** 持ち物の1行を整える */
export function cleanItem(x) {
  const text = clean(x?.text, LIMITS.item);
  if (!text) return null;
  return { id: clean(x?.id, 24) || newId(), who: WHO_KEYS.includes(x?.who) ? x.who : 'all', text };
}
/** 定番の持ち物（保険証は入れない） */
export const TEMPLATES = Object.freeze({
  day:   { label: '日帰り', all: ['チケット', 'さいふ', 'スマホの充電器', 'ばんそうこう', 'ウェットティッシュ', 'ごみぶくろ'], kid: ['すいとう', 'ハンカチ', 'ぼうし'] },
  stay:  { label: '泊まり', all: ['チケット・予約の画面', 'さいふ', 'スマホの充電器', 'ばんそうこう', 'いつものお薬', '洗たくものの袋'], kid: ['着がえ', 'パジャマ', 'はブラシ', 'すいとう'] },
  sea:   { label: '海・プール', all: ['日焼け止め', 'レジャーシート', 'ビニール袋'], kid: ['水着', 'タオル', 'サンダル', 'ぼうし'] },
  snow:  { label: '雪',     all: ['カイロ', 'タオル'], kid: ['手ぶくろ', 'ニットぼう', 'くつ下の替え', '着がえ'] },
});
/** 定番を足す（同じ人に同じ名前があれば足さない）。kids：子どもの分を入れる人 */
export function applyTemplate(items, key, kids = KID_KEYS) {
  const t = TEMPLATES[key];
  if (!t) return items || [];
  const out = [...(items || [])];
  const has = (who, text) => out.some((x) => x.who === who && x.text === text);
  for (const text of t.all) if (!has('all', text)) out.push({ id: newId(), who: 'all', text });
  for (const k of kids) for (const text of t.kid) if (!has(k, text)) out.push({ id: newId(), who: k, text });
  return out.slice(0, LIMITS.items);
}
/** チェックの文書ID */
export const checkId = (outingId, itemId) => `${outingId}__${itemId}`;
/** チェックの文書 → { itemId: {done, by} } */
export function checkMap(docs, outingId) {
  const m = {};
  for (const d of docs || []) if (d?.outing === outingId && typeof d.item === 'string') m[d.item] = { done: d.done === true, by: typeof d.by === 'string' ? d.by : '' };
  return m;
}
/** だれの持ち物ごとに分ける：[{who, items:[{...item, done, by}]}]（中身がある人だけ） */
export function groupItems(items, checks, order = WHO_KEYS) {
  return order.map((who) => ({ who, items: (items || []).filter((x) => x.who === who).map((x) => ({ ...x, done: !!checks?.[x.id]?.done, by: checks?.[x.id]?.by || '' })) }))
    .filter((g) => g.items.length);
}
export const doneCount = (groups) => groups.reduce((a, g) => a + g.items.filter((x) => x.done).length, 0);
export const itemCount = (groups) => groups.reduce((a, g) => a + g.items.length, 0);

// ---------- 保存する形 ----------
/** しおり全体を整える（ルールの形どおり。updatedAt は呼ぶ側で入れる） */
export function cleanOuting(o) {
  const date = isYmd(o?.date) ? o.date : '';
  const endDate = isYmd(o?.endDate) && date && o.endDate > date ? o.endDate : '';
  const t = o?.ticket || {}, e = o?.emergency || {};
  return {
    title: clean(o?.title, LIMITS.title),
    date, endDate,
    place: clean(o?.place, LIMITS.place),
    address: clean(o?.address, LIMITS.address),
    theme: o?.theme === 'auto' || THEME_KEYS.includes(o?.theme) ? o.theme : 'auto',
    hasPhoto: o?.hasPhoto === true,
    steps: (o?.steps || []).map(cleanStep).filter(Boolean).slice(0, LIMITS.steps),
    items: (o?.items || []).map(cleanItem).filter(Boolean).slice(0, LIMITS.items),
    ticket: { ref: clean(t.ref, LIMITS.ticket), fee: clean(t.fee, LIMITS.ticket), budget: clean(t.budget, LIMITS.ticket) },
    emergency: { meet: clean(e.meet, LIMITS.emergency), rain: clean(e.rain, LIMITS.emergency), hospital: clean(e.hospital, LIMITS.emergency) },
  };
}
/** 保存できるか（足りないところの文。OK なら ''） */
export function outingProblem(o) {
  if (!clean(o?.title, LIMITS.title)) return 'おでかけの名前を入れてください';
  if (!isYmd(o?.date)) return '日にちを入れてください';
  if (o?.endDate && isYmd(o.endDate) && o.endDate < o.date) return '最後の日は、はじめの日より後にしてください';
  return '';
}

// ---------- 送る（文章） ----------
export function shareText(o, names = {}, checks = {}) {
  const nm = (w) => (w === 'all' ? 'みんな' : names[w] || { husband: '夫', wife: '妻', child1: '子ども1', child2: '子ども2', child3: '子ども3' }[w] || w);
  const L = [`【おでかけのしおり】${o.title}`, `${fmtDayLong(o.date)}${o.endDate ? '〜' + fmtDay(o.endDate) : ''}（${stayLabel(o)}）`];
  if (o.place || o.address) L.push(`行き先：${[o.place, o.address].filter(Boolean).join('　')}`);
  const st = sortSteps(o.steps);
  if (st.length) { L.push('', '■ 予定の流れ'); for (const s of st) { L.push(`${s.time || '　　'}　${stepTitle(s)}`); const d = stepDetail(s); if (d) L.push(`　　　${d}`); } }
  const g = groupItems(o.items, checks);
  if (g.length) { L.push('', '■ 持ち物'); for (const x of g) L.push(`${nm(x.who)}：${x.items.map((i) => (i.done ? '✓' : '□') + i.text).join('、')}`); }
  const t = o.ticket || {};
  if (t.ref || t.fee || t.budget) { L.push('', '■ チケット・お金'); if (t.ref) L.push(`予約番号：${t.ref}`); if (t.fee) L.push(`料金：${t.fee}`); if (t.budget) L.push(`予算：${t.budget}`); }
  const e = o.emergency || {};
  if (e.meet || e.rain || e.hospital) { L.push('', '■ もしものとき'); if (e.meet) L.push(`はぐれたら：${e.meet}`); if (e.rain) L.push(`雨のとき：${e.rain}`); if (e.hospital) L.push(`近くの病院：${e.hospital}`); }
  return L.join('\n');
}
