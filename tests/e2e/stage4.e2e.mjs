// 段階4（オフライン・同期状態）のテスト
// 偽のFirebaseで2台を再現（本物のFirebaseには接続しない）。各端末だけを圏外にできる。
// 実行：python3 -m http.server 8790 &  →  node tests/e2e/stage4.e2e.mjs
import { chromium, devices } from 'playwright';
import fs from 'fs';
import { toYmd, addDays } from '../../lib/schedule-views.js';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const URL0 = 'http://localhost:8790/app.html';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const errs = [];
const TOMORROW = toYmd(addDays(new Date(), 1));

const seed = await ctx.newPage();
await seed.goto(URL0);
await seed.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('ownerUid', 'husbandUID123');
  localStorage.setItem('fakeDB', JSON.stringify({
    shoppingItems: {
      milk: { name: '牛乳', quantity: 1, done: false, createdAt: 2, doneAt: null },
      egg: { name: '卵', quantity: 1, done: false, createdAt: 1, doneAt: null },
    },
    shoppingFavorites: {}, familyMembers: { 'wifeuid456789@example.com': { addedAt: 1 } }, familySchedules: {},
  }));
});
await seed.close();

const open = async (uid) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL0);
  await p.evaluate((u) => sessionStorage.setItem('nextUid', u), uid);
  await p.goto(URL0 + '?x');
  await p.click('#login');
  await p.waitForTimeout(400);
  return p;
};
// その端末だけ圏外／圏内にする
const setOnline = (p, on) => p.evaluate((on) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on });
  dispatchEvent(new Event(on ? 'online' : 'offline'));
}, on);
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
const names = (p, id) => p.$$eval(`#${id} .namebtn`, (x) => x.map((y) => y.firstChild.textContent));

const A = await open('husbandUID123');
const B = await open('wifeUID456789');
ok((await A.textContent('#sync')).includes('同期済み'), '最初は「同期済み」');

// ---------- 夫の端末だけ圏外 ----------
await setOnline(A, false); await A.waitForTimeout(200);
ok((await A.textContent('#sync')).includes('オフライン') && await A.isVisible('#offlineNote'), '圏外：「オフライン」表示と説明');

await A.fill('#product', 'テスト豆腐'); await A.press('#product', 'Enter'); await A.waitForTimeout(300);
ok((await names(A, 'todo')).includes('テスト豆腐') && (await A.textContent('#todo li:has-text("テスト豆腐")')).includes('未送信'), '圏外でも追加でき「未送信」と表示');
ok(await A.inputValue('#product') === '', '圏外でも入力欄は空になる（待たされない）');
ok((await A.textContent('#sync')).includes('未送信'), '右上に未送信の件数');
ok(!(await names(B, 'todo')).includes('テスト豆腐') && !Object.values((await db(A)).shoppingItems).some((x) => x.name === 'テスト豆腐'), 'まだ相手・サーバーには届いていない');

await A.click('#todo li:has-text("牛乳") .stepper button >> nth=1'); await A.waitForTimeout(300);
ok((await A.textContent('#todo li:has-text("牛乳") output')) === '2', '圏外でも＋できる（夫の画面は2）');
await B.click('#todo li:has-text("牛乳") .stepper button >> nth=1'); await B.waitForTimeout(300);
ok((await db(B)).shoppingItems.milk.quantity === 2, 'その間に妻も＋（サーバーは2）');

await A.click('#todo li:has-text("卵") .check'); await A.waitForTimeout(300);
ok(!(await names(A, 'todo')).includes('卵'), '圏外でも購入済みにできる');

await A.fill('#product', '牛乳'); await A.press('#product', 'Enter'); await A.waitForTimeout(300);
ok((await A.textContent('#toastText')).includes('すでに'), '圏外でも重複追加は防ぐ（端末内のリストで確認）');
await A.fill('#product', '');

// 圏外で名前変更（まとめて送る方式）
await A.click('#todo button.namebtn:has-text("テスト豆腐")'); await A.fill('#editName', 'テスト絹豆腐'); await A.click('#editSave'); await A.waitForTimeout(300);
ok((await names(A, 'todo')).includes('テスト絹豆腐') && !(await names(A, 'todo')).includes('テスト豆腐'), '圏外でも名前変更できる');

// 圏外で予定を文章入力
await A.click('.tabs button[data-tab=schedule]');
await A.fill('#quickText', '明日 テスト歯医者 10:00〜11:00'); await A.click('#quickWho button[data-v=wife]'); await A.click('#quickSave'); await A.waitForTimeout(400);
await A.click('.seg4 button[data-view=tomorrow]');
ok((await A.textContent('#scheduleBody')).includes('テスト歯医者') && (await A.textContent('#scheduleBody')).includes('未送信'), '圏外でも予定を保存でき「未送信」と表示');
await A.click('.tabs button[data-tab=home]');

// 圏外で削除→元に戻す
await A.click('#todo button.namebtn:has-text("牛乳")'); await A.click('#editDelete'); await A.waitForTimeout(300);
await A.click('#toastUndo'); await A.waitForTimeout(300);
ok((await names(A, 'todo')).includes('牛乳'), '圏外でも削除→元に戻すができる');

// 未送信があるときのログアウトは確認
await A.click('.tabs button[data-tab=family]');
let asked = false; A.once('dialog', (d) => { asked = true; d.dismiss(); });
await A.click('#logout'); await A.waitForTimeout(300);
ok(asked && await A.isVisible('#familyScreen'), '未送信があるとログアウト前に確認（やめればそのまま）');
await A.click('.tabs button[data-tab=home]');

// ---------- 圏内に戻る ----------
await setOnline(A, true); await A.waitForTimeout(1200);
const d = await db(A);
const items = Object.values(d.shoppingItems);
ok(items.some((x) => x.name === 'テスト絹豆腐') && !items.some((x) => x.name === 'テスト豆腐'), '電波が戻ると追加・名前変更が届く');
ok(d.shoppingItems.milk?.quantity === 3, '夫の圏外の＋と妻の＋が両方反映（1→3）');
ok(d.shoppingItems.egg?.done === true, '購入済みが届く');
ok(Object.values(d.familySchedules).some((x) => x.name === 'テスト歯医者' && x.date === TOMORROW && x.who === 'wife'), '予定が届く');
await B.waitForTimeout(300);
ok((await names(B, 'todo')).includes('テスト絹豆腐') && (await B.textContent('#todo li:has-text("牛乳") output')) === '3', '妻の画面にも反映');
ok(!(await A.textContent('#todo')).includes('未送信') && (await A.textContent('#sync')).includes('同期済み') && await A.isHidden('#offlineNote'), '「未送信」が消え「同期済み」に戻る');

// ---------- 通信が遅いとき（10秒以上） ----------
await A.evaluate(() => localStorage.setItem('fakeTxDelay', '11500'));
await A.fill('#product', 'テスト納豆'); await A.press('#product', 'Enter');
await A.waitForTimeout(10600);
ok((await A.textContent('#toastText')).includes('送信待ち') && await A.inputValue('#product') === '', '遅いときは「送信待ち」にして画面は止めない');
await A.waitForTimeout(1500);
ok(Object.values((await db(A)).shoppingItems).some((x) => x.name === 'テスト納豆'), 'あとで届く');
await A.evaluate(() => localStorage.setItem('fakeTxDelay', '0'));

ok(errs.length === 0, 'JSエラーなし ' + errs.join(' | '));
await b.close();
