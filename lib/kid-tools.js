// 子ども用タブレットの「タイマー」と「とうひょう」（タブレットの中だけで使う。Firebaseには送らない）
// 画面に依存しない関数だけを置き、テストで仕様を固定する。

export const KIDS = Object.freeze(['child1', 'child2', 'child3']);
export const VOTERS = Object.freeze(['father', 'mother', 'child1', 'child2', 'child3']);
export const TIMER_MIN = 1, TIMER_MAX = 60, TIMER_DEFAULT = 10;

const pad = (n) => String(n).padStart(2, '0');
const dayNumber = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };

// ---------- 順番（日が変わるとずれる） ----------
/** その日の順番。毎日1人ずつ先頭がずれる（例：1日目 1→2→3、2日目 2→3→1、3日目 3→1→2） */
export function rotationOrder(ymd, ids = KIDS) {
  const k = ((dayNumber(ymd) % ids.length) + ids.length) % ids.length;
  return [...ids.slice(k), ...ids.slice(0, k)];
}
/** 順番の次の人（今日まだ終わっていない人）。全員終わったら null */
export function nextInOrder(order, doneIds) {
  return order.find((id) => !doneIds.includes(id)) ?? null;
}

// ---------- タイマー ----------
/** 分の設定を 1〜60 に収める（壊れた値は10分） */
export function clampMinutes(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return TIMER_DEFAULT;
  return Math.min(TIMER_MAX, Math.max(TIMER_MIN, n));
}
/** タイマーの状態：{ kid, totalMs, endsAt(動いている間), leftMs(止めている間) } */
export function startTimer(kid, minutes, now) {
  const totalMs = clampMinutes(minutes) * 60000;
  return { kid, totalMs, endsAt: now + totalMs, leftMs: totalMs };
}
export function pauseTimer(t, now) {
  if (!t || t.endsAt == null) return t;
  return { ...t, endsAt: null, leftMs: Math.max(0, t.endsAt - now) };
}
export function resumeTimer(t, now) {
  if (!t || t.endsAt != null) return t;
  return { ...t, endsAt: now + t.leftMs };
}
/** 残り時間（ミリ秒）。時計で計算するので、画面が消えていても正しい */
export function remainingMs(t, now) {
  if (!t) return 0;
  return Math.max(0, t.endsAt != null ? t.endsAt - now : t.leftMs);
}
export const isRunning = (t) => !!t && t.endsAt != null;
export const isFinished = (t, now) => !!t && remainingMs(t, now) === 0;
/** 「9:05」の形。残り1秒未満は 0:00 */
export function formatClock(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// ---------- とうひょう ----------
export const MAX_CHOICES = 6;
/** 質問と選択肢（空欄は捨てる、同じものは1つに、2〜6個）。だめなら null */
export function createPoll(question, choices) {
  const q = String(question ?? '').trim().slice(0, 40);
  const seen = new Set();
  const list = [];
  for (const c of choices || []) {
    const v = String(c ?? '').trim().slice(0, 20);
    if (v && !seen.has(v)) { seen.add(v); list.push(v); }
  }
  if (!q || list.length < 2 || list.length > MAX_CHOICES) return null;
  return { question: q, choices: list, votes: {} };
}
/** 投票（1人1票。もう一度押すと取り消し、別の選択肢を押すと変更） */
export function castVote(poll, voter, index) {
  if (!poll || !VOTERS.includes(voter) || !(index >= 0 && index < poll.choices.length)) return poll;
  const votes = { ...poll.votes };
  if (votes[voter] === index) delete votes[voter]; else votes[voter] = index;
  return { ...poll, votes };
}
/** 選択肢ごとの票数と、だれが入れたか */
export function tally(poll) {
  const rows = poll.choices.map((label, i) => ({ index: i, label, count: 0, voters: [] }));
  for (const v of VOTERS) {
    const i = poll.votes[v];
    if (i != null && rows[i]) { rows[i].count++; rows[i].voters.push(v); }
  }
  return rows;
}
/** いちばん票が多い選択肢（同点なら全部）。だれも入れていなければ空 */
export function winners(poll) {
  const rows = tally(poll), top = Math.max(0, ...rows.map((r) => r.count));
  return top === 0 ? [] : rows.filter((r) => r.count === top).map((r) => r.index);
}
/** ランダムに1つ選ぶ（rand は 0以上1未満を返す関数） */
export function pickRandom(list, rand = Math.random) {
  if (!list || !list.length) return null;
  const i = Math.min(list.length - 1, Math.floor(rand() * list.length));
  return list[i];
}

// ---------- 数え方・アナログ表示・準備時間 ----------
export const PREP_MIN = 2; // 次の人がテレビを選ぶための準備時間（分）
/** たった時間（ミリ秒）。カウントアップ表示に使う */
export function elapsedMs(t, now) {
  if (!t) return 0;
  return Math.min(t.totalMs, t.totalMs - remainingMs(t, now));
}
/** 表示する時間：'down'＝のこり、'up'＝たった時間 */
export function shownMs(t, now, mode = 'down') {
  return mode === 'up' ? elapsedMs(t, now) : remainingMs(t, now);
}
/** 準備時間のタイマー（prep: true）。終わったらその子のタイマーを始める */
export function startPrep(kid, now, minutes = PREP_MIN) {
  return { ...startTimer(kid, minutes, now), prep: true };
}
/** アナログ表示の扇形（0〜1）。'down' は残りの割合、'up' はたった割合 */
export function dialFraction(t, now, mode = 'down') {
  if (!t || !t.totalMs) return mode === 'up' ? 0 : 1;
  const f = remainingMs(t, now) / t.totalMs;
  return mode === 'up' ? 1 - f : f;
}
/** 時計の文字盤の扇形（中心 c、半径 r、12時から時計回りに fraction 分）を SVG の path にする */
export function wedgePath(fraction, c = 100, r = 90) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return '';
  if (f >= 0.9999) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`;
  const a = f * 2 * Math.PI, x = c + r * Math.sin(a), y = c - r * Math.cos(a);
  return `M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

// ---------- 朝の「しゅっぱつ まで あと なんぷん」（タブレットの中だけ） ----------
export const DEPART_DEFAULT = Object.freeze({ on: true, time: '07:30', weekdaysOnly: true, showNow: true });
export const DEPART_MIN = '05:00', DEPART_MAX = '10:00', DEPART_STEP = 5;
export const DEPART_SOON_MIN = 5;   // のこり5ふんで「もうすぐ」
export const DEPART_AFTER_MIN = 15; // しゅっぱつ時刻から15ふんは「しゅっぱつ じかん！」を出す
const hmToMin = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const minToHm = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
/** 保存された設定を正しい形にする（壊れていたら初期値）。times は子どもごとの しゅっぱつ時刻 */
export function normDepart(v) {
  const o = v && typeof v === 'object' ? v : {};
  const fix = (hm, fb) => {
    let t = hmToMin(hm);
    if (!Number.isFinite(t)) t = hmToMin(fb);
    return minToHm(Math.min(hmToMin(DEPART_MAX), Math.max(hmToMin(DEPART_MIN), t)));
  };
  const time = fix(o.time, DEPART_DEFAULT.time);                 // 以前の「みんな同じ時刻」の設定も引きつぐ
  const src = o.times && typeof o.times === 'object' ? o.times : {};
  const times = Object.fromEntries(KIDS.map((k) => [k, fix(src[k], time)]));
  return { on: o.on !== false, time, times, weekdaysOnly: o.weekdaysOnly !== false, showNow: o.showNow !== false };
}
/** 同じ時刻の子どもを まとめる（早い順）：[{ time, kids:[...] }] */
export function departGroups(cfg) {
  const c = normDepart(cfg), map = new Map();
  for (const k of KIDS) { const t = c.times[k]; if (!map.has(t)) map.set(t, []); map.get(t).push(k); }
  return [...map.entries()].sort((a, b) => hmToMin(a[0]) - hmToMin(b[0])).map(([time, kids]) => ({ time, kids }));
}
/** 時刻を5ふんずつ動かす（5:00〜10:00） */
export function shiftDepart(hm, steps) {
  const t = hmToMin(normDepart({ time: hm }).time) + steps * DEPART_STEP;
  return minToHm(Math.min(hmToMin(DEPART_MAX), Math.max(hmToMin(DEPART_MIN), t)));
}
/** 「7:30」の形（先頭の0なし） */
export const departLabel = (hm) => { const t = hmToMin(normDepart({ time: hm }).time); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
/**
 * いまの状態（子どもごとの時刻をまとめて）：
 *  groups：[{ time, kids, at, leftMs, phase }]（phase：'count'｜'soon'｜'go'）
 *  target：いま大きく出す グループ（まだ しゅっぱつしていない いちばん早い時刻。全員すぎたら最後）
 *  show：設定がオン・（へいじつだけなら）月〜金・最後の しゅっぱつ15ふん後まで（朝かどうかは呼び出し側）
 */
export function departPlan(date, cfg) {
  const c = normDepart(cfg), d = new Date(date), nowMs = d.getTime();
  const groups = departGroups(c).map((g) => {
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, hmToMin(g.time), 0, 0).getTime();
    const left = at - nowMs;
    return { ...g, at, leftMs: Math.max(0, left), phase: left <= 0 ? 'go' : left <= DEPART_SOON_MIN * 60000 ? 'soon' : 'count' };
  });
  let target = groups.findIndex((g) => g.phase !== 'go');
  if (target < 0) target = groups.length - 1;
  const day = d.getDay(), last = groups[groups.length - 1];
  const show = c.on && !(c.weekdaysOnly && (day === 0 || day === 6)) && nowMs - last.at < DEPART_AFTER_MIN * 60000;
  return { show, groups, target };
}
/** いちばん近い しゅっぱつ の状態（show・leftMs・phase・at） */
export function departState(date, cfg) {
  const p = departPlan(date, cfg), g = p.groups[p.target];
  return { show: p.show, leftMs: g.leftMs, phase: g.phase, at: g.at };
}
/** 「あと 25ふん」「あと 1じかん 10ぷん」（1ふん未満は「あと すこし」） */
export function departText(leftMs) {
  const m = Math.ceil(leftMs / 60000);
  if (leftMs <= 0) return 'しゅっぱつ じかん！';
  if (leftMs < 60000) return 'あと すこし！';
  const fun = (n) => (/[13468]$|0$/.test(String(n)) ? `${n}ぷん` : `${n}ふん`);
  if (m < 60) return `あと ${fun(m)}`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `あと ${h}じかん ${fun(r)}` : `あと ${h}じかん`;
}
/** 時計の針の角度（12時が0度、時計回り） */
export function clockAngles(date) {
  const d = new Date(date), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60;
  return { hour: ((d.getHours() % 12) + m / 60) * 30, minute: m * 6, second: s * 6 };
}
/** 文字盤の扇形：12時からの割合 from から to まで（時計回り）。いまの時計で「しゅっぱつまで」に色をぬる */
export function sectorPath(from, to, c = 100, r = 90) {
  const span = Math.max(0, Math.min(1, to - from));
  if (span <= 0) return '';
  if (span >= 0.9999) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`;
  const pt = (f) => { const a = f * 2 * Math.PI; return [(c + r * Math.sin(a)).toFixed(2), (c - r * Math.cos(a)).toFixed(2)]; };
  const [x0, y0] = pt(from), [x1, y1] = pt(from + span);
  return `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x1} ${y1} Z`;
}
/**
 * タイムタイマー型の扇形：12時から「反時計まわり」に fraction ぶん（のこり時間）。
 * 文字盤は 0 が上、5・10・15… が左まわりにならぶ。
 */
export function wedgePathCCW(fraction, c = 100, r = 90) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return '';
  if (f >= 0.9999) return `M ${c} ${c - r} A ${r} ${r} 0 1 0 ${c + 0.01} ${c - r} Z`;
  const a = f * 2 * Math.PI, x = c - r * Math.sin(a), y = c - r * Math.cos(a);
  return `M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 0 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}
