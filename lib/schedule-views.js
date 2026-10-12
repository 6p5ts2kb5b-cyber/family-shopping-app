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
 * 帰宅未定は出発から1時間とみなす。出発未定の予定は判定しない。
 * @returns {Map<id, otherName>}
 */
export function findOverlaps(events) {
  const out = new Map();
  const span = (e) => {
    if (!e.departure) return null;
    const [h, m] = e.departure.split(':').map(Number);
    const start = h * 60 + m;
    let end = start + 60;
    if (e.returnTime) {
      const [h2, m2] = e.returnTime.split(':').map(Number);
      end = h2 * 60 + m2;
      if (end <= start) end += 24 * 60; // 夜勤など日をまたぐ
    }
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

/** 1日の表示：最大 limit 件、残りは「ほかN件」 */
export function clampDay(events, limit = 4) {
  const sorted = sortDay(events);
  return { shown: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}

/**
 * ホームに出す「週末」欄
 *  月〜水：出さない ／ 木・金：今週末（土日）を最大2件 ／ 土：明日（日）を最大2件 ／ 日：出さない
 */
export function homeWeekendPreview(now, events, limit = 2) {
  const dow = startOfDay(now).getDay();
  let title, days;
  if (dow === 4 || dow === 5) {
    const w = weekendOf(now, 0);
    title = '今週末';
    days = [w.sat, w.sun];
  } else if (dow === 6) {
    title = '明日';
    days = [toYmd(addDays(startOfDay(now), 1))];
  } else {
    return null;
  }
  const list = days.flatMap((d) => sortDay(events.filter((e) => e.date === d)));
  return { title, days, shown: list.slice(0, limit), more: Math.max(0, list.length - limit), empty: list.length === 0 };
}

/** 予定タブを開いたときの最初の表示：前回選んだものを優先、なければ「今日」 */
export function initialView(saved) {
  return ['today', 'tomorrow', 'weekend', 'week'].includes(saved) ? saved : 'today';
}
