// 表示のテスト：スマホ（1列）とPC（2列）、購入済みカード、よく買うものの横スクロール
// 偽のFirebaseを使用（本物には接続しない）。SHOTS=フォルダ を指定するとスクリーンショットを保存
// 実行：python3 -m http.server 8790 &  →  node tests/e2e/ui.e2e.mjs
import { chromium, devices } from 'playwright';
import fs from 'fs';
import { toYmd } from '../../lib/schedule-views.js';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const URL0 = 'http://localhost:8790/app.html';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();

const FAVS = ['牛乳', '卵', '納豆', '豆腐', '食パン', 'バナナ', '鶏むね肉', '玉ねぎ', 'にんじん', 'ヨーグルト', 'トイレットペーパー', '洗剤'];
const seedData = () => {
  const items = {};
  ['テスト牛乳', 'テスト卵', 'テスト豆腐'].forEach((n, i) => { items['t' + i] = { name: n, quantity: i + 1, done: false, createdAt: 10 - i, doneAt: null }; });
  ['テストりんご', 'テストみかん', 'テスト米', 'テスト味噌', 'テスト醤油', 'テスト砂糖', 'テスト塩'].forEach((n, i) => { items['d' + i] = { name: n, quantity: 1, done: true, createdAt: 1, doneAt: 100 - i }; });
  const favs = {}; FAVS.forEach((n, i) => { favs['f' + i] = { name: n }; });
  return {
    shoppingItems: items, shoppingFavorites: favs, familyMembers: {},
    familySchedules: { s1: { date: toYmd(new Date()), who: 'husband', name: 'テスト出勤', departure: '07:30', returnTime: '19:00' } },
  };
};

const VIEWS = [
  ['iPhone SE', { ...devices['iPhone SE'] }, 'mobile'],
  ['iPhone 13', { ...devices['iPhone 13'] }, 'mobile'],
  ['iPad（縦）', { ...devices['iPad (gen 7)'] }, 'mobile'],
  ['PC 1280×800', { viewport: { width: 1280, height: 800 } }, 'pc'],
  ['PC 1920×1080', { viewport: { width: 1920, height: 1080 } }, 'pc'],
];

