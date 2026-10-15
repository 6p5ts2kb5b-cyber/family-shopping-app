// 家族の呼び名（Firebaseの家族設定）と子ども3人の予定のテスト（偽のFirebase。名前はテスト用）
// SHOTS=フォルダ を指定すると、スクリーンショットを保存
import { chromium, devices } from 'playwright';
import fs from 'fs';
import { toYmd, addDays } from '../../lib/schedule-views.js';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const URL0 = 'http://localhost:8790/app.html';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const T = toYmd(new Date()), TM = toYmd(addDays(new Date(), 1));
const ev = (date, who, name, departure = '', returnTime = '') => ({ date, who, name, departure, returnTime });
const SCHED = {
  a: ev(T, 'husband', 'テスト出勤', '07:30', '19:00'),
  b: ev(T, 'child2', 'テストスイミング', '16:00', '17:00'),
  c: ev(T, 'me', 'テスト旧データ', '20:00'),
  d: ev(T, 'family', 'テスト外食', '18:00'),
};

for (const [label, opts] of [['iPhone SE', devices['iPhone SE']], ['iPhone 13', devices['iPhone 13']], ['PC 1280', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await b.newContext(opts);
  await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
    const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL0);
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('ownerUid', 'u1'); localStorage.setItem('fakeDB', JSON.stringify({ shoppingItems: {}, shoppingFavorites: {}, familySchedules: s, familySettings: { parents: { husband: 'テスト夫', wife: 'テスト妻' }, children: { child1: 'テ一', child2: 'テ二', child3: 'テ三' } } })); sessionStorage.setItem('nextUid', 'u1'); }, SCHED);
  await p.goto(URL0 + '?k'); await p.click('#login'); await p.waitForTimeout(500);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
  const noH = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  const tags = await p.$$eval('#todaySchedule .tag', (x) => x.map((t) => t.textContent));
  ok(tags.join() === 'テスト夫,テ二,家族,テスト夫', `${label}：今日の予定は家族設定の呼び名で表示、旧「私」は夫（${tags.join()}）`);
  const col = await p.$eval('#todaySchedule button.ev.child2 .tag', (t) => getComputedStyle(t).color);
  ok(col === 'rgb(15, 94, 102)', `${label}：子ども2は専用の色`);
  ok(await noH(), `${label}：ホームで横スクロールなし`);

  await p.click('.tabs button[data-tab=schedule]');
  const btns = await p.$$eval('#quickWho button', (x) => x.map((t) => t.textContent));
  ok(btns.join() === 'テスト夫,テスト妻,テ一,テ二,テ三,家族', `${label}：誰の予定は家族設定の呼び名6つから選ぶ`);
  const fit = await p.$$eval('#quickWho button', (x) => x.every((t) => { const r = t.getBoundingClientRect(); return r.height >= 44 && r.right <= innerWidth; }));
  ok(fit && await noH(), `${label}：選ぶボタンが押しやすく、はみ出さない`);

  // 文章入力で子ども1の呼び名を読み取って保存
  await p.fill('#quickText', '明日 テ一 テストサッカー 9:00から12:00'); await p.waitForTimeout(200);
  ok(await p.getAttribute('#quickWho button[data-v=child1]', 'aria-pressed') === 'true' && await p.inputValue('#quickName') === 'テストサッカー', `${label}：文章の呼び名（子ども1）を読み取る`);
  await p.click('#quickSave'); await p.waitForTimeout(300);
  const s = Object.values((await db()).familySchedules).find((x) => x.name === 'テストサッカー');
  ok(s && s.who === 'child1' && s.date === TM && Object.keys(s).sort().join() === 'date,departure,name,returnTime,who', `${label}：child1 として5項目で保存`);
  ok((await p.textContent('#scheduleBody')).includes('テストサッカー') && await p.locator('#scheduleBody button.ev.child1 .tag').first().textContent() === 'テ一', `${label}：予定一覧に呼び名で表示`);
  if (SHOTS && label === 'iPhone 13') { await p.evaluate(() => { document.getElementById('quickWho').scrollIntoView({ block: 'center' }); }); await p.click('#quickWho button[data-v=child3]'); await p.screenshot({ path: `${SHOTS}/kids-form.png` }); await p.click('.tabs button[data-tab=home]'); await p.screenshot({ path: `${SHOTS}/kids-home.png` }); await p.click('.tabs button[data-tab=schedule]'); }

  // 編集で子ども3に変更
  await p.click('#scheduleBody button.ev:has-text("テストサッカー")');
  await p.click('#quickWho button[data-v=child3]'); await p.click('#quickSave'); await p.waitForTimeout(300);
  ok(Object.values((await db()).familySchedules).find((x) => x.name === 'テストサッカー')?.who === 'child3', `${label}：編集で子ども3に変更できる`);

  // 送る画面で子どもだけを選ぶ
  await p.click('#shareOpen'); await p.waitForTimeout(500);
  const sb = await p.$$eval('#shareWho button', (x) => x.map((t) => t.textContent));
  ok(sb.join() === 'すべて,テスト夫,テスト妻,テ一,テ二,テ三,家族' && await noH(), `${label}：送る画面でも全員から選べる`);
  await p.click('#shareWho button[data-v=child2]'); await p.waitForTimeout(300);
  const thisMonth = T.slice(0, 7) === TM.slice(0, 7);
  ok((await p.textContent('#shareInfo')).startsWith('1件'), `${label}：子ども2だけ＝1件`);
  if (thisMonth) { await p.click('#shareWho button[data-v=child3]'); await p.waitForTimeout(300); ok((await p.textContent('#shareInfo')).startsWith('1件'), `${label}：子ども3だけ＝1件`); }
  await p.click('#shareClose');
  // ルールが古いまま：分かる言葉で知らせ、入力は消さない
  await p.evaluate(() => localStorage.setItem('fakeOldRules', '1'));
  await p.fill('#quickText', '明日 テ二 テストプール'); await p.waitForTimeout(200);
  await p.click('#quickSave'); await p.waitForTimeout(300);
  ok((await p.textContent('body')).includes('ルールの更新が必要') && await p.inputValue('#quickName') === 'テストプール', `${label}：古いルールのときは「ルールの更新が必要」と表示し、入力は残る`);
  await p.evaluate(() => localStorage.removeItem('fakeOldRules'));
  ok(errs.length === 0, `${label}：JSエラーなし ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
