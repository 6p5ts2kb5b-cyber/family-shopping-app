// 子ども用タブレット kids.html のテスト（偽のFirebase。本物には接続しない）
// 親のGoogleアカウントでログイン（QR登録なし） → 伝言の表示 → できた！（端末内だけ） → 日付・朝夕・お休み・解除・オフライン・読み込み失敗・画面サイズ
// SHOTS=フォルダ を指定するとスクリーンショットを保存
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const BASE = 'http://localhost:8790/';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const until = (page, sel) => page.waitForSelector(sel, { state: 'visible', timeout: 10000 }).catch(() => {});
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const THU = new Date(2026, 9, 15, 7, 30), FRI = new Date(2026, 9, 16, 7, 30), SAT = new Date(2026, 9, 17, 7, 30);
const ts = (s) => ({ seconds: s, nanoseconds: 0 });
const N = (text, o = {}) => ({ text, targets: ['child1', 'child2', 'child3'], period: 'morning', repeat: 'daily', onDate: '', active: true, updatedAt: ts(100), ...o });
const seedDB = () => ({
  shoppingItems: { m: { name: 'テスト牛乳', quantity: 1, done: false, createdAt: 1, doneAt: null } },
  shoppingFavorites: {}, familyMembers: {},
  familySchedules: { s: { date: ymd(THU), who: 'husband', name: 'テスト出勤', departure: '07:30', returnTime: '' } },
  kidNotices: {
    a: N('テスト水筒を持ってね', { updatedAt: ts(1) }),
    b: N('テスト音読をしよう', { targets: ['child1'], updatedAt: ts(2) }),
    c: N('テスト体操服', { targets: ['child2', 'child3'], repeat: 'weekdays', updatedAt: ts(3) }),
    d: N('テスト宿題をしよう', { period: 'evening' }),
    e: N('テスト明日の朝の伝言', { targets: ['child3'], repeat: 'once', onDate: ymd(FRI) }),
    f: N('テスト止めた伝言', { active: false }),
  },
  kidTemplates: { t: { text: 'テスト定型文', order: 0 } },
  kidSettings: { board: { pause: '', eveningFrom: '12:00' } },
  familySettings: { children: { child1: 'テスト一', child2: 'テスト二', child3: 'テスト三' }, parents: { husband: 'テスト夫', wife: 'テスト妻' } },
});
const route = (ctx) => ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
const colText = (p, c) => p.textContent(`.kid[data-child=${c}]`);

