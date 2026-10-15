// 予定の表示ロジック（今日／明日／週末／週間・重なり・ホームのプレビュー）
// 画面に依存しない純粋な関数だけを置き、テストで仕様を固定する。

const pad = (n) => String(n).padStart(2, '0');
export const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// 家族のメンバー（保存する値 → 画面の表示名と色）。並び順もこの順
// husband/wife は以前からの値（データは書き換えない）。旧データの 'me'（私）は husband として扱う
// 表示名（実名）は公開リポジトリに書かず、Firebase の家族設定（familySettings）から setMemberLabels で入れる
export const DEFAULT_LABELS = Object.freeze({ husband: '夫', wife: '妻', child1: '子ども1', child2: '子ども2', child3: '子ども3', family: '家族' });
export const MEMBERS = [
  { key: 'husband', label: DEFAULT_LABELS.husband, fg: '#24497C', bg: '#E1EAF6', bar: '#2F5E9E' },
  { key: 'wife', label: DEFAULT_LABELS.wife, fg: '#8F3A10', bg: '#FBE7DA', bar: '#D0692F' },
  { key: 'child1', label: DEFAULT_LABELS.child1, fg: '#5B3A8C', bg: '#ECE4F7', bar: '#7B57B5' },
  { key: 'child2', label: DEFAULT_LABELS.child2, fg: '#0F5E66', bg: '#DDF0F1', bar: '#1F8A94' },
  { key: 'child3', label: DEFAULT_LABELS.child3, fg: '#9A2F5A', bg: '#F9E1EB', bar: '#C94F80' },
  { key: 'family', label: DEFAULT_LABELS.family, fg: '#1F5C45', bg: '#E3EEE7', bar: '#2E7D5B' },
];
export const WHO = Object.fromEntries(MEMBERS.map((m) => [m.key, m.label]));
/** 家族設定の表示名を反映（空・不正な値は既定の呼び名に戻す）。「家族」は変えない */
export function setMemberLabels(names = {}) {
  for (const m of MEMBERS) {
    if (m.key === 'family') continue;
    const v = typeof names[m.key] === 'string' ? names[m.key].normalize('NFKC').trim().slice(0, 12) : '';
    m.label = v || DEFAULT_LABELS[m.key];
    WHO[m.key] = m.label;
  }
  return { ...WHO };
}
const WHO_KEYS = MEMBERS.map((m) => m.key);
export const normWho = (w) => (w === 'me' ? 'husband' : WHO_KEYS.includes(w) ? w : 'family');
const WHO_ORDER = Object.fromEntries(WHO_KEYS.map((k, i) => [k, i]));

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

/** 1日の並び順：出発時刻 → 未定は最後 → 同時刻は 夫・妻・子ども1〜3・家族 → 予定名 */
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

// ---------- 予定を送る（1か月分・画像／文章） ----------
const DOW_JA = '日月火水木金土';
const WHO_JA = WHO;

/** その月の初日と末日（'YYYY-MM-DD'） */
export function monthRange(y, m) {
  return { start: toYmd(new Date(y, m - 1, 1)), end: toYmd(new Date(y, m, 0)) };
}
const isWeekend = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return w === 0 || w === 6; };

/**
 * 送る予定を日ごとにまとめる
 * @param who 'all' または MEMBERS の key（旧データの me は husband）
 * @param weekendOnly true なら土日だけ。土日は予定がなくても「予定なし」として並べる
 * @returns [{date, label:'10/17（土）', events:[...]}]
 */
export function shareDays(events, y, m, opt = {}) {
  const { start, end } = monthRange(y, m);
  return shareDaysRange(events, start, end, opt);
}

/**
 * 期間（start〜end）の予定を日ごとにまとめる。1週間分を送るときにも使う
 * @param fillAll true なら予定のない日も「予定なし」として並べる（1週間分の表示用）
 */
export function shareDaysRange(events, start, end, { who = 'all', weekendOnly = false, fillAll = false } = {}) {
  const picked = events.filter((e) => e.date >= start && e.date <= end && (who === 'all' || normWho(e.who) === who) && (!weekendOnly || isWeekend(e.date)));
  const dates = new Set(picked.map((e) => e.date));
  if (weekendOnly || fillAll) {
    const [y, m, d0] = start.split('-').map(Number);
    for (let d = new Date(y, m - 1, d0); toYmd(d) <= end; d = addDays(d, 1)) if (!weekendOnly || d.getDay() === 0 || d.getDay() === 6) dates.add(toYmd(d));
  }
  return [...dates].sort().map((date) => {
    const [, mm, dd] = date.split('-').map(Number);
    const [yy] = date.split('-').map(Number);
    return { date, label: `${mm}/${dd}（${DOW_JA[new Date(yy, mm - 1, dd).getDay()]}）`, events: sortDay(picked.filter((e) => e.date === date)) };
  });
}

/** 見出し：「10月の予定（夫の予定・週末だけ）」 */
export function shareTitle(y, m, { who = 'all', weekendOnly = false } = {}) {
  const tags = [who === 'all' ? '' : WHO_JA[who] + 'の予定', weekendOnly ? '週末だけ' : ''].filter(Boolean);
  return `${y}年${m}月の予定` + (tags.length ? `（${tags.join('・')}）` : '');
}

/** 1週間分の見出し：「10/12〜10/18の予定（子ども1の予定・週末だけ）」 */
export function shareWeekTitle(start, end, { who = 'all', weekendOnly = false } = {}) {
  const md = (ymd) => { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; };
  const tags = [who === 'all' ? '' : WHO_JA[who] + 'の予定', weekendOnly ? '週末だけ' : ''].filter(Boolean);
  return `${md(start)}〜${md(end)}の予定` + (tags.length ? `（${tags.join('・')}）` : '');
}

const t = (s) => (s ? s.replace(/^0(\d)/, '$1') : '');
/** 1件の時刻表示：「6:30→15:00」「6:30〜」「〜17:00」「時間未定」 */
export function timeText(e) {
  if (e.departure && e.returnTime) return `${t(e.departure)}→${t(e.returnTime)}`;
  if (e.departure) return `${t(e.departure)}〜`;
  if (e.returnTime) return `〜${t(e.returnTime)}`;
  return '時間未定';
}

/** LINEなどに貼る文章 */
export function shareText(days, title) {
  const lines = [`【${title}】`];
  if (!days.length) lines.push('予定はありません');
  for (const d of days) {
    lines.push('', d.label);
    if (!d.events.length) lines.push('・予定なし');
    for (const e of d.events) lines.push(`・${WHO_JA[normWho(e.who)]}｜${e.name}　${timeText(e)}`);
  }
  return lines.join('\n');
}