for (const [label, opts, kind] of VIEWS) {
  const ctx = await b.newContext(opts);
  await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
    const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL0);
  await p.evaluate((data) => { localStorage.clear(); localStorage.setItem('ownerUid', 'u1'); localStorage.setItem('fakeDB', JSON.stringify(data)); sessionStorage.setItem('nextUid', 'u1'); }, seedData());
  await p.goto(URL0 + '?v');
  await p.click('#login');
  await p.waitForTimeout(500);
  const box = (sel) => p.locator(sel).first().boundingBox();
  // 画面幅より広い部品があると、スマホは全体を縮小表示してしまう → 実際の幅が端末の幅と同じかを確認
  const devW = p.viewportSize().width;
  const noHScroll = () => p.evaluate((w) => document.documentElement.scrollWidth <= w && innerWidth === w, devW);

  // ---- レイアウト ----
  const plan = await box('#homeScreen .col-plan'), shop = await box('#homeScreen .col-shop');
  if (kind === 'pc') {
    ok(plan.x + plan.width <= shop.x && Math.abs(plan.y - shop.y) < 4, `${label}：今日の予定と買い物が左右2列`);
    const main = await box('main');
    ok(main.width >= 1000, `${label}：画面幅を使う（本文 ${Math.round(main.width)}px）`);
  } else {
    ok(plan.y + plan.height <= shop.y + 1 && Math.abs(plan.x - shop.x) < 2, `${label}：1列（予定の下に買い物）`);
  }
  ok(await noHScroll(), `${label}：今日タブで横スクロールなし`);

  // ---- 購入済みカード ----
  ok((await p.getAttribute('#doneToggle', 'aria-expanded')) === 'false' && await p.isHidden('#doneBody'), `${label}：購入済みは最初は閉じている`);
  ok((await p.textContent('#doneCount')) === '7' && await p.isVisible('#doneCount'), `${label}：購入済みの件数（7）が見える`);
  const dh = await box('#doneToggle');
  ok(dh.height >= 48, `${label}：購入済みカードは押しやすい高さ（${Math.round(dh.height)}px）`);
  await p.click('#doneToggle');
  ok((await p.getAttribute('#doneToggle', 'aria-expanded')) === 'true' && await p.isVisible('#done li:has-text("テストりんご")'), `${label}：タップで一覧が開く`);
  if (SHOTS && label === 'iPhone 13') { await p.locator('#doneToggle').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOTS}/mobile-done-open.png` }); }
  await p.click('#done li:has-text("テストりんご") .backbtn');
  await p.waitForTimeout(300);
  ok((await p.textContent('#todo')).includes('テストりんご') && (await p.textContent('#doneCount')) === '6', `${label}：「戻す」で買うものに戻る`);
  await p.click('#doneToggle');
  ok(await p.isHidden('#doneBody'), `${label}：もう一度タップで閉じる`);

  // ---- よく買うもの ----
  ok((await p.textContent('#favCount')) === '12', `${label}：よく買うものの件数`);
  await p.evaluate(() => { const c = document.getElementById('favorites'); c.scrollLeft = 0; c.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(200);
  const overflow = await p.evaluate(() => { const c = document.getElementById('favorites'); return c.scrollWidth > c.clientWidth + 4; });
  if (overflow) {
    ok(await p.evaluate(() => document.getElementById('favWrap').classList.contains('can-right')), `${label}：続きがあると右端に目印`);
    if (kind === 'pc') {
      ok(await p.isVisible('#favRight') && await p.isHidden('#favLeft'), `${label}：PCは右矢印ボタンが出る`);
      const before = await p.evaluate(() => document.getElementById('favorites').scrollLeft);
      await p.click('#favRight'); await p.waitForTimeout(700);
      const after = await p.evaluate(() => document.getElementById('favorites').scrollLeft);
      ok(after > before && await p.isVisible('#favLeft'), `${label}：矢印で右へ移動し、左矢印も出る`);
      await p.click('#favLeft'); await p.waitForTimeout(700);
      ok(await p.evaluate(() => document.getElementById('favorites').scrollLeft) < after, `${label}：左矢印で戻る`);
    } else {
      ok(await p.isHidden('#favRight') && await p.isVisible('#favWrap .more-hint'), `${label}：スマホは矢印ボタンなし・「›」の目印`);
      await p.evaluate(() => { const c = document.getElementById('favorites'); c.scrollLeft = c.scrollWidth; c.dispatchEvent(new Event('scroll')); });
      await p.waitForTimeout(200);
      ok(await p.evaluate(() => { const w = document.getElementById('favWrap'); return w.classList.contains('can-left') && !w.classList.contains('can-right'); }), `${label}：指で右端まで動かすと目印が左側に変わる`);
    }
  } else {
    ok(await p.isHidden('#favRight') && await p.isHidden('#favLeft'), `${label}：全部見えるときは矢印なし`);
  }
  await p.click('#favorites button:has-text("ヨーグルト")');
  await p.waitForTimeout(300);
  ok((await p.textContent('#todo')).includes('ヨーグルト'), `${label}：よく買うものを1タップで追加（そのまま使える）`);
  if (SHOTS && label === 'PC 1280×800') await p.screenshot({ path: `${SHOTS}/pc-home.png` });
  if (SHOTS && label === 'iPhone 13') { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${SHOTS}/mobile-home.png` }); }

  // ---- 予定タブ・家族タブ ----
  await p.click('.tabs button[data-tab=schedule]');
  const view = await box('#scheduleScreen .col-view'), form = await box('#scheduleScreen .col-form');
  if (kind === 'pc') ok(view.x + view.width <= form.x && Math.abs(view.y - form.y) < 4, `${label}：予定は左に一覧、右に入力欄`);
  else ok(view.y + view.height <= form.y + 1, `${label}：予定は一覧の下に入力欄`);
  ok(await noHScroll(), `${label}：予定タブで横スクロールなし`);
  await p.click('.seg4 button[data-view=week]');
  ok(await noHScroll(), `${label}：週間表示で横スクロールなし`);
  if (SHOTS && label === 'PC 1280×800') await p.screenshot({ path: `${SHOTS}/pc-schedule.png` });
  await p.click('.tabs button[data-tab=family]');
  ok(await noHScroll(), `${label}：家族タブで横スクロールなし`);

  // ---- 下の追加欄・タブが押せる ----
  await p.click('.tabs button[data-tab=home]');
  const dock = await box('#dock'), vh = p.viewportSize().height;
  ok(dock.y + dock.height <= vh + 1 && await p.isVisible('#product'), `${label}：下の追加欄とタブが画面内`);
  ok(errs.length === 0, `${label}：JSエラーなし ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