// ============ メインの流れ（iPad 横） ============
{
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await route(ctx);
  const kid = await ctx.newPage();
  const errs = []; kid.on('pageerror', (e) => errs.push(e.message));
  await kid.clock.setFixedTime(THU);
  await kid.goto(BASE + 'kids.html');
  await kid.evaluate((d) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('ownerUid', 'ownerUid1'); localStorage.setItem('fakeDB', JSON.stringify(d)); }, seedDB());
  await kid.reload(); await kid.waitForTimeout(600);

  // ---- ログイン前：QRは出ず、親のログインを案内 ----
  ok(await kid.isVisible('#login') && await kid.isHidden('#board') && await kid.locator('#qr, #pair').count() === 0, 'ログイン前：QRは出ず「おうちの ひとが ログインしてね」');
  ok(!(await kid.textContent('body')).includes('テスト水筒'), 'ログイン前は伝言を読まない');
  ok(!JSON.stringify(await db(kid)).includes('kidPairRequests'), '登録の申請（kidPairRequests）は作らない');
  // 名簿に無いアカウント
  await kid.evaluate(() => sessionStorage.setItem('nextUid', 'strangerT1'));
  await kid.click('#loginBtn'); await kid.waitForTimeout(500);
  ok(await kid.isVisible('#login') && (await kid.textContent('#loginText')).includes('名簿に ありません') && !(await kid.textContent('body')).includes('テスト水筒'), '名簿に無いアカウントでは伝言は出ず、理由が出る');
  if (SHOTS) await kid.screenshot({ path: `${SHOTS}/kids-login.png` });
  // 管理者（親）のアカウントでログイン
  await kid.evaluate(() => sessionStorage.setItem('nextUid', 'ownerUid1'));
  await kid.click('#loginBtn'); await kid.waitForTimeout(500);

  const parent = await ctx.newPage();
  await parent.clock.setFixedTime(THU);
  await parent.goto(BASE + 'app.html');
  await parent.evaluate(() => sessionStorage.setItem('nextUid', 'ownerUid1'));
  await parent.reload(); await parent.click('#login'); await parent.waitForTimeout(400);

  // ---- 伝言の表示 ----
  await until(kid, '#board .kid');
  ok(await kid.isVisible('#board') && await kid.isHidden('#login'), '親のアカウントでログインすると、そのまま伝言画面になる');
  ok((await kid.textContent('#date')).includes('10がつ15にち（もく）'), '日付と曜日');
  ok(await kid.getAttribute('.period button[data-p=morning]', 'aria-pressed') === 'true', '7:30 は自動で「あさ」');
  const names = await kid.$$eval('.kid h2 .name', (x) => x.map((e) => e.textContent));
  ok(names.join() === 'テスト一,テスト二,テスト三', `名前は家族設定（Firebase）から（${names.join()}）`);
  const c1 = await colText(kid, 'child1'), c2 = await colText(kid, 'child2'), c3 = await colText(kid, 'child3');
  ok(c1.includes('テスト水筒') && c1.includes('テスト音読') && !c1.includes('テスト体操服'), '1人目：全員あて＋自分だけの伝言');
  ok(c2.includes('テスト水筒') && c2.includes('テスト体操服') && !c2.includes('テスト音読'), '2人目：2人あて（平日）の伝言');
  ok(c3.includes('テスト体操服') && !c3.includes('テスト明日の朝'), '3人目：明日だけの伝言は今日は出ない');
  ok(![c1, c2, c3].some((t) => t.includes('テスト宿題') || t.includes('テスト止めた')), '夕方の伝言・止めた伝言は出ない');
  const boxes = await kid.$$eval('.kid', (x) => x.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })));
  ok(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x && Math.abs(boxes[0].y - boxes[2].y) < 2, 'iPad横：3人が横3列');
  ok(await kid.locator('a').count() === 1 && await kid.getAttribute('a', 'href') === './app.html' && !(await kid.textContent('body')).includes('買い物') && !(await kid.textContent('body')).includes('テスト牛乳'), '買い物・予定の内容は出ない（リンクは「おとなの画面へ」だけ）');

  // ---- できた！ ----
  const before = JSON.stringify(await db(kid));
  await kid.click('.kid[data-child=child1] .note:has-text("テスト水筒") .donebtn');
  ok((await kid.textContent('.kid[data-child=child1] .count')).includes('1 / 2') && await kid.getAttribute('.kid[data-child=child1] .note:has-text("テスト水筒") .donebtn', 'aria-pressed') === 'true', '「できた！」で完了になり、完了数が増える');
  await kid.click('.kid[data-child=child1] .note:has-text("テスト音読") .donebtn');
  ok(await kid.isVisible('.kid[data-child=child1] .all') && (await kid.textContent('.kid[data-child=child1] .all')).includes('ぜんぶできた'), 'すべて完了で「ぜんぶできた！」');
  ok(await kid.isHidden('.kid[data-child=child2] .all'), 'ほかの子の欄は変わらない');
  await kid.click('.kid[data-child=child1] .note:has-text("テスト音読") .donebtn');
  ok((await kid.textContent('.kid[data-child=child1] .count')).includes('1 / 2') && await kid.isHidden('.kid[data-child=child1] .all'), 'もう一度押すと取り消せる');
  ok(JSON.stringify(await db(kid)) === before, '「できた！」はFirestoreに一切書き込まない');
  const keys = await kid.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kidsDone:')));
  ok(keys.length === 1 && keys[0].includes('"2026-10-15","child1","morning","a","1.0"'), `記録は端末内だけ（日付・子・朝夕・伝言ID・版）${keys[0]}`);
  await kid.reload(); await kid.waitForTimeout(600);
  ok((await kid.textContent('.kid[data-child=child1] .count')).includes('1 / 2'), '再読み込みしても完了は残る');
  if (SHOTS) await kid.screenshot({ path: `${SHOTS}/kids-board-ipad-land.png` });

  // ---- 親が文面を直す → その伝言のチェックだけ外れる ----
  await parent.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.kidNotices.a = { ...d.kidNotices.a, text: 'テスト水筒とハンカチ', updatedAt: { seconds: 500, nanoseconds: 0 } }; localStorage.setItem('fakeDB', JSON.stringify(d)); });
  await kid.waitForTimeout(400);
  ok((await colText(kid, 'child1')).includes('テスト水筒とハンカチ') && (await kid.textContent('.kid[data-child=child1] .count')).includes('0 / 2'), '親が文面を直すと反映され、その伝言のチェックは外れる');

  // ---- 朝／夕方 ----
  await kid.click('.period button[data-p=evening]');
  ok((await colText(kid, 'child2')).includes('テスト宿題') && !(await colText(kid, 'child2')).includes('テスト水筒'), '「ゆうがた」に手で切り替えられる');
  await kid.clock.setFixedTime(new Date(2026, 9, 15, 12, 30)); await kid.reload(); await kid.waitForTimeout(600);
  ok(await kid.getAttribute('.period button[data-p=evening]', 'aria-pressed') === 'true', '12:30 は自動で「ゆうがた」（初期値12:00）');
  await parent.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.kidSettings.board.eveningFrom = '15:00'; localStorage.setItem('fakeDB', JSON.stringify(d)); });
  await kid.waitForTimeout(400);
  ok(await kid.getAttribute('.period button[data-p=morning]', 'aria-pressed') === 'true', '切り替え時刻を15:00に変えると12:30は「あさ」');

  // ---- 日付が変わる ----
  await kid.clock.setFixedTime(FRI);
  await kid.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await kid.waitForTimeout(200);
  ok((await kid.textContent('#date')).includes('16にち（きん）') && (await colText(kid, 'child3')).includes('テスト明日の朝'), '翌朝：前日に入れた「明日だけ」が出る');
  ok((await kid.textContent('.kid[data-child=child1] .count')).includes('0 / 2') && await kid.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kidsDone:')).length) === 0, '日付が変わるとチェックは未完了に戻り、古い記録は消える');
  await kid.clock.setFixedTime(SAT); await kid.reload(); await kid.waitForTimeout(600);
  ok(!(await colText(kid, 'child2')).includes('テスト体操服') && !(await colText(kid, 'child3')).includes('テスト明日の朝'), '土曜：平日だけ・前日だけの伝言は出ない');

  // ---- お休みモード ----
  await parent.evaluate((t) => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.kidSettings.board.pause = t; localStorage.setItem('fakeDB', JSON.stringify(d)); }, ymd(SAT));
  await kid.waitForTimeout(400);
  ok(await kid.isVisible('#paused') && await kid.isHidden('#cols'), '「今日だけお休み」：お休み表示になり伝言は出ない');
  await kid.clock.setFixedTime(new Date(2026, 9, 18, 7, 30)); await kid.reload(); await kid.waitForTimeout(600);
  ok(await kid.isHidden('#paused') && await kid.isVisible('#cols'), '翌日は自動でお休みが解除される');
  await parent.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.kidSettings.board.pause = 'on'; localStorage.setItem('fakeDB', JSON.stringify(d)); });
  await kid.waitForTimeout(400);
  ok(await kid.isVisible('#paused'), '「解除するまでお休み」');
  if (SHOTS) await kid.screenshot({ path: `${SHOTS}/kids-paused.png` });
  await parent.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.kidSettings.board.pause = ''; localStorage.setItem('fakeDB', JSON.stringify(d)); });
  await kid.waitForTimeout(400);
  ok(await kid.isHidden('#paused'), '親が解除すると元に戻る');

  // ---- オフライン ----
  await ctx.setOffline(true);
  await kid.waitForTimeout(200);
  ok((await kid.textContent('#conn')).includes('オフライン') && await kid.isVisible('#cols'), 'オフライン：表示は残り、状態に「オフライン」');
  await ctx.setOffline(false); await kid.waitForTimeout(200);

  // ---- 名簿から外れたアカウント ----
  await kid.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.familyMembers = { 'wifet2@example.com': { addedAt: 1 } }; localStorage.setItem('fakeDB', JSON.stringify(d)); sessionStorage.setItem('nextUid', 'wifeT2'); });
  await kid.evaluate(async () => { const A = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'); await A.signOut(A.getAuth()); });
  await until(kid, '#login');
  ok(await kid.isVisible('#login') && await kid.isHidden('#board'), 'ログアウトするとログインの画面に戻る');
  await kid.click('#loginBtn'); await until(kid, '#board .kid');
  ok(await kid.isVisible('#board'), '名簿にある妻のアカウントでも使える');
  await parent.evaluate(() => { const d = JSON.parse(localStorage.getItem('fakeDB')); d.familyMembers = {}; localStorage.setItem('fakeDB', JSON.stringify(d)); });
  await until(kid, '#login');
  ok(await kid.isVisible('#login') && (await kid.textContent('#loginText')).includes('名簿に ありません'), '名簿から外されると伝言は消え、ログインの画面になる');
  ok(errs.length === 0, `JSエラーなし ${errs.join(' | ')}`);
  await ctx.close();
}

// ============ 読み込み失敗 ============
{
  const ctx = await b.newContext({ viewport: { width: 1024, height: 768 } });
  await route(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE + 'kids.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'tabletTest02'); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('fakeLoadFail', '1'); sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'tabletTest02', email: 'tablettest02@example.com', isAnonymous: false })); }, seedDB());
  await p.reload(); await p.waitForTimeout(500);
  ok(await p.isVisible('#error') && await p.isVisible('#retry'), 'Firebaseの読み込み失敗：「つながりません」と「もういちど」');
  await p.evaluate(() => localStorage.removeItem('fakeLoadFail'));
  await p.click('#retry'); await p.waitForTimeout(600);
  ok(await p.isVisible('#board'), '「もういちど」で復帰する');
  await ctx.close();
}

// ============ 画面サイズ ============
const VIEWS = [
  ['iPad 横', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }, 3],
  ['iPad 縦', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }, 3],
  ['Androidタブレット 横', devices['Galaxy Tab S4 landscape'], 3],
  ['Androidタブレット 縦', devices['Galaxy Tab S4'], 3],
  ['iPhone 13', devices['iPhone 13'], 1],
  ['iPhone SE', devices['iPhone SE'], 1],
  ['PC 1280', { viewport: { width: 1280, height: 800 } }, 3],
];
for (const [label, opts, cols] of VIEWS) {
  const ctx = await b.newContext(opts);
  await route(ctx);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(THU);
  await p.goto(BASE + 'kids.html');
  const data = seedDB();
  data.kidNotices.long = N('テストとても長い伝言です。給食袋と体操服と上履きを持って、学校に着いたら先生に手紙を渡してね', { targets: ['child2'] });
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('ownerUid', 'tabletView'); sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'tabletView', email: 'tabletview@example.com', isAnonymous: false })); }, data);
  await p.reload(); await p.waitForTimeout(700);
  const xs = new Set(await p.$$eval('.kid', (x) => x.map((e) => Math.round(e.getBoundingClientRect().x))));
  ok(xs.size === cols, `${label}：${cols === 3 ? '3人が横3列' : '縦に並ぶ'}（列 ${xs.size}）`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}：横にはみ出さない`);
  const minH = await p.$$eval('.donebtn', (x) => Math.min(...x.map((e) => e.getBoundingClientRect().height)));
  const fs0 = await p.$eval('.donebtn', (e) => parseFloat(getComputedStyle(e).fontSize));
  // 伝言そのものが押せるボタン（コンパクト版）：押しやすさの目安 48px 以上、文字 17px 以上
  ok(minH >= 48 && fs0 >= 17, `${label}：押しやすいボタン（${Math.round(minH)}px）と読みやすい文字（${fs0}px）`);
  const pb = await p.$eval('.period button', (e) => e.getBoundingClientRect().height);
  ok(pb >= 48, `${label}：あさ／ゆうがたの切り替えが押しやすい（${Math.round(pb)}px）`);
  if (SHOTS && /iPad 縦|iPhone 13/.test(label)) await p.screenshot({ path: `${SHOTS}/kids-${label.replace(/\s/g, '')}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
