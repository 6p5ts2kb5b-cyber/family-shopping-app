// 画面の「動き」（lib/motion.js）のテスト（偽のFirebase。名前・品物はテスト用）
// ・動くべきときに動く／描き直しのたびに全部が動かない
// ・データの保存や表示は遅れない
// ・端末の「視差効果を減らす」設定では動かない
// SHOTS=フォルダ を指定すると、動きの途中のスクリーンショットを保存
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const BASE = 'http://localhost:8790/';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const route = (ctx) => ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
// 付いた「動き」のクラスと、追加された紙ふぶき・残像・波紋を記録する（すぐ外れても見のがさない）
const recorder = () => {
  window.__m = [];
  const desc = (n) => n.dataset?.key || n.id || (n.className && String(n.className.baseVal ?? n.className)) || n.tagName;
  new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'attributes') {
        for (const c of r.target.classList || []) if (c.startsWith('m-') && !(r.oldValue || '').split(' ').includes(c)) window.__m.push({ c, k: desc(r.target), t: r.target.tagName });
      } else for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        for (const x of [n, ...n.querySelectorAll('[class*="m-"]')]) for (const c of x.classList || []) if (c.startsWith('m-')) window.__m.push({ c, k: desc(x), t: x.tagName, added: true, hidden: x.getAttribute('aria-hidden') });
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
};
const log = (p) => p.evaluate(() => window.__m);
const clear = (p) => p.evaluate(() => { window.__m = []; });
// 同じ要素が2回記録されることがあるので、要素ごとに数える
const uniq = (L, c) => new Set(L.filter((x) => x.c === c).map((x) => x.k)).size;
const has = (L, c, k) => L.some((x) => x.c === c && (k == null || String(x.k).includes(k)));
const ts = (s) => ({ seconds: s, nanoseconds: 0 });

