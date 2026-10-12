// かんたん予定入力：文章から予定の項目を取り出す（外部API不使用・端末内だけで動く）
// 例）「11.3野球大会6:00から17:00」→ { date:'2026-11-03', name:'野球大会', departure:'06:00', returnTime:'17:00' }
//
// 方針：読み取れない項目は勝手に決めない（空のまま missing に入れる）。
//       あいまいな点は needsConfirm / warnings に入れて、確認画面でユーザーに選んでもらう。

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const hm = (h, m) => `${pad(h)}:${pad(m)}`;

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

// 文字列 s の [start, end) を空白に置き換える（位置を保つ）
const blank = (s, start, end) => s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);

const WHO_WORDS = [
  ['husband', ['夫', 'パパ', 'お父さん', '旦那', '主人']],
  ['wife', ['妻', 'ママ', 'お母さん', '嫁', '奥さん']],
  ['family', ['家族', 'みんな', '全員', '家族全員']],
];
const DELIM = '\\s、,。・|｜/:：';

/**
 * @param {string} text 入力された文章
 * @param {Date} [now] 「今日」の基準（テスト用に差し替え可能）
 */
export function parseQuickSchedule(text, now = new Date()) {
  const result = {
    date: '', name: '', who: '', departure: '', returnTime: '',
    missing: [], needsConfirm: [], warnings: [],
  };
  let s = String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s) {
    result.missing.push('date', 'name', 'who', 'departure', 'returnTime');
    return result;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ---------- 1. 日付 ----------
  let dateFound = null; // {y,m,d,explicitYear,relative}
  const rel = [
    [/(明後日|あさって)/, 2],
    [/(今日|きょう|本日)/, 0],
    [/(明日|あした)/, 1],
  ];
  const datePatterns = [
    // 2026/11/3, 2026.11.3, 2026-11-3, 2026年11月3日
    { re: /(\d{4})\s*[\/.\-年]\s*(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})\s*日?/, map: (m) => [+m[1], +m[2], +m[3], true] },
    // 11月3日
    { re: /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/, map: (m) => [null, +m[1], +m[2], false] },
    // 11/3, 11.3（時刻の 6:00 や 10時 とは区別）
    { re: /(?<![\d:])(\d{1,2})\s*[\/.]\s*(\d{1,2})(?![\d:]|\s*時)/, map: (m) => [null, +m[1], +m[2], false] },
  ];
  for (const { re, map } of datePatterns) {
    const m = s.match(re);
    if (!m) continue;
    const [y0, mo, d, explicitYear] = map(m);
    const y = y0 ?? today.getFullYear();
    s = blank(s, m.index, m.index + m[0].length);
    if (validDate(y, mo, d)) dateFound = { y, m: mo, d, explicitYear };
    else result.warnings.push({ type: 'invalid-date', text: m[0].trim() });
    // 日付の直後の曜日表記「(月)」「（月曜）」は読み飛ばす
    const after = s.slice(m.index + m[0].length).match(/^\s*\(?[月火水木金土日](曜日?)?\)?/);
    if (after && /[()]|曜/.test(after[0])) s = blank(s, m.index + m[0].length, m.index + m[0].length + after[0].length);
    break;
  }
  if (!dateFound && !result.warnings.length) {
    for (const [re, days] of rel) {
      const m = s.match(re);
      if (!m) continue;
      const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
      dateFound = { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), explicitYear: true, relative: true };
      s = blank(s, m.index, m.index + m[0].length);
      break;
    }
  }
  if (dateFound) {
    result.date = ymd(dateFound.y, dateFound.m, dateFound.d);
    const dt = new Date(dateFound.y, dateFound.m - 1, dateFound.d);
    if (dt < today) {
      // 年を省略して過去になった場合：来年の候補を出して確認してもらう（勝手に変えない）
      const next = validDate(dateFound.y + 1, dateFound.m, dateFound.d) ? ymd(dateFound.y + 1, dateFound.m, dateFound.d) : '';
      result.needsConfirm.push({ type: 'past-date', date: result.date, nextYearDate: dateFound.explicitYear ? '' : next });
    }
  } else {
    result.missing.push('date');
  }

  // ---------- 2. 時刻 ----------
  // 6:00 / 6時 / 6時30分 / 10時半 / 午後3時 / PM3:00
  const timeRe = /(午前|午後|AM|PM|am|pm)?\s*(\d{1,2})\s*(?::\s*(\d{2})|時\s*(?:(\d{1,2})\s*分|(半))?)/g;
  const times = [];
  for (const m of s.matchAll(timeRe)) {
    let h = +m[2];
    const min = m[3] != null ? +m[3] : m[4] != null ? +m[4] : m[5] ? 30 : 0;
    const ap = (m[1] || '').toLowerCase();
    if ((ap === '午後' || ap === 'pm') && h < 12) h += 12;
    if ((ap === '午前' || ap === 'am') && h === 12) h = 0;
    times.push({ index: m.index, end: m.index + m[0].length, raw: m[0].trim(), h, min });
  }
  const valid = (t) => t.h >= 0 && t.h <= 23 && t.min >= 0 && t.min <= 59;
  const take = (t) => (valid(t) ? hm(t.h, t.min) : (result.warnings.push({ type: 'invalid-time', text: t.raw }), ''));

  if (times.length >= 2) {
    result.departure = take(times[0]);
    result.returnTime = take(times[1]);
    if (times.length > 2) result.warnings.push({ type: 'extra-times', text: times.slice(2).map((t) => t.raw).join(' ') });
  } else if (times.length === 1) {
    const t = times[0];
    const before = s.slice(0, t.index);
    const after = s.slice(t.end);
    const isReturn = /^\s*(まで|帰宅|帰り|戻り)/.test(after) || /(帰宅|帰り|戻り)\s*$/.test(before);
    if (isReturn) result.returnTime = take(t);
    else result.departure = take(t);
  }
  // 時刻と、その前後の「から」「まで」「〜」「出発」「帰宅」などを取り除く
  for (const t of [...times].reverse()) s = blank(s, t.index, t.end);
  s = s
    .replace(/(出発|帰宅予定|帰宅|帰り|戻り)\s*(時間|時刻)?\s*[:：]?/g, ' ')
    .replace(/(から|まで|以降|ごろ|頃)/g, ' ')
    .replace(/[~〜\-–—−]+/g, ' ');

  if (!result.departure) result.missing.push('departure');
  if (!result.returnTime) result.missing.push('returnTime');
  if (result.departure && result.returnTime && result.returnTime < result.departure) {
    result.warnings.push({ type: 'return-before-departure' });
  }

  // ---------- 3. 誰の予定（区切られた単語のときだけ読む：「夫の実家」などは読まない） ----------
  const whoHits = new Set();
  for (const [who, words] of WHO_WORDS) {
    for (const w of words.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|[${DELIM}])${w}(?=$|[${DELIM}])`, 'g');
      if (re.test(s)) {
        whoHits.add(who);
        s = s.replace(re, '$1 ');
      }
    }
  }
  if (whoHits.size === 1) result.who = [...whoHits][0];
  else {
    if (whoHits.size > 1) result.warnings.push({ type: 'multiple-who' });
    result.missing.push('who');
  }

  // ---------- 4. 予定内容（残った文字） ----------
  let name = s.replace(/\s+/g, ' ').trim()
    .replace(/^[\s、,。・|｜/:：]+|[\s、,。・|｜/:：]+$/g, '')
    .replace(/^(に|は|で|の)\s+/, '')
    .trim();
  if (name.length > 80) {
    result.warnings.push({ type: 'name-too-long' });
    name = name.slice(0, 80);
  }
  result.name = name;
  if (!name) result.missing.push('name');

  return result;
}

// 保存に必要な項目がそろっているか（確認画面の「保存」ボタンの有効・無効に使う）
export function readyToSave(r) {
  return !!(r.date && r.name && ['husband', 'wife', 'family'].includes(r.who));
}
