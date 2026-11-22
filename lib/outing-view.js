// おでかけのしおり：親のアプリ（app.html）の画面。
// 今日の画面のカード（一覧）・しおりを見る画面・作る／直す画面・印刷・送る。
// Firestore の関数は app.html から受け取る（同じ接続を使う）。
import { THEMES, THEME_KEYS, TEMPLATES, WHO_KEYS, KID_KEYS, LIMITS, PHOTO_MAX, themeOf, countdown, splitOutings, fmtDay, fmtDayLong, stayLabel,
  sortSteps, cleanStep, stepTitle, stepDetail, mapUrl, transitUrl, cleanItem, applyTemplate, checkId, checkMap, groupItems, doneCount, itemCount,
  cleanOuting, outingProblem, shareText, newId, isTime, hm } from './outing.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEF_NAMES = { all: 'みんな', husband: '夫', wife: '妻', child1: '子ども1', child2: '子ども2', child3: '子ども3' };
const KID_COLOR = { child1: '#5B3A8C', child2: '#0F5E66', child3: '#9A2F5A' };

/** 表紙の模様（行き先ごと）。右上に置く 400×230 の絵。文字列は固定（利用者の文字は入らない） */
export function motifSvg(theme) {
  const t = THEMES[theme] || THEMES.plain, c = t.motif;
  const paw = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="10" rx="15" ry="18"/><circle cx="-20" cy="-16" r="7"/><circle cx="-5" cy="-25" r="7"/><circle cx="12" cy="-23" r="7"/><circle cx="24" cy="-8" r="7"/></g>`;
  const fish = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 q 30 -24 60 0 q -30 24 -60 0 z M60 0 l 18 -14 v 28 z"/></g>`;
  const art = {
    zoo: paw(300, 70, 1.25) + paw(190, 50, 0.7) + paw(360, 165, 0.75),
    sea: `<g fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round">${[50, 95].map((y) => `<path d="M160 ${y} q 30 -20 60 0 t 60 0 t 60 0 t 60 0"/>`).join('')}</g>` + fish(250, 150, 1) + fish(330, 190, 0.6),
    nature: `<path d="M150 230 L260 50 L370 230 Z"/><path d="M260 230 L345 95 L430 230 Z"/><path d="M232 96 L260 50 L288 96 Z" fill="#FFFFFF" opacity=".55"/>`,
    park: `<g fill="none" stroke="${c}" stroke-width="6"><circle cx="300" cy="100" r="72"/>${[0, 30, 60, 90, 120, 150].map((a) => { const r = Math.PI * a / 180; return `<line x1="${(300 - 72 * Math.cos(r)).toFixed(1)}" y1="${(100 - 72 * Math.sin(r)).toFixed(1)}" x2="${(300 + 72 * Math.cos(r)).toFixed(1)}" y2="${(100 + 72 * Math.sin(r)).toFixed(1)}"/>`; }).join('')}</g>`
      + [[190, 60], [215, 40]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="16" ry="20"/><path d="M${x} ${y + 20} q -6 18 4 36" fill="none" stroke="${c}" stroke-width="3"/>`).join(''),
    plain: [[310, 70, 46], [210, 50, 22], [370, 170, 24]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join(''),
  }[theme] || '';
  return `<svg class="omotif" viewBox="0 0 400 230" preserveAspectRatio="xMaxYMin meet" aria-hidden="true"><g fill="${c}">${art}</g></svg>`;
}

/** 写真を小さく縮めて JPEG の data URL にする（長い辺 1000px から、上限に収まるまで小さく） */
export async function compressPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let side = 1000;
    for (let round = 0; round < 6; round++) {
      const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      for (const q of [0.78, 0.65, 0.52]) { const d = cv.toDataURL('image/jpeg', q); if (d.length <= PHOTO_MAX) return d; }
      side = Math.round(side * 0.75);
    }
    throw new Error('too-big');
  } finally { URL.revokeObjectURL(url); }
}

const CSS = `
#outingCard .olist{display:grid;gap:8px}
#outingCard .orow{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;border:1px solid var(--line2);border-radius:14px;background:var(--card);padding:8px 12px;font:inherit;text-align:left;color:var(--ink)}
#outingCard .orow .sw{flex:none;width:12px;align-self:stretch;border-radius:6px}
#outingCard .orow .t{flex:1;min-width:0;display:grid}
#outingCard .orow .t b{font-size:16px;overflow-wrap:anywhere}
#outingCard .orow .t small{font-size:13px;color:var(--muted)}
#outingCard .orow .cd{flex:none;font-size:13px;font-weight:700;border-radius:999px;padding:3px 10px}
#outingCard .ofoot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.opage{position:fixed;inset:0;z-index:35;background:#F7F3EA;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.opage .owrap{max-width:760px;margin:0 auto;padding:0 0 max(32px,env(safe-area-inset-bottom))}
.ocover{position:relative;min-height:236px;color:#fff;padding:max(14px,env(safe-area-inset-top)) 18px 34px;display:flex;flex-direction:column;overflow:hidden;background:var(--obg);background-size:cover;background-position:center}
.ocover.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.05) 40%,rgba(0,0,0,.55))}
.ocover>*{position:relative;z-index:1}
.ocover .omotif{position:absolute;right:0;top:0;width:min(62%,420px);height:auto;z-index:0;opacity:.85}
.ocover .otop{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ocover .oback{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:rgba(255,255,255,.22);color:#fff;font:inherit;font-size:15px;font-weight:700}
.ocover .otag{font-size:12px;font-weight:700;background:rgba(0,0,0,.22);border-radius:999px;padding:4px 10px}
.ocover .oeyebrow{margin:auto 0 0;padding-top:28px;font-size:14px;font-weight:700}
.ocover h1{margin:2px 0 0;font-size:32px;line-height:1.25;font-weight:900;overflow-wrap:anywhere;text-wrap:balance}
.ocover .odate{margin:6px 0 0;font-size:16px;font-weight:700;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.ocover .ocd{background:#fff;color:var(--oink);border-radius:8px;padding:2px 10px}
.ocover::before{content:"";position:absolute;left:0;right:0;bottom:-1px;height:26px;background:#F7F3EA;border-radius:26px 26px 0 0;z-index:1}
.obody{padding:0 16px;display:grid;gap:12px;margin-top:-4px;position:relative;z-index:2}
.oacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.oacts button{min-height:50px;border-radius:14px;border:1px solid var(--line2);background:var(--card);color:var(--green);font:inherit;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:6px}
.oacts button.oprim{background:var(--green);border-color:var(--green);color:#fff}
.osec{background:var(--card);border-radius:20px;padding:16px;display:grid;gap:8px;min-width:0}
.osec h2{margin:0;font-size:13px;font-weight:700;color:var(--muted);letter-spacing:.08em}
.osec .big{margin:0;font-size:20px;font-weight:900;overflow-wrap:anywhere}
.osec p{margin:0;overflow-wrap:anywhere}
.omap{justify-self:start;min-height:44px;padding:0 14px;border-radius:12px;background:var(--green-soft);color:var(--green);font-size:14px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.otl{list-style:none;margin:0;padding:0}
.otl li{display:grid;grid-template-columns:52px 16px minmax(0,1fr);gap:8px}
.otl .tm{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;padding-top:1px}
.otl .rail{display:flex;flex-direction:column;align-items:center}
.otl .rail i{width:12px;height:12px;border-radius:50%;background:var(--green);margin-top:5px;flex:none}
.otl li.train .rail i,.otl li.car .rail i{border-radius:3px;background:#2F6FB0}
.otl .rail s{flex:1;width:2px;background:var(--line2);text-decoration:none}
.otl li:last-child .rail s{display:none}
.otl .tx{padding-bottom:12px;font-size:16px;overflow-wrap:anywhere;min-width:0}
.otl .tr{background:#EEF4FB;border-radius:14px;padding:10px 12px;display:grid;gap:2px;margin-bottom:10px}
.otl .tr b{color:#1D4E82}
.otl .tr span{font-size:14px;color:#2C3E50}
.otl .tr a{justify-self:start;min-height:40px;display:inline-flex;align-items:center;font-size:14px;font-weight:700;color:#1D4E82}
.ogrp{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.ogrp h3{grid-column:1/-1}
.ogrp h3{margin:6px 0 0;font-size:15px;display:flex;justify-content:space-between;gap:8px}
.ogrp h3 small{color:var(--muted);font-weight:700}
.ochk{min-height:48px;display:flex;align-items:center;gap:10px;padding:0 12px;border-radius:14px;border:1px solid var(--line2);background:var(--card);cursor:pointer}
.ochk input{width:22px;height:22px;accent-color:var(--green);flex:none}
.ochk span{flex:1;min-width:0;font-size:16px;overflow-wrap:anywhere}
.ochk small{flex:none;font-size:12px;color:var(--muted)}
.ochk.on{background:#F2F7F3;border-color:#F2F7F3}
.ochk.on span{text-decoration:line-through;color:var(--muted)}
.okv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;font-size:15px}
.okv dt{color:var(--muted)}.okv dd{margin:0;font-weight:700;overflow-wrap:anywhere}
.osec.warn{background:#FFF4D6}.osec.warn h2{color:#6E4B00}
.oempty{margin:0;color:var(--muted);font-size:14px}
/* 作る・直す */
.oedit .ebar{position:sticky;top:0;z-index:3;background:#F7F3EA;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:max(10px,env(safe-area-inset-top)) 16px 10px}
.oedit .ebar h1{margin:0;font-size:22px;font-weight:900}
.oedit .ebar button{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:#ECE7DA;font:inherit;font-size:15px;font-weight:700;color:var(--ink)}
.oedit .ebody{padding:0 16px;display:grid;gap:12px}
.ofld{display:grid;gap:4px;font-size:13px;font-weight:700;color:var(--muted);min-width:0}
.ofld input,.ofld select{height:48px;border:1.5px solid #DCD4C2;border-radius:12px;padding:0 12px;font:inherit;font-size:16px;font-weight:400;color:var(--ink);background:#fff;min-width:0;width:100%;box-sizing:border-box}
.ogrid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.ogrid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.othemes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.othemes button{min-height:52px;border-radius:12px;border:1px solid #DCD4C2;font:inherit;font-size:14px;font-weight:700;padding:0 4px}
.othemes button[aria-pressed=true]{border:3px solid currentColor;font-weight:900}
.ophoto{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ophoto img{width:96px;height:64px;object-fit:cover;border-radius:10px}
.ophoto label,.ophoto button{min-height:44px;padding:0 14px;border-radius:12px;border:2px dashed #9DB4A6;background:#fff;color:var(--green);font:inherit;font-size:14px;font-weight:800;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.ophoto button{border-style:solid;border-width:1px;border-color:var(--line2);color:#9A1F18}
.oseg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.oseg button{min-height:44px;border-radius:12px;border:1px solid #C9D7E8;background:#fff;font:inherit;font-size:14px;font-weight:700;color:var(--ink)}
.oseg button[aria-pressed=true]{border:2px solid #2F6FB0;background:#D9E8F7;color:#1D4E82;font-weight:900}
.ostepform{background:#EEF4FB;border-radius:16px;padding:12px;display:grid;gap:8px}
.ostepform .ofld input{border-color:#C9D7E8}
.oroute{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);gap:6px;align-items:end}
.oroute>span{text-align:center;padding-bottom:13px;font-weight:900}
.otimes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 76px;gap:6px}
.oprimary{min-height:50px;border:0;border-radius:14px;background:var(--green);color:#fff;font:inherit;font-size:16px;font-weight:900}
.oblue{min-height:48px;border:0;border-radius:14px;background:#2F6FB0;color:#fff;font:inherit;font-size:15px;font-weight:900}
.osub{min-height:44px;border-radius:12px;border:1px solid var(--line2);background:#fff;color:var(--green);font:inherit;font-size:14px;font-weight:800;padding:0 12px}
.oline{display:flex;align-items:center;gap:6px;min-height:48px;border-bottom:1px dashed var(--line2)}
.oline .w{flex:none;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;min-width:46px}
.oline .x{flex:1;min-width:0;font-size:15px;overflow-wrap:anywhere}
.oline .x small{display:block;color:var(--muted);font-size:12px}
.oline button{flex:none;min-width:44px;min-height:44px;border:0;background:none;font:inherit;font-weight:800;color:var(--green)}
.oline button.del{color:#9A1F18;font-size:20px}
.owho{display:flex;flex-wrap:wrap;gap:6px}
.owho button{min-height:44px;padding:0 12px;border-radius:12px;border:1px solid #DCD4C2;background:#fff;font:inherit;font-size:14px;font-weight:700;color:var(--ink)}
.owho button[aria-pressed=true]{border:2px solid var(--green);background:var(--green-soft);color:var(--green);font-weight:900}
.oaddrow{display:flex;gap:8px}.oaddrow input{flex:1;min-width:0;height:48px;border:1.5px solid #DCD4C2;border-radius:12px;padding:0 12px;font:inherit;font-size:16px}
.oaddrow button{flex:none;min-height:48px;padding:0 16px;border:0;border-radius:12px;background:var(--green);color:#fff;font:inherit;font-size:15px;font-weight:900}
.otpl{display:flex;flex-wrap:wrap;gap:6px}
.osave{position:sticky;bottom:0;z-index:3;background:linear-gradient(180deg,rgba(247,243,234,0),#F7F3EA 30%);padding:18px 16px max(14px,env(safe-area-inset-bottom));display:grid;gap:8px}
.odel{min-height:48px;border:0;background:none;color:#9A1F18;font:inherit;font-size:15px;font-weight:800}
.omsg{margin:0;color:#9A1F18;font-size:14px;font-weight:700;min-height:1em}
@media (min-width:760px){.obody{padding:0 24px}.oedit .ebody{padding:0 24px}.ocover{min-height:260px;padding-left:28px;padding-right:28px}.ocover h1{font-size:40px}}
/* 印刷（A4 1枚） */
#outingPrintRoot{display:none}
@media print{
  @page{size:A4;margin:10mm}
  body.oprinting>*:not(#outingPrintRoot){display:none!important}
  body.oprinting{background:#fff!important}
  body.oprinting #outingPrintRoot{display:block!important}
}
.oprint{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;color:#1F2A24;-webkit-print-color-adjust:exact;print-color-adjust:exact;width:190mm;margin:0 auto}
.oprint .pcover{position:relative;height:58mm;border-radius:5mm;overflow:hidden;color:#fff;padding:6mm 8mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;background:var(--obg);background-size:cover;background-position:center}
.oprint .pcover.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.6))}
.oprint .pcover>*{position:relative;z-index:1}.oprint .pcover .omotif{position:absolute;right:0;top:0;width:55%;height:auto;z-index:0}
.oprint .pcover p{margin:0;font-size:11pt;font-weight:700}.oprint .pcover h1{margin:1mm 0;font-size:24pt;line-height:1.2}
.oprint .pcols{display:grid;grid-template-columns:1.15fr 1fr;gap:7mm;margin-top:6mm}
.oprint h2{margin:0 0 2mm;font-size:12pt;border-bottom:2px solid var(--obg);padding-bottom:1mm}
.oprint section{margin-bottom:5mm;break-inside:avoid}
.oprint table{border-collapse:collapse;width:100%;font-size:10pt;line-height:1.45}
.oprint th{text-align:left;vertical-align:top;width:13mm;padding:1mm 0;font-variant-numeric:tabular-nums}
.oprint td{padding:1mm 0;overflow-wrap:anywhere}
.oprint p,.oprint li{font-size:10pt;line-height:1.6;margin:0;overflow-wrap:anywhere}
.oprint ul{list-style:none;margin:0 0 2mm;padding:0}
.oprint .pwho{font-weight:800;font-size:10pt;margin-top:1.5mm}
.oprint .pfoot{font-size:8pt;color:#6B6A5E;text-align:right;margin-top:2mm}
`;

/**
 * Firestore を使う保存先（GitHub版）。GAS版は同じ形の保存先を Outing.html で作る。
 * store.subscribe(unsubs, {list, checks, error}) / watchPhoto(id, cb) → unsub / save({id, data, photo}) / remove(id, checkItems) / setCheck(outing, item, done, by)
 */
export function firestoreStore(db, fs, write) {
  const { collection, doc, onSnapshot, setDoc, writeBatch, serverTimestamp } = fs;
  return {
    subscribe(unsubs, on) {
      unsubs.push(onSnapshot(collection(db, 'outings'), (snap) => on.list(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), on.error));
      unsubs.push(onSnapshot(collection(db, 'outingChecks'), (snap) => on.checks(snap.docs.map((d) => d.data())), on.error));
    },
    watchPhoto(id, cb) { return onSnapshot(doc(db, 'outingPhotos', id), (snap) => cb(snap.exists() ? String(snap.data().data || '') : ''), (e) => console.warn('photo', e?.code)); },
    /** photo：undefined＝そのまま、''＝外す、data URL＝のせる */
    save({ id, data, photo }) {
      const b = writeBatch(db);
      b.set(doc(db, 'outings', id), { ...data, updatedAt: serverTimestamp() });
      if (photo !== undefined) { if (photo) b.set(doc(db, 'outingPhotos', id), { data: photo, updatedAt: serverTimestamp() }); else b.delete(doc(db, 'outingPhotos', id)); }
      return write(() => b.commit());
    },
    remove(id, checkItems) {
      const b = writeBatch(db);
      b.delete(doc(db, 'outings', id)); b.delete(doc(db, 'outingPhotos', id));
      for (const item of checkItems) b.delete(doc(db, 'outingChecks', checkId(id, item)));
      return write(() => b.commit());
    },
    setCheck(outing, item, done, by) { return write(() => setDoc(doc(db, 'outingChecks', checkId(outing, item)), { outing, item, done, by, at: serverTimestamp() })); },
  };
}

export function installOutings(ctx) {
  const { store, toast, mount, names: getNames, user, today } = ctx;
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  const page = Object.assign(document.createElement('div'), { id: 'outingPage', className: 'opage', hidden: true });
  page.setAttribute('role', 'dialog'); page.setAttribute('aria-modal', 'true'); page.setAttribute('aria-label', 'おでかけのしおり');
  const printRoot = Object.assign(document.createElement('div'), { id: 'outingPrintRoot' });
  document.body.append(page, printRoot);

  const S = { list: [], checks: [], rulesOk: true, loaded: false, openId: '', mode: '', draft: null, photo: { id: '', data: '' }, photoUnsub: null, stepKind: 'plan', stepEdit: '', itemWho: 'all', showPast: false };
  const nm = (w) => (w === 'all' ? 'みんな' : getNames()[w] || DEF_NAMES[w] || w);
  const byLabel = (by) => (KID_KEYS.includes(by) ? nm(by) : by.startsWith('p:') ? by.slice(2) : '');
  const findO = (id) => S.list.find((o) => o.id === id);
  const denied = (e) => { console.warn('outings', e?.code); if (e?.code === 'permission-denied') { S.rulesOk = false; drawCard(); } };

  // ---------- 読み込み ----------
  function subscribe(unsubs) {
    S.rulesOk = true;
    store.subscribe(unsubs, {
      list: (l) => { S.list = l; S.loaded = true; S.rulesOk = true; drawCard(); if (S.mode === 'view') drawView(); },
      checks: (c) => { S.checks = c; if (S.mode === 'view') drawView(); },
      error: denied,
    });
    unsubs.push(() => { S.list = []; S.checks = []; S.loaded = false; stopPhoto(); close(); });
  }
  function stopPhoto() { S.photoUnsub?.(); S.photoUnsub = null; S.photo = { id: '', data: '' }; }
  function watchPhoto(id) {
    if (S.photo.id === id && S.photoUnsub) return;
    stopPhoto(); S.photo.id = id;
    S.photoUnsub = store.watchPhoto(id, (data) => { S.photo.data = data; if (S.mode === 'view') drawView(); });
  }

  // ---------- 今日の画面のカード ----------
  function drawCard() {
    if (!mount) return;
    const head = '<div class="head" style="padding:0"><h2 id="hOuting" style="font-size:16px">おでかけのしおり</h2><button type="button" class="link" data-o="new">＋ 作る</button></div>';
    if (!S.rulesOk) { mount.innerHTML = head + '<p class="alert">しおりを使うには、Firebaseのルールの更新が必要です（設定ページの手順で1回だけ）。</p>'; return; }
    const { up, past } = splitOutings(S.list, today());
    const row = (o) => {
      const t = THEMES[themeOf(o)];
      return `<button type="button" class="orow" data-o="open" data-id="${esc(o.id)}"><span class="sw" style="background:${t.bg}"></span><span class="t"><b>${esc(o.title)}</b><small>${esc(fmtDay(o.date))}${o.endDate ? '〜' + esc(fmtDay(o.endDate)) : ''}・${esc(o.place || stayLabel(o))}</small></span><span class="cd" style="background:${t.soft};color:${t.ink}">${esc(countdown(o, today()))}</span></button>`;
    };
    mount.innerHTML = head + (up.length ? `<div class="olist">${up.map(row).join('')}</div>` : `<p class="oempty">${S.loaded ? 'これからのおでかけはありません。「＋ 作る」で行き先・電車・持ち物をまとめられます。' : '読み込み中…'}</p>`)
      + (past.length ? `<div class="ofoot"><button type="button" class="link" data-o="past" aria-expanded="${S.showPast}">終わったしおり（${past.length}）${S.showPast ? 'をとじる' : ''}</button></div>` + (S.showPast ? `<div class="olist">${past.map(row).join('')}</div>` : '') : '');
  }
  mount?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-o]'); if (!b) return;
    const a = b.dataset.o;
    if (a === 'new') openEdit(null);
    else if (a === 'open') openView(b.dataset.id);
    else if (a === 'past') { S.showPast = !S.showPast; drawCard(); }
  });

  // ---------- しおりを見る ----------
  function show(mode) { S.mode = mode; page.hidden = false; document.documentElement.style.overflow = 'hidden'; }
  function close() { S.mode = ''; S.openId = ''; page.hidden = true; page.innerHTML = ''; document.documentElement.style.overflow = ''; }
  function openView(id) { if (!findO(id)) return; S.openId = id; if (findO(id).hasPhoto) watchPhoto(id); else stopPhoto(); show('view'); drawView(); page.scrollTop = 0; }

  function coverHtml(o, kidsWords = false) {
    const th = themeOf(o), t = THEMES[th], photo = o.hasPhoto && S.photo.id === o.id && S.photo.data;
    const vars = `--obg:${t.bg};--oink:${t.ink};`, bg = photo ? `background-image:url('${photo.replace(/'/g, '')}')` : '';
    return { th, t, photo, style: vars + bg, vars, bg };
  }
  function drawView() {
    const o = findO(S.openId);
    if (!o) { close(); return; }
    const { th, t, photo, style } = coverHtml(o);
    const checks = checkMap(S.checks, o.id), groups = groupItems(o.items, checks);
    const steps = sortSteps(o.steps || []);
    const stepHtml = steps.map((s) => {
      if (s.kind === 'plan') return `<li class="plan"><span class="tm">${esc(hm(s.time))}</span><span class="rail"><i></i><s></s></span><span class="tx">${esc(s.text)}</span></li>`;
      const tu = s.kind === 'train' ? transitUrl(s) : '';
      return `<li class="${s.kind}"><span class="tm">${esc(hm(s.time))}</span><span class="rail"><i></i><s></s></span><div class="tr"><b>${esc(stepTitle(s))}</b>${stepDetail(s) ? `<span>${esc(stepDetail(s))}</span>` : ''}${tu ? `<a href="${esc(tu)}" target="_blank" rel="noopener">乗りかえを地図で確かめる ›</a>` : ''}</div></li>`;
    }).join('');
    const tk = o.ticket || {}, em = o.emergency || {};
    const mu = mapUrl(o);
    page.innerHTML = `<div class="owrap">
      <header class="ocover${photo ? ' photo' : ''}" style="${style}">${photo ? '' : motifSvg(th)}
        <div class="otop"><button type="button" class="oback" data-v="close">‹ もどる</button><span class="otag">${photo ? '表紙：写真' : '表紙：' + esc(t.label)}</span></div>
        <p class="oeyebrow">おでかけのしおり</p><h1>${esc(o.title)}</h1>
        <p class="odate"><span>${esc(fmtDay(o.date))}${o.endDate ? '〜' + esc(fmtDay(o.endDate)) : ''} ・ ${esc(stayLabel(o))}</span><span class="ocd">${esc(countdown(o, today()))}</span></p>
      </header>
      <div class="obody">
        <div class="oacts"><button type="button" class="oprim" data-v="edit">直す</button><button type="button" data-v="print">印刷</button><button type="button" data-v="share">送る</button></div>
        ${o.place || o.address ? `<section class="osec"><h2>行き先</h2>${o.place ? `<p class="big">${esc(o.place)}</p>` : ''}${o.address ? `<p>${esc(o.address)}</p>` : ''}${mu ? `<a class="omap" href="${esc(mu)}" target="_blank" rel="noopener">地図で開く ›</a>` : ''}</section>` : ''}
        <section class="osec"><h2>予定の流れ</h2>${steps.length ? `<ol class="otl">${stepHtml}</ol>` : '<p class="oempty">まだありません。「直す」から電車の時間などを入れられます。</p>'}</section>
        <section class="osec"><h2>持ち物 <span style="float:right;letter-spacing:0;color:var(--green)">${doneCount(groups)} / ${itemCount(groups)} 用意できた</span></h2>
          ${groups.length ? groups.map((g) => `<div class="ogrp"><h3><span style="color:${KID_COLOR[g.who] || 'inherit'}">${esc(nm(g.who))}</span><small>${g.items.filter((x) => x.done).length} / ${g.items.length}</small></h3>${g.items.map((x) => `<label class="ochk${x.done ? ' on' : ''}"><input type="checkbox" data-chk="${esc(x.id)}"${x.done ? ' checked' : ''}><span>${esc(x.text)}</span>${x.done && byLabel(x.by) ? `<small>${esc(byLabel(x.by))} ✓</small>` : ''}</label>`).join('')}</div>`).join('') : '<p class="oempty">まだありません。「直す」から定番の持ち物を入れられます。</p>'}
          <p class="oempty" style="font-size:12px">チェックは、ログインしている家族みんなに同じように見えます。子ども用タブレットからもチェックできます。</p></section>
        ${tk.ref || tk.fee || tk.budget ? `<section class="osec"><h2>チケット・お金</h2><dl class="okv">${tk.ref ? `<dt>予約番号</dt><dd>${esc(tk.ref)}</dd>` : ''}${tk.fee ? `<dt>料金</dt><dd>${esc(tk.fee)}</dd>` : ''}${tk.budget ? `<dt>予算</dt><dd>${esc(tk.budget)}</dd>` : ''}</dl></section>` : ''}
        ${em.meet || em.rain || em.hospital ? `<section class="osec warn"><h2>もしものとき</h2><dl class="okv">${em.meet ? `<dt>はぐれたら</dt><dd>${esc(em.meet)}</dd>` : ''}${em.rain ? `<dt>雨のとき</dt><dd>${esc(em.rain)}</dd>` : ''}${em.hospital ? `<dt>近くの病院</dt><dd>${esc(em.hospital)}</dd>` : ''}</dl></section>` : ''}
      </div></div>`;
  }
  page.addEventListener('change', (ev) => {
    const c = ev.target.closest('[data-chk]');
    if (c && S.mode === 'view') {
      const o = findO(S.openId); if (!o) return;
      const by = 'p:' + String(user() || '').split('@')[0].slice(0, 30);
      store.setCheck(o.id, c.dataset.chk, c.checked, by);
      S.checks = [...S.checks.filter((x) => !(x.outing === o.id && x.item === c.dataset.chk)), { outing: o.id, item: c.dataset.chk, done: c.checked, by }];
      c.closest('.ochk')?.classList.toggle('on', c.checked);
    }
  });

  // ---------- 印刷 ----------
  function printOutingHtml(o) {
    const { th, photo, vars, bg } = coverHtml(o);
    const checks = checkMap(S.checks, o.id), groups = groupItems(o.items, checks);
    const tk = o.ticket || {}, em = o.emergency || {};
    const steps = sortSteps(o.steps || []);
    return `<div class="oprint" style="${vars}">
      <header class="pcover${photo ? ' photo' : ''}" style="${bg}">${photo ? '' : motifSvg(th)}<p>おでかけのしおり</p><h1>${esc(o.title)}</h1><p>${esc(fmtDayLong(o.date))}${o.endDate ? '〜' + esc(fmtDay(o.endDate)) : ''}　${esc(stayLabel(o))}　${esc(o.place)}</p></header>
      <div class="pcols"><div>
        <section><h2>予定の流れ</h2>${steps.length ? `<table><tbody>${steps.map((s) => `<tr><th scope="row">${esc(hm(s.time))}</th><td>${s.kind === 'plan' ? esc(s.text) : `<b>${esc(stepTitle(s))}</b>${stepDetail(s) ? '<br>' + esc(stepDetail(s)) : ''}`}</td></tr>`).join('')}</tbody></table>` : '<p>（まだありません）</p>'}</section>
        ${o.place || o.address ? `<section><h2>行き先</h2><p>${esc(o.place)}${o.address ? '<br>' + esc(o.address) : ''}</p></section>` : ''}
        ${tk.ref || tk.fee || tk.budget ? `<section><h2>チケット・お金</h2><p>${tk.ref ? '予約番号：' + esc(tk.ref) + '<br>' : ''}${tk.fee ? '料金：' + esc(tk.fee) + '<br>' : ''}${tk.budget ? '予算：' + esc(tk.budget) : ''}</p></section>` : ''}
        ${em.meet || em.rain || em.hospital ? `<section><h2>もしものとき</h2><p>${em.meet ? 'はぐれたら：' + esc(em.meet) + '<br>' : ''}${em.rain ? '雨のとき：' + esc(em.rain) + '<br>' : ''}${em.hospital ? '近くの病院：' + esc(em.hospital) : ''}</p></section>` : ''}
      </div><div>
        <section><h2>持ち物チェック</h2>${groups.length ? groups.map((g) => `<p class="pwho" style="color:${KID_COLOR[g.who] || 'inherit'}">${esc(nm(g.who))}</p><ul>${g.items.map((x) => `<li>${x.done ? '☑' : '□'} ${esc(x.text)}</li>`).join('')}</ul>`).join('') : '<p>（まだありません）</p>'}</section>
      </div></div>
      <p class="pfoot">わが家のメモ ・ おでかけのしおり</p></div>`;
  }
  function doPrint(o) {
    printRoot.innerHTML = printOutingHtml(o);
    document.body.classList.add('oprinting');
    const done = () => { document.body.classList.remove('oprinting'); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); toast('印刷できませんでした。パソコンやスマホのブラウザで開いて試してください'); }
    setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500);
  }
  async function doShare(o) {
    const text = shareText(o, getNames(), checkMap(S.checks, o.id));
    try { if (navigator.share) { await navigator.share({ title: o.title, text }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('しおりの文章をコピーしました。LINEに貼り付けて送れます'); }
    catch { toast('コピーできませんでした'); }
  }

  // ---------- 作る・直す ----------
  function openEdit(id) {
    const o = id ? findO(id) : null;
    const base = o ? structuredClone({ ...o }) : { title: '', date: '', endDate: '', place: '', address: '', theme: 'auto', hasPhoto: false, steps: [], items: [], ticket: {}, emergency: {} };
    S.draft = { ...cleanOuting(base), id: o?.id || '', photoData: o?.hasPhoto && S.photo.id === o.id ? S.photo.data : '', photoChanged: false };
    if (o?.hasPhoto && S.photo.id !== o.id) watchPhoto(o.id);
    S.stepKind = 'plan'; S.stepEdit = ''; S.itemWho = 'all';
    S.openId = o?.id || '';
    show('edit'); drawEdit(); page.scrollTop = 0;
  }
  const D = () => S.draft;
  function themeBtns() {
    const cur = D().theme, autoKey = themeOf({ ...D(), theme: 'auto' });
    const btn = (k, label, t) => `<button type="button" data-v="theme" data-k="${k}" aria-pressed="${cur === k}" style="background:${t.soft};color:${t.ink}">${label}</button>`;
    return btn('auto', `自動（${THEMES[autoKey].label}）`, THEMES[autoKey]) + THEME_KEYS.map((k) => btn(k, THEMES[k].label, THEMES[k])).join('');
  }
  function drawEdit() {
    const d = D(), tk = d.ticket, em = d.emergency;
    const steps = sortSteps(d.steps);
    const editing = d.steps.find((s) => s.id === S.stepEdit);
    const k = editing ? editing.kind : S.stepKind;
    const sv = (f) => esc(editing ? editing[f] : '');
    const groups = groupItems(d.items, {});
    const photo = d.photoData || (d.hasPhoto && S.photo.id === d.id ? S.photo.data : '');
    page.innerHTML = `<div class="owrap oedit">
      <div class="ebar"><h1>${d.id ? 'しおりを直す' : 'しおりを作る'}</h1><button type="button" data-v="${d.id ? 'back' : 'close'}">やめる</button></div>
      <div class="ebody">
        <section class="osec"><h2>基本</h2>
          <label class="ofld">おでかけの名前<input id="oTitle" maxlength="${LIMITS.title}" value="${esc(d.title)}" placeholder="例：動物園の日" autocomplete="off"></label>
          <div class="ogrid2"><label class="ofld">日にち<input id="oDate" type="date" value="${esc(d.date)}"></label><label class="ofld">最後の日（泊まりのとき）<input id="oEnd" type="date" value="${esc(d.endDate)}"></label></div>
          <label class="ofld">行き先<input id="oPlace" maxlength="${LIMITS.place}" value="${esc(d.place)}" placeholder="例：○○動物園" autocomplete="off"></label>
          <label class="ofld">住所（地図で開くときに使います・なくてもOK）<input id="oAddr" maxlength="${LIMITS.address}" value="${esc(d.address)}" autocomplete="off"></label>
        </section>
        <section class="osec"><h2>表紙</h2>
          <div class="othemes" role="group" aria-label="表紙の見た目">${themeBtns()}</div>
          <div class="ophoto">${photo ? `<img src="${esc(photo)}" alt="表紙の写真">` : ''}<label>写真をのせる<input type="file" id="oPhoto" accept="image/*" hidden></label>${photo ? '<button type="button" data-v="nophoto">写真を外す</button>' : ''}</div>
          <p class="oempty" style="font-size:12px">写真は小さく縮めて保存します。写真をのせると、表紙は写真になります。</p>
        </section>
        <section class="osec"><h2>予定の流れ</h2>
          ${steps.length ? steps.map((s) => `<div class="oline"><span class="w">${esc(hm(s.time))}</span><span class="x">${esc(stepTitle(s))}${stepDetail(s) ? `<small>${esc(stepDetail(s))}</small>` : ''}</span><button type="button" data-v="stepedit" data-id="${esc(s.id)}">直す</button><button type="button" class="del" data-v="stepdel" data-id="${esc(s.id)}" aria-label="${esc(stepTitle(s))}を消す">×</button></div>`).join('') : '<p class="oempty">まだありません。下から足してください。</p>'}
          <div class="ostepform" id="oStepForm">
            <div class="oseg" role="group" aria-label="足すもの">${[['plan', '予定'], ['train', '電車'], ['car', '車・バス']].map(([v, l]) => `<button type="button" data-v="kind" data-k="${v}" aria-pressed="${k === v}">${l}</button>`).join('')}</div>
            ${k === 'plan' ? `<div class="ogrid2" style="grid-template-columns:110px minmax(0,1fr)"><label class="ofld">時刻<input id="sTime" type="time" value="${sv('time')}"></label><label class="ofld">やること<input id="sText" maxlength="${LIMITS.text}" value="${sv('text')}" placeholder="例：おべんとう（広場）"></label></div>`
              : `<div class="oroute"><label class="ofld">${k === 'train' ? '乗る駅' : '出るところ'}<input id="sFrom" maxlength="${LIMITS.station}" value="${sv('from')}" placeholder="${k === 'train' ? '例：○○駅' : '例：家'}"></label><span aria-hidden="true">→</span><label class="ofld">${k === 'train' ? '降りる駅' : '着くところ'}<input id="sTo" maxlength="${LIMITS.station}" value="${sv('to')}" placeholder="${k === 'train' ? '例：△△駅' : '例：駐車場'}"></label></div>
                 <div class="otimes" ${k === 'car' ? 'style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"' : ''}><label class="ofld">${k === 'train' ? '発' : '出発'}<input id="sTime" type="time" value="${sv('time')}"></label><label class="ofld">着<input id="sArr" type="time" value="${sv('arr')}"></label>${k === 'train' ? `<label class="ofld">番線<input id="sTrack" maxlength="${LIMITS.track}" value="${sv('track')}" inputmode="numeric"></label>` : ''}</div>
                 <label class="ofld">${k === 'train' ? '何線・どこ行き' : 'バスの系統など（なくてもOK）'}<input id="sLine" maxlength="${LIMITS.line}" value="${sv('line')}" placeholder="${k === 'train' ? '例：○○線 ○○行き' : ''}"></label>
                 <label class="ofld">ひとこと（なくてもOK）<input id="sText" maxlength="${LIMITS.text}" value="${sv('text')}" placeholder="例：乗りかえ"></label>
                 ${k === 'train' ? '<p class="oempty" style="font-size:12px">時刻は乗換案内アプリで調べて入れてください（自動で調べる機能は無料では使えないため）。</p>' : ''}`}
            <div class="ogrid2"><button type="button" class="oblue" data-v="stepadd">${editing ? 'この行を直す' : '予定の流れに足す'}</button>${editing ? '<button type="button" class="osub" data-v="stepcancel">直すのをやめる</button>' : ''}</div>
          </div>
        </section>
        <section class="osec"><h2>持ち物</h2>
          ${groups.length ? groups.map((g) => `<div class="ogrp"><h3><span style="color:${KID_COLOR[g.who] || 'inherit'}">${esc(nm(g.who))}</span><small>${g.items.length}こ</small></h3>${g.items.map((x) => `<div class="oline"><span class="x">${esc(x.text)}</span><button type="button" class="del" data-v="itemdel" data-id="${esc(x.id)}" aria-label="${esc(x.text)}を消す">×</button></div>`).join('')}</div>`).join('') : '<p class="oempty">まだありません。</p>'}
          <p class="ofld" style="margin:6px 0 0">だれの持ち物</p>
          <div class="owho" role="group" aria-label="だれの持ち物">${WHO_KEYS.map((w) => `<button type="button" data-v="who" data-k="${w}" aria-pressed="${S.itemWho === w}">${esc(nm(w))}</button>`).join('')}</div>
          <div class="oaddrow"><label class="sr" for="iText">持ち物</label><input id="iText" maxlength="${LIMITS.item}" placeholder="持ち物を追加（例：すいとう）" autocomplete="off"><button type="button" data-v="itemadd">追加</button></div>
          <p class="ofld" style="margin:6px 0 0">定番から入れる（みんなと子ども3人に入ります）</p>
          <div class="otpl">${Object.entries(TEMPLATES).map(([k2, t]) => `<button type="button" class="osub" data-v="tpl" data-k="${k2}">${esc(t.label)}</button>`).join('')}</div>
        </section>
        <section class="osec"><h2>チケット・お金</h2>
          <label class="ofld">予約番号<input id="tRef" maxlength="${LIMITS.ticket}" value="${esc(tk.ref)}" autocomplete="off"></label>
          <div class="ogrid2"><label class="ofld">料金<input id="tFee" maxlength="${LIMITS.ticket}" value="${esc(tk.fee)}" placeholder="例：おとな○円・子ども○円"></label><label class="ofld">予算<input id="tBudget" maxlength="${LIMITS.ticket}" value="${esc(tk.budget)}" placeholder="例：○円くらい"></label></div>
        </section>
        <section class="osec warn"><h2>もしものとき</h2>
          <label class="ofld">はぐれたときの集合場所<input id="eMeet" maxlength="${LIMITS.emergency}" value="${esc(em.meet)}" placeholder="例：入り口の時計の下"></label>
          <label class="ofld">雨のとき<input id="eRain" maxlength="${LIMITS.emergency}" value="${esc(em.rain)}"></label>
          <label class="ofld">近くの病院<input id="eHosp" maxlength="${LIMITS.emergency}" value="${esc(em.hospital)}" placeholder="例：○○病院 電話 ○○"></label>
        </section>
      </div>
      <div class="osave"><p class="omsg" id="oMsg" role="alert"></p><button type="button" class="oprimary" data-v="save">保存</button>${d.id ? '<button type="button" class="odel" data-v="delete">このしおりを削除</button>' : ''}</div>
    </div>`;
  }
  const val = (id) => (document.getElementById(id)?.value ?? '');
  function readFields() {
    const d = D(); if (!d || S.mode !== 'edit') return;
    d.title = val('oTitle'); d.date = val('oDate'); d.endDate = val('oEnd'); d.place = val('oPlace'); d.address = val('oAddr');
    d.ticket = { ref: val('tRef'), fee: val('tFee'), budget: val('tBudget') };
    d.emergency = { meet: val('eMeet'), rain: val('eRain'), hospital: val('eHosp') };
  }
  function redraw(focusSel) { const y = page.scrollTop; drawEdit(); page.scrollTop = y; if (focusSel) document.querySelector(focusSel)?.focus(); }
  function stepFromForm(kind, id) {
    const g = (x) => val(x);
    return cleanStep({ id, kind, time: g('sTime'), arr: g('sArr'), text: g('sText'), from: g('sFrom'), to: g('sTo'), line: g('sLine'), track: g('sTrack') });
  }
  page.addEventListener('input', (ev) => { if (ev.target.id === 'oTitle' || ev.target.id === 'oPlace') { readFields(); const box = page.querySelector('.othemes'); if (box) box.innerHTML = themeBtns(); } });
  page.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'iText') { ev.preventDefault(); page.querySelector('[data-v=itemadd]')?.click(); } });
  page.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'oPhoto') return;
    const f = ev.target.files?.[0]; if (!f) return;
    readFields();
    try { D().photoData = await compressPhoto(f); D().photoChanged = true; D().hasPhoto = true; redraw(); toast('写真をのせました（保存すると反映されます）'); }
    catch (e) { console.warn('photo', e); toast('この写真は読み込めませんでした。別の写真を選んでください'); }
  });
  page.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-v]'); if (!b) return;
    const v = b.dataset.v;
    if (v === 'close') { close(); return; }
    if (S.mode === 'view') {
      const o = findO(S.openId); if (!o) return;
      if (v === 'edit') openEdit(o.id);
      else if (v === 'print') doPrint(o);
      else if (v === 'share') doShare(o);
      return;
    }
    if (S.mode !== 'edit') return;
    readFields();
    const d = D();
    if (v === 'back') { if (d.id && findO(d.id)) openView(d.id); else close(); return; }
    if (v === 'theme') { d.theme = b.dataset.k; if (d.photoData || d.hasPhoto) { /* 写真があるときは写真が表紙 */ } redraw(); return; }
    if (v === 'nophoto') { d.photoData = ''; d.hasPhoto = false; d.photoChanged = true; redraw(); return; }
    if (v === 'kind') { S.stepKind = b.dataset.k; if (S.stepEdit) { const s = d.steps.find((x) => x.id === S.stepEdit); if (s) s.kind = b.dataset.k; } redraw(); return; }
    if (v === 'stepedit') { S.stepEdit = b.dataset.id; redraw(); document.getElementById('oStepForm')?.scrollIntoView({ block: 'center' }); return; }
    if (v === 'stepcancel') { S.stepEdit = ''; redraw(); return; }
    if (v === 'stepdel') { d.steps = d.steps.filter((s) => s.id !== b.dataset.id); if (S.stepEdit === b.dataset.id) S.stepEdit = ''; redraw(); return; }
    if (v === 'stepadd') {
      const kind = S.stepEdit ? (d.steps.find((x) => x.id === S.stepEdit)?.kind || S.stepKind) : S.stepKind;
      const s = stepFromForm(kind, S.stepEdit || newId());
      if (!s) { toast(kind === 'plan' ? 'やることを入れてください' : '駅（場所）を入れてください'); return; }
      if (S.stepEdit) d.steps = d.steps.map((x) => (x.id === S.stepEdit ? s : x)); else { if (d.steps.length >= LIMITS.steps) { toast('予定は40行までです'); return; } d.steps.push(s); }
      S.stepEdit = ''; redraw(); toast(isTime(s.time) ? `${s.time} の予定を入れました` : '予定を入れました'); return;
    }
    if (v === 'who') { S.itemWho = b.dataset.k; redraw('#iText'); return; }
    if (v === 'itemadd') {
      const it = cleanItem({ who: S.itemWho, text: val('iText') });
      if (!it) { document.getElementById('iText')?.focus(); return; }
      if (d.items.some((x) => x.who === it.who && x.text === it.text)) { toast('もう入っています'); return; }
      if (d.items.length >= LIMITS.items) { toast('持ち物は120こまでです'); return; }
      d.items.push(it); redraw('#iText'); return;
    }
    if (v === 'itemdel') { d.items = d.items.filter((x) => x.id !== b.dataset.id); redraw(); return; }
    if (v === 'tpl') { const n = d.items.length; d.items = applyTemplate(d.items, b.dataset.k); redraw(); toast(d.items.length > n ? `「${TEMPLATES[b.dataset.k].label}」の持ち物を${d.items.length - n}こ入れました` : 'もう全部入っています'); return; }
    if (v === 'save') { await save(); return; }
    if (v === 'delete') { await remove(); return; }
  });
  async function save() {
    const d = D(), msg = document.getElementById('oMsg');
    const p = outingProblem(d);
    if (p) { msg.textContent = p; return; }
    const id = d.id || newId();
    const hasPhoto = !!(d.photoData || (d.hasPhoto && !d.photoChanged));
    const data = cleanOuting({ ...d, hasPhoto });
    const btn = page.querySelector('[data-v=save]'); if (btn) btn.disabled = true;
    const ok = await store.save({ id, data, photo: d.photoChanged ? d.photoData : undefined });
    if (btn) btn.disabled = false;
    if (!ok) { msg.textContent = '保存できませんでした。もう一度押してください（ルールの更新が必要なこともあります）。'; return; }
    if (d.photoChanged) { S.photo = { id: '', data: '' }; S.photoUnsub?.(); S.photoUnsub = null; }
    if (!S.list.some((o) => o.id === id)) S.list.push({ id, ...data });   // すぐ見られるように（届いたら上書き）
    else S.list = S.list.map((o) => (o.id === id ? { id, ...data } : o));
    toast(d.id ? 'しおりを保存しました' : 'しおりを作りました');
    openView(id);
  }
  async function remove() {
    const d = D(); if (!d.id) return;
    const ok = await (ctx.confirm ? ctx.confirm(`「${d.title}」のしおりを削除しますか？持ち物のチェックと写真も消えます。`) : Promise.resolve(window.confirm(`「${d.title}」のしおりを削除しますか？`)));
    if (!ok) return;
    if (await store.remove(d.id, S.checks.filter((c) => c.outing === d.id).map((c) => c.item))) { S.list = S.list.filter((o) => o.id !== d.id); close(); drawCard(); toast('しおりを削除しました'); }
  }
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !page.hidden) { if (S.mode === 'view') close(); } });

  drawCard();
  return { subscribe, redraw: () => { drawCard(); if (S.mode === 'view') drawView(); }, open: openView, close };
}