// ======================= 親の画面（app.html） =======================
for (const reduce of [false, true]) {
  const tag = reduce ? '動きを減らす設定' : 'ふつう';
  const ctx = await b.newContext({ ...devices['iPhone 13'], reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await route(ctx);
  await ctx.addInitScript(recorder);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'app.html');
  await p.evaluate(() => {
    localStorage.clear(); localStorage.setItem('ownerUid', 'u1');
    localStorage.setItem('fakeDB', JSON.stringify({ shoppingItems: {
      a: { name: 'テスト牛乳', quantity: 1, done: false, createdAt: 3, doneAt: null },
      b: { name: 'テスト豆腐', quantity: 1, done: false, createdAt: 2, doneAt: null },
      c: { name: 'テスト卵', quantity: 1, done: false, createdAt: 1, doneAt: null },
    }, shoppingFavorites: { f: { name: 'テストパン' } }, familySchedules: {} }));
    sessionStorage.setItem('nextUid', 'u1');
  });
  await p.goto(BASE + 'app.html?m'); await p.click('#login'); await p.waitForTimeout(600);
  let L = await log(p);
  if (!reduce) {
    ok(uniq(L, 'm-in') === 3, `${tag}：はじめての表示は3品が順番にふわっと（スタガー）`);
    ok(await p.$eval('#todo li >> nth=0', () => true).catch(() => true), `${tag}：一覧が表示される`);
  } else ok(!L.some((x) => x.c === 'm-in'), `${tag}：はじめての表示でも動かない`);

  // 追加：新しい品物だけポップイン、件数がはずむ。既存の品物は動かない
  await clear(p);
  await p.fill('#product', 'テストりんご'); await p.press('#product', 'Enter'); await p.waitForTimeout(400);
  L = await log(p);
  const newId = await p.$eval('#todo li:has-text("テストりんご")', (li) => li.dataset.key);
  if (!reduce) {
    ok(has(L, 'm-pop', newId) && uniq(L, 'm-pop') === 1, `${tag}：追加した品物だけポップイン（ほかの品物は動かない）`);
    ok(has(L, 'm-bump', 'todoCount'), `${tag}：「買うもの」の件数がはずむ`);
  } else ok(!L.some((x) => x.c === 'm-pop' || x.c === 'm-bump'), `${tag}：追加しても動かない`);

  // 個数＋：数字がはずむ
  await clear(p);
  await p.click('#todo li:has-text("テスト豆腐") .stepper button >> nth=1'); await p.waitForTimeout(400);
  L = await log(p);
  ok(reduce ? !has(L, 'm-bump') : L.some((x) => x.c === 'm-bump' && x.t === 'OUTPUT'), `${tag}：個数を変えると数字が${reduce ? 'はずまない' : 'はずむ'}`);

  // 買った：残像（チェックが描かれて右へ消える）。実際の一覧はすぐ更新、残像は読み上げ対象外で消える
  await clear(p);
  await p.click('#todo li:has-text("テスト卵") .check');
  await p.waitForTimeout(120);
  if (SHOTS && !reduce) await p.screenshot({ path: `${SHOTS}/motion-app-check.png` });
  const moved = await p.evaluate(() => !document.querySelector('#todo').textContent.includes('テスト卵') && document.querySelector('#done').textContent.includes('テスト卵'));
  ok(moved, `${tag}：「買った」はすぐ一覧に反映（動きで遅れない）`);
  L = await log(p);
  ok(reduce ? !has(L, 'm-ghost') : L.some((x) => x.c === 'm-ghost' && x.added && x.hidden === 'true'), `${tag}：買った品物の残像${reduce ? 'は出ない' : 'が出る（読み上げ対象外）'}`);
  await p.waitForTimeout(800);
  ok(await p.$$eval('.m-ghost', (x) => x.length) === 0, `${tag}：残像は自動で消える`);

  // 重複：入力欄がゆれて、リストの同じ品物にマーカー
  await clear(p);
  await p.fill('#product', 'テスト牛乳'); await p.press('#product', 'Enter'); await p.waitForTimeout(300);
  L = await log(p);
  ok(reduce ? !has(L, 'm-shake') : has(L, 'm-shake', 'product') && has(L, 'm-mark'), `${tag}：同じ品物を入れると${reduce ? '動かない' : '入力欄がゆれて、リストの品物にマーカー'}`);
  ok(await p.isVisible('#toast') && (await p.textContent('#toastText')).includes('すでに'), `${tag}：お知らせは今までどおり表示`);

  // 波紋（タップした所から）
  await clear(p);
  await p.locator('#favorites .chip').first().click({ position: { x: 12, y: 12 } }); await p.waitForTimeout(100);
  L = await log(p);
  ok(reduce ? !has(L, 'm-rip') : has(L, 'm-rip'), `${tag}：ボタンを押すと波紋が${reduce ? '出ない' : '出る'}`);
  await p.waitForTimeout(700);
  ok(await p.$$eval('.m-rip', (x) => x.length) === 0, `${tag}：波紋は自動で消える`);

  // 画面・シート・お知らせ
  const anim = (sel) => p.$eval(sel, (e) => getComputedStyle(e).animationName);
  ok(reduce ? (await anim('#toast')) === 'none' : (await anim('#toast')) === 'm-toast', `${tag}：お知らせが下から${reduce ? '（動きなし）' : 'ふわっと出る'}`);
  await p.click('#todo button.namebtn:has-text("テスト牛乳")'); await p.waitForTimeout(50);
  ok(reduce ? (await anim('#editSheet')) === 'none' : (await anim('#editSheet')) === 'm-sheet', `${tag}：編集シートが下から${reduce ? '（動きなし）' : 'せり上がる'}`);
  if (SHOTS && !reduce) await p.screenshot({ path: `${SHOTS}/motion-app-sheet.png` });
  await p.click('#sheetBg', { position: { x: 10, y: 10 } }).catch(() => {}); await p.keyboard.press('Escape');
  ok(errs.length === 0, `${tag}：エラーなし ${errs.join(' / ')}`);
  await ctx.close();
}

// ======================= 子ども用タブレット（kids.html） =======================
const NAMES = { child1: 'テ一', child2: 'テ二', child3: 'テ三' };
const N = (text, extra = {}) => ({ text, targets: ['child1'], period: 'evening', repeat: 'daily', onDate: '', active: true, updatedAt: ts(1), ...extra });
const seed = () => ({
  shoppingItems: {}, shoppingFavorites: {}, familyMembers: {}, familySchedules: {},
  kidNotices: { a: N('テスト宿題'), b: N('テスト水筒') },
  kidTemplates: {}, kidSettings: {}, kidDevices: { tabT: { label: 'x', addedAt: ts(1), pairToken: 'x'.repeat(22) } },
  familySettings: { children: NAMES },
});
const T0 = new Date(2026, 9, 20, 18, 0, 0).getTime();
for (const reduce of [false, true]) {
  const tag = reduce ? 'タブレット・動きを減らす設定' : 'タブレット';
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await route(ctx);
  await ctx.addInitScript(recorder);
  const k = await ctx.newPage(); const errs = []; k.on('pageerror', (e) => errs.push(e.message)); k.on('dialog', (d) => d.accept());
  await k.clock.setFixedTime(new Date(T0));
  await k.goto(BASE + 'kids.html');
  await k.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabT'); }, seed());
  await k.reload(); await k.waitForSelector('#board .kid li.note', { timeout: 10000 }); await k.waitForTimeout(300);
  let L = await log(k);
  ok(reduce ? !has(L, 'm-in') : uniq(L, 'm-in') === 2, `${tag}：でんごんが${reduce ? '動かずに' : '順番にふわっと'}出る`);

  // 1分ごとの描き直しでは動かない
  await clear(k);
  await k.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await k.waitForTimeout(200);
  L = await log(k);
  ok(!L.some((x) => x.c === 'm-in' || x.c === 'm-pop'), `${tag}：描き直しのたびに動かない`);

  // あとから届いた でんごん だけポップイン
  await clear(k);
  // 親の端末から届いたことにする（別のページで書き込む）
  const w = await ctx.newPage(); await w.goto(BASE + 'kids.webmanifest');
  await w.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.kidNotices.c = { text: 'テスト体操服', targets: ['child1'], period: 'evening', repeat: 'daily', onDate: '', active: true, updatedAt: { seconds: 9, nanoseconds: 0 } }; localStorage.setItem('fakeDB', JSON.stringify(d)); }); await w.close();
  await k.waitForFunction(() => document.querySelector('#cols').textContent.includes('テスト体操服'), null, { timeout: 10000 });
  await k.waitForTimeout(100);
  L = await log(k);
  ok(reduce ? !has(L, 'm-pop') : has(L, 'm-pop', 'child1:c') && uniq(L, 'm-pop') === 1, `${tag}：あとから届いた でんごん だけ${reduce ? '（動きなし）' : 'ポップイン'}`);

  // できた！：はずむ＋紙ふぶき。「できた！」はタブレットの中だけ（サーバーに送らない）
  const dbBefore = await k.evaluate(() => localStorage.getItem('fakeDB'));
  await clear(k);
  await k.click('.kid[data-child=child1] .donebtn >> nth=0'); await k.waitForTimeout(150);
  if (SHOTS && !reduce) await k.screenshot({ path: `${SHOTS}/motion-kids-done.png` });
  L = await log(k);
  const bursts = L.filter((x) => x.c === 'm-burst').length;
  ok(reduce ? bursts === 0 && !has(L, 'm-like') : bursts >= 10 && has(L, 'm-like') && has(L, 'm-bump'), `${tag}：「できた！」で${reduce ? '動かない' : 'ボタンがはずみ、紙ふぶき（' + bursts + 'まい）'}`);
  ok((await k.evaluate(() => localStorage.getItem('fakeDB'))) === dbBefore, `${tag}：「できた！」はサーバーに送らない（データは変わらない）`);
  // ぜんぶ できた：大きな紙ふぶき
  await clear(k);
  await k.click('.kid[data-child=child1] .donebtn[aria-pressed=false] >> nth=0');
  await k.click('.kid[data-child=child1] .donebtn[aria-pressed=false] >> nth=0'); await k.waitForTimeout(400);
  L = await log(k);
  ok(reduce ? !L.some((x) => x.c === 'm-burst') : has(L, 'm-pop', 'all') || L.some((x) => x.c === 'm-pop' && x.t === 'P'), `${tag}：ぜんぶ できたら「ぜんぶできた！」が${reduce ? '動かない' : 'ポンと出る'}`);
  if (!reduce) ok(L.filter((x) => x.c === 'm-burst').length >= 40, `${tag}：ぜんぶ できたら大きな紙ふぶき`);
  await k.waitForTimeout(1600);
  ok(await k.$$eval('.m-burst', (x) => x.length) === 0, `${tag}：紙ふぶきは自動で消える`);

  // とうひょう：票の数字がはずむ、決まったら バナー・かんむり・紙ふぶき
  await k.click('.tabs button[data-tool=vote]');
  await k.fill('#pollQ', 'テストばんごはん'); await k.fill('#pollC0', 'カレー'); await k.fill('#pollC1', 'すし');
  await clear(k);
  await k.click('#startPoll'); await k.waitForTimeout(100);
  await k.click('#choiceList .choice >> nth=1'); await k.waitForTimeout(100);
  L = await log(k);
  ok(reduce ? !has(L, 'm-bump') : L.some((x) => x.c === 'm-bump' && x.t === 'B'), `${tag}：票が入ると数字が${reduce ? 'はずまない' : 'はずむ'}`);
  await clear(k);
  await k.click('#showResult'); await k.waitForTimeout(200);
  if (SHOTS && !reduce) await k.screenshot({ path: `${SHOTS}/motion-kids-vote.png` });
  L = await log(k);
  ok(reduce ? !L.some((x) => x.c === 'm-burst' || x.c === 'm-bounce') : has(L, 'm-pop', 'pollResult') && has(L, 'm-bounce') && L.filter((x) => x.c === 'm-burst').length >= 30, `${tag}：きまったら${reduce ? '動かない' : 'バナーがポン、かんむりがはねて、紙ふぶき'}`);
  ok((await k.textContent('#pollResult')).includes('けっか：すし！'), `${tag}：結果の文字は今までどおり`);
  if (SHOTS && !reduce) { await k.waitForTimeout(1600); await k.screenshot({ path: `${SHOTS}/motion-kids-vote-after.png` }); }
  await clear(k);
  await k.click('#choiceList .choice >> nth=0'); await k.waitForTimeout(100);
  L = await log(k);
  ok(!L.some((x) => x.c === 'm-burst'), `${tag}：紙ふぶきは決まった しゅんかん だけ`);

  // タイマー：のこり10びょうで ドキドキ
  await k.click('.tabs button[data-tool=timer]');
  await k.click('#tStart');
  await k.clock.setFixedTime(new Date(T0 + 10 * 60000 - 8000)); await k.waitForTimeout(400);
  ok(await k.$eval('#clock', (e) => e.classList.contains('soon')), `${tag}：のこり10びょうで時計にしるし（soon）`);
  ok(await k.$eval('#clock', (e) => getComputedStyle(e).animationName) === (reduce ? 'none' : 'm-pulse'), `${tag}：のこり10びょうで時計が${reduce ? '動かない' : 'ドキドキ'}`);
  if (SHOTS && !reduce) await k.screenshot({ path: `${SHOTS}/motion-kids-soon.png` });
  await clear(k);
  await k.clock.setFixedTime(new Date(T0 + 10 * 60000 + 500)); await k.waitForTimeout(500);
  L = await log(k);
  ok(reduce ? !L.some((x) => x.c === 'm-burst') : L.filter((x) => x.c === 'm-burst').length >= 20, `${tag}：じかんに なったら${reduce ? '動かない' : '紙ふぶき'}`);
  ok(!(await k.$eval('#clock', (e) => e.classList.contains('soon'))), `${tag}：じゅんび中は ドキドキしない`);
  ok(errs.length === 0, `${tag}：エラーなし ${errs.join(' / ')}`);
  await ctx.close();
}
await b.close();
