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
