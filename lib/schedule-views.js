// 予定の表示ロジック（今日／明日／週末／週間・重なり・ホームのプレビュー）
// 画面に依存しない純粋な関数だけを置き、テストで仕様を固定する。

const pad = (n) => String(n).padStart(2, '0');
export const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// 旧データの 'me'（私）は夫として扱う
export const normWho = (w) => (w === 'me' ? 'husband' : ['husband', 'wife', 'family'].includes(w) ? w : 'family');
const WHO_ORDER = { husband: 0, wife: 1, family: 2 };

/** 週末（土・日）。offset 0=今週末、1=来週末。土日当日は「その週末」を今週末とする */
export function weekendOf(now, offset = 0) {
  const today = startOfDay(now);
  const dow = today.getDay(); // 0=日 … 6=土
  const sat = dow === 6 ? today : dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow);
  const s = addDays(sat, 7 * offset);
  return { sat: toYmd(s), sun: toYmd(addDays(s, 1)) };
}

/** 週間（月曜〜日曜の7日）。offset 0=今週 */
export function weekOf(now, offset = 0) {
  const today = startOfDay(now);
  const mon = addDays(today, -((today.getDay() + 6) % 7) + 7 * offset);
  return Array.from({ length: 7 }, (_, i) => toYmd(addDays(mon, i)));
}

/** 1日の並び順：出発時刻 → 未定は最後 → 同時刻は 夫・妻・家族 → 予定名 */
export function sortDay(events) {
  return [...events].sort((a, b) =>
    (a.departure || '99:99').localeCompare(b.departure || '99:99')
    || WHO_ORDER[normWho(a.who)] - WHO_ORDER[normWho(b.who)]
    || String(a.name).localeCompare(String(b.name), 'ja'));
}

/**
 * 同じ人の予定で時間が重なるものを返す（別の人どうしの重なりは普通なので出さない）。
 * 出発・帰宅の両方が入っている予定だけを判定する（未定を推測で埋めない）。
 * 結果は「注意表示」に使うだけで、保存は止めない。
 * @returns {Map<id, otherName>}
 */
export function findOverlaps(events) {
  const out = new Map();
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const span = (e) => {
    if (!e.departure || !e.returnTime) return null;
    const start = toMin(e.departure);
    let end = toMin(e.returnTime);
    if (end <= start) end += 24 * 60; // 夜勤など日をまたぐ
    return [start, end];
  };
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (a.date !== b.date || normWho(a.who) !== normWho(b.who)) continue;
      const sa = span(a), sb = span(b);
      if (!sa || !sb) continue;
      if (sa[0] < sb[1] && sb[0] < sa[1]) {
        if (!out.has(a.id)) out.set(a.id, b.name);
        if (!out.has(b.id)) out.set(b.id, a.name);
      }
    }
  }
  return out;
}

/** 1日の表示：最大 limit 件、残りは「すべて見る（ほかN件）」。expanded=true なら全件 */
export function clampDay(events, limit = 4, expanded = false) {
  const sorted = sortDay(events);
  if (expanded) return { shown: sorted, more: 0 };
  return { shown: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}

/**
 * ホームに出す「週末」欄。mode は家族タブの設定「週末の予定を表示」（端末ごとに保存）
 *  'auto'（初期値）：月〜水 出さない ／ 木・金 今週末 ／ 土 明日（日） ／ 日 出さない
 *  'always'        ：月〜金 今週末 ／ 土 明日（日） ／ 日 来週末
 *  'off'           ：出さない
 */
export function homeWeekendPreview(now, events, mode = 'auto', limit = 2) {
  if (mode === 'off') return null;
  const today = startOfDay(now);
  const dow = today.getDay();
  let title, days;
  if (dow === 6) {
    title = '明日';
    days = [toYmd(addDays(today, 1))];
  } else if (dow === 0) {
    if (mode !== 'always') return null;
    const w = weekendOf(now, 1);
    title = '来週末';
    days = [w.sat, w.sun];
  } else {
    if (mode !== 'always' && dow !== 4 && dow !== 5) return null;
    const w = weekendOf(now, 0);
    title = '今週末';
    days = [w.sat, w.sun];
  }
  const list = days.flatMap((d) => sortDay(events.filter((e) => e.date === d)));
  return { title, days, shown: list.slice(0, limit), more: Math.max(0, list.length - limit), empty: list.length === 0 };
}

/**
 * 表示に必要な日付の範囲（この範囲だけをFirestoreから読む）。
 * 過去の週・前月の週末も offset をマイナスにすれば読める。
 *  view: 'today' | 'tomorrow' | 'weekend' | 'week' | 'home'
 */
export function rangeFor(view, now, offset = 0) {
  const today = startOfDay(now);
  switch (view) {
    case 'today': { const d = toYmd(addDays(today, offset)); return { start: d, end: d }; }
    case 'tomorrow': { const d = toYmd(addDays(today, 1 + offset)); return { start: d, end: d }; }
    case 'weekend': { const w = weekendOf(now, offset); return { start: w.sat, end: w.sun }; }
    case 'week': { const w = weekOf(now, offset); return { start: w[0], end: w[6] }; }
    case 'home': return { start: toYmd(today), end: weekendOf(now, 1).sun }; // 今日〜来週末（どの設定でも足りる）
    default: throw new Error('unknown view: ' + view);
  }
}

/** 予定タブを開いたときの最初の表示：前回選んだものを優先、なければ「今日」 */
export function initialView(saved) {
  return ['today', 'tomorrow', 'weekend', 'week'].includes(saved) ? saved : 'today';
}
