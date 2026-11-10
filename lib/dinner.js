// 夕飯の献立（親のアプリ・子ども用タブレット共通）。画面に依存しない関数だけ。
// Firestore：dinnerMenus/{YYYY-MM-DD} = { date, dish }（未定の日は文書なし）
//            dinnerDishes/{id}        = { name, order }（作れるメニュー一覧。家族だけが読める）

export const DISH_MAX = 40;
const pad = (n) => String(n).padStart(2, '0');
const parse = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** ymd から n 日ぶん（ymd を含む） */
export function daysFrom(ymd, n = 7) {
  const base = parse(ymd);
  return Array.from({ length: n }, (_, i) => ymdOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
}
export function addDaysYmd(ymd, k) { const b = parse(ymd); return ymdOf(new Date(b.getFullYear(), b.getMonth(), b.getDate() + k)); }

/** メニュー名を整える（前後の空白・連続空白、40文字まで）。空なら '' */
export function cleanDish(s) {
  return String(s ?? '').replace(/[\s　]+/g, ' ').trim().slice(0, DISH_MAX);
}
/** 同じメニューかどうかを比べるための形（全角/半角・大文字小文字・空白をそろえる） */
export const dishKey = (s) => cleanDish(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/** 献立の文書の配列 → { 'YYYY-MM-DD': 'カレー' }（形がおかしいものは捨てる） */
export function menuMap(docs) {
  const out = {};
  for (const d of docs || []) { const dish = cleanDish(d?.dish); if (isYmd(d?.date) && dish) out[d.date] = dish; }
  return out;
}
/** 1週間の表（未定もふくむ）：[{ date, dish|'' }] */
export function weekMenu(map, startYmd, n = 7) {
  return daysFrom(startYmd, n).map((date) => ({ date, dish: map[date] || '' }));
}
/** メニュー一覧の並び：order → 名前 */
export function sortDishes(list) {
  return [...(list || [])].filter((x) => cleanDish(x?.name)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'ja'));
}
/** 一覧に同じメニューがあるか */
export const hasDish = (list, name) => (list || []).some((x) => dishKey(x.name) === dishKey(name));
/** 次に足すメニューの order */
export const nextOrder = (list) => Math.min(9999, Math.max(-1, ...(list || []).map((x) => (Number.isInteger(x.order) ? x.order : 0))) + 1);
/** 献立の保存データ（ルールの形どおり） */
export const menuRecord = (date, dish) => ({ date, dish: cleanDish(dish) });
