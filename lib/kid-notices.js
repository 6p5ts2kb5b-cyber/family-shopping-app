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
  if (notice.repeat === 'weekdays') {
    const [y,m,d]=date.split('-').map(Number);
    const actual=new Date(y,m-1,d);
    if (ymd(actual)!==date) return false;
    const dow=actual.getDay();
    return dow>=1 && dow<=5;
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
  if (!PERIODS.includes(n.period) || !['daily','weekdays','once'].includes(n.repeat)) return false;
  if (typeof n.active!=='boolean') return false;
  if (n.repeat==='once') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.onDate||'')) return false;
    const [y,m,d]=n.onDate.split('-').map(Number);
    return ymd(new Date(y,m-1,d))===n.onDate;
  }
  return n.onDate==='';
}
