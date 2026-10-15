// 子どもへの伝言：画面・Firebaseに依存しない判定ロジック
export const CHILD_IDS = Object.freeze(['child1','child2','child3']);
export const PERIODS = Object.freeze(['morning','evening']);
const ymd = d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export function noticeApplies(notice, date, period, childId, paused=false) {
  if (paused || !notice || notice.active !== true) return false;
  if (!CHILD_IDS.includes(childId) || !PERIODS.includes(period) || notice.period !== period) return false;
  if (!Array.isArray(notice.targets) || !notice.targets.includes(childId)) return false;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (notice.repeat === 'once') return notice.onDate === date;
  if (notice.repeat === 'daily') return true;
  // 平日だけ＝月〜金、休日のみ＝土・日（v1 は祝日を判定しない。祝日はお休みモードで止める）
  if (notice.repeat === 'weekdays' || notice.repeat === 'weekends') {
    const [y,m,d]=date.split('-').map(Number);
    const actual=new Date(y,m-1,d);
    if (ymd(actual)!==date) return false;
    const dow=actual.getDay();
    const weekend=dow===0 || dow===6;
    return notice.repeat === 'weekends' ? weekend : !weekend;
  }
  return false;
}
export function noticesFor(notices, date, period, childId, paused=false) {
  return notices.filter(n=>noticeApplies(n,date,period,childId,paused));
}
// チェックは端末にだけ保存。伝言が更新されたらキーが変わり自動的に外れる。
export function completionKey(date, childId, period, notice) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !CHILD_IDS.includes(childId) || !PERIODS.includes(period))
    throw new Error('invalid completion dimensions');
  if (!notice || typeof notice.id!=='string') throw new Error('invalid notice');
  const version=notice.updatedAt?.seconds!==undefined
    ? String(notice.updatedAt.seconds)+'.'+String(notice.updatedAt.nanoseconds||0)
    : String(notice.updatedAt||'');
  return JSON.stringify(['kidsDone',date,childId,period,notice.id,version]);
}
export function isValidNoticeDraft(n) {
  if (!n || typeof n.text!=='string' || !n.text.trim() || n.text.length>120) return false;
  if (!Array.isArray(n.targets) || n.targets.length<1 || n.targets.length>3) return false;
  if (new Set(n.targets).size!==n.targets.length || n.targets.some(t=>!CHILD_IDS.includes(t))) return false;
  if (!PERIODS.includes(n.period) || !['daily','weekdays','weekends','once'].includes(n.repeat)) return false;
  if (typeof n.active!=='boolean') return false;
  if (n.repeat==='once') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.onDate||'')) return false;
    const [y,m,d]=n.onDate.split('-').map(Number);
    return ymd(new Date(y,m-1,d))===n.onDate;
  }
  return n.onDate==='';
}

// ---------- ここから Claude 追加（Phase 2） ----------
const pad2 = (n) => String(n).padStart(2, '0');
export const toYmd = ymd;
const addDaysYmd = (date, n) => { const [y, m, d] = date.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };

/** 朝／夕方：eveningFrom（'HH:MM'、初期値 12:00）より前は朝 */
export const DEFAULT_EVENING_FROM = '12:00';
export function periodAt(now, eveningFrom = DEFAULT_EVENING_FROM) {
  const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(eveningFrom || '') ? eveningFrom : DEFAULT_EVENING_FROM;
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}` < t ? 'morning' : 'evening';
}

/** お休みモード：'' ＝なし ／ 'on' ＝解除するまで ／ 'YYYY-MM-DD' ＝その日だけ（翌日は自動で解除） */
export function isPaused(pause, date) {
  return pause === 'on' || (typeof pause === 'string' && pause === date);
}

/** 「今日だけ」「明日だけ」の日付 */
export function onceDate(kind, now) {
  const today = ymd(now);
  return kind === 'tomorrow' ? addDaysYmd(today, 1) : today;
}

/** 親の画面で選ぶ「繰り返し」 ⇔ 保存する値 */
export function repeatChoice(n, now) {
  if (n.repeat !== 'once') return n.repeat;
  const today = ymd(now);
  return n.onDate === today ? 'today' : n.onDate === addDaysYmd(today, 1) ? 'tomorrow' : 'date';
}
export function draftFromChoice(choice, now) {
  if (choice === 'today' || choice === 'tomorrow') return { repeat: 'once', onDate: onceDate(choice, now) };
  if (choice === 'daily' || choice === 'weekdays' || choice === 'weekends') return { repeat: choice, onDate: '' };
  throw new Error('unknown repeat choice: ' + choice);
}

const REPEAT_ORDER = { once: 0, daily: 1, weekdays: 2, weekends: 2 };
const verNum = (n) => (n.updatedAt?.seconds !== undefined ? n.updatedAt.seconds * 1e3 + (n.updatedAt.nanoseconds || 0) / 1e6 : 0);
/** タブレット・親画面の1画面分：{ child1: [...], child2: [...], child3: [...] }。今日だけの伝言を先に、同じ種類は登録・更新の古い順 */
export function boardFor(notices, date, period, pause = '') {
  const paused = isPaused(pause, date);
  const out = {};
  for (const c of CHILD_IDS) {
    out[c] = noticesFor(notices, date, period, c, paused)
      .sort((a, b) => REPEAT_ORDER[a.repeat] - REPEAT_ORDER[b.repeat] || verNum(a) - verNum(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return out;
}

/** 古い「今日だけ・明日だけ」（keepDays 日より前）＝親の画面を開いたときに掃除してよい伝言 */
export function staleOnceIds(notices, today, keepDays = 7) {
  const limit = addDaysYmd(today, -keepDays);
  return notices.filter((n) => n.repeat === 'once' && typeof n.onDate === 'string' && n.onDate < limit).map((n) => n.id);
}

// ---------- 「できた！」の記録（タブレットの端末内だけ。サーバーには送らない） ----------
// storage は localStorage と同じ形（getItem/setItem/removeItem/key/length）。使えない端末では null を渡す
const DONE_PREFIX = 'kidsDone:';
export function isDone(storage, date, childId, period, notice) {
  try { return !!storage && storage.getItem(DONE_PREFIX + completionKey(date, childId, period, notice)) === '1'; } catch { return false; }
}
export function setDone(storage, date, childId, period, notice, done) {
  const k = DONE_PREFIX + completionKey(date, childId, period, notice);
  try { if (done) storage.setItem(k, '1'); else storage.removeItem(k); return true; } catch { return false; }
}
/** 今日より前の記録を消す（端末の保存領域を増やさない） */
export function pruneDone(storage, today) {
  try {
    const old = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith(DONE_PREFIX)) continue;
      let date = '';
      try { date = JSON.parse(k.slice(DONE_PREFIX.length))[1]; } catch { date = ''; }
      if (!(typeof date === 'string' && date >= today)) old.push(k);
    }
    old.forEach((k) => storage.removeItem(k));
    return old.length;
  } catch { return 0; }
}
