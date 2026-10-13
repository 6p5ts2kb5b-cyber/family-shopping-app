// 段階3（今日／明日／週末／週間・帯グラフ・期間だけ読む方式）と、夫婦2台の同時操作のテスト
// 偽のFirebaseで2台を再現（本物のFirebaseには接続しない）
// 実行：python3 -m http.server 8790 &  →  node tests/e2e/stage3.e2e.mjs
import { chromium, devices } from 'playwright';
import fs from 'fs';
import { weekendOf, weekOf, toYmd, addDays } from '../../lib/schedule-views.js';

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

const now = new Date();
const W0 = weekendOf(now, 0), W1 = weekendOf(now, 1);
const TODAY = toYmd(now);
const pastWeek = weekOf(now, -4);
const ev = (date, who, name, departure = '', returnTime = '') => ({ date, who, name, departure, returnTime });
const sched = {
  t1: ev(TODAY, 'husband', '出勤', '07:30', '19:00'),
  s1: ev(W0.sat, 'husband', '野球大会', '06:00', '17:00'),
  s2: ev(W0.sat, 'wife', '美容院', '10:00', '12:00'),
  s3: ev(W0.sat, 'wife', 'ランチ', '11:30', '14:00'),
  s4: ev(W0.sat, 'family', '実家で夕食', '18:00', '21:00'),
  s5: ev(W0.sat, 'husband', '洗車'),
  u1: ev(W0.sun, 'family', 'まとめ買い', '10:00', '12:00'),
  n1: ev(W1.sat, 'family', 'キャンプ', '08:00', '20:00'),
  p1: ev(pastWeek[2], 'wife', '先月の歯医者', '10:00', '11:00'),
};
// 去年の予定を200件（期間外なので読み込まれないはず）
for (let i = 0; i < 200; i++) sched['old' + i] = ev(`${now.getFullYear() - 1}-0${1 + (i % 9)}-1${i % 10}`, 'family', '去年の予定' + i, '09:00', '10:00');

const seed = await ctx.newPage();
await seed.goto(URL0);
await seed.evaluate((sched) => {
  localStorage.clear();
  localStorage.setItem('ownerUid', 'husbandUID123');
  localStorage.setItem('fakeDB', JSON.stringify({
    shoppingItems: { milk: { name: '牛乳', quantity: 1, done: false, createdAt: 1, doneAt: null } },
    shoppingFavorites: {}, familyMembers: { 'wifeuid456789@example.com': { addedAt: 1 } }, familySchedules: sched,
  }));
}, sched);
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
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
const A = await open('husbandUID123');
const B = await open('wifeUID456789');
const md = (ymd) => { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; };

// ---------- 4つの表示 ----------
await A.click('.tabs button[data-tab=schedule]');
ok((await A.$$eval('.seg4 button', (x) => x.map((y) => y.textContent))).join() === '今日,明日,週末,週間', '予定タブに 今日／明日／週末／週間');
ok((await A.textContent('#scheduleBody')).includes('出勤'), '今日の予定');
await A.click('.seg4 button[data-view=tomorrow]');
ok((await A.textContent('#scheduleBody h3')).startsWith('明日'), '明日の表示');

// ---------- 週末 ----------
await A.click('.seg4 button[data-view=weekend]');
const cards = A.locator('#scheduleBody .daycard');
ok(await cards.count() === 2, '週末は土日の2枚');
ok((await cards.nth(0).textContent()).includes(md(W0.sat)) && (await cards.nth(1).textContent()).includes(md(W0.sun)), '土曜・日曜の日付');
ok(await cards.nth(0).locator('button.ev').count() === 4 && (await cards.nth(0).locator('.more').textContent()).includes('ほか1件'), '5件の日は4件＋「すべて見る（ほか1件）」');
await cards.nth(0).locator('.more').click();
ok(await cards.nth(0).locator('button.ev').count() === 5, '「すべて見る」で全件');
const satText = await cards.nth(0).textContent();
ok(satText.includes('「ランチ」と時間が重なっています') && satText.includes('「美容院」と時間が重なっています'), '同じ人の重なりは注意表示');
ok(await cards.nth(0).locator('button.ev:has-text("野球大会") .ov').count() === 0 && await cards.nth(0).locator('button.ev:has-text("洗車") .ov').count() === 0, '夫と妻の重なり・時刻未定は注意なし');
ok(await cards.nth(0).locator('.tl .bar').count() === 4 && await cards.nth(0).locator('.tl .dot').count() === 0, '帯グラフ：出発〜帰宅がある4件を帯で表示（未定は描かない）');
ok((await cards.nth(0).locator('.tl .lane b').allTextContents()).join() === '義,祐,家族', '帯グラフは義・祐・家族の順');
ok((await A.getAttribute('#periodNav .wk >> nth=0', 'aria-pressed')) === 'true', '今週末が選択中');
await A.click('#periodNav .wk >> nth=1');
ok((await A.textContent('#scheduleBody')).includes('キャンプ') && (await A.getAttribute('#periodNav .wk >> nth=1', 'aria-pressed')) === 'true', '来週末に切り替え');
await A.click('#periodNav .arrow >> nth=0'); await A.click('#periodNav .arrow >> nth=0');
ok((await A.textContent('#scheduleBody')).includes('1週前の週末'), '‹で前の週末');
// スワイプ（左へ＝次）
const swipe = async (p, dx) => { const bx = await p.locator('#scheduleBody').boundingBox(); const x = bx.x + bx.width / 2, y = bx.y + 40; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300); };
await swipe(A, -150);
ok((await A.getAttribute('#periodNav .wk >> nth=0', 'aria-pressed')) === 'true', '左スワイプで次の週末（今週末に戻る）');

// ---------- 予定タップで編集 ----------
await A.click('#scheduleBody button.ev:has-text("まとめ買い")');
ok((await A.textContent('#hQuick')) === '予定を編集' && await A.inputValue('#quickName') === 'まとめ買い', '週末の予定タップで編集');
await A.click('#quickCancel');

// ---------- 日の「＋追加」 ----------
await A.click('#scheduleBody .daycard >> nth=1 >> button.link');
ok(await A.inputValue('#quickDate') === W0.sun && await A.evaluate(() => document.activeElement.id) === 'quickText', '日曜の「＋追加」で日付が入った状態');
await A.fill('#quickText', 'BBQ 10:00〜14:00');
await A.click('#quickWho button[data-v=family]');
await A.click('#quickSave'); await A.waitForTimeout(400);
const bbq = Object.values((await db(A)).familySchedules).find((x) => x.name === 'BBQ');
ok(bbq && bbq.date === W0.sun && bbq.who === 'family', 'その日に保存');
await B.click('.tabs button[data-tab=schedule]'); await B.click('.seg4 button[data-view=weekend]');
ok((await B.textContent('#scheduleBody .daycard >> nth=1')).includes('BBQ'), '相手の週末表示に反映');
await A.click('.seg4 button[data-view=weekend]');
await A.click('#scheduleBody .daycard >> nth=0 >> button.link');
await A.fill('#quickText', '11/3 野球大会');
ok((await A.textContent('#quickAsk')).includes('文章の日付は'), '別の日付が書かれていたら確認');
await A.click('#quickAsk button >> nth=1');
ok(await A.inputValue('#quickDate') === W0.sat, '「この日のまま」を選べる');
await A.fill('#quickText', ''); await A.click('#quickCancel').catch(() => {});

// ---------- 週間 ----------
await A.click('.seg4 button[data-view=week]');
const rows = A.locator('#scheduleBody .wrow');
ok(await rows.count() === 7 && (await rows.nth(0).locator('small').textContent()) === '月' && (await rows.nth(6).locator('small').textContent()) === '日', '週間は月〜日の7日');
ok(await A.locator('#scheduleBody .wrow.today').count() === 1, '今日の行を強調');
const satIdx = weekOf(now).indexOf(W0.sat);
ok((await rows.nth(satIdx).textContent()).includes('ほか2件'), '週間は1日3件＋ほか件数');
await rows.nth(satIdx).click();
ok(await A.locator('#scheduleBody .daycard button.ev').count() === 5 && (await A.textContent('#periodNav')).includes('週間に戻る'), '行タップでその日の全予定');
await A.click('#periodNav .back');
for (let i = 0; i < 4; i++) await A.click('#periodNav .arrow >> nth=0');
await A.waitForTimeout(400);
ok((await A.textContent('#scheduleBody')).includes('先月の歯医者'), '4週前（先月）の予定も見られる');
const maxRead = +(await A.evaluate(() => localStorage.getItem('fakeMaxSched')));
ok(maxRead > 0 && maxRead < 30, `表示期間の予定だけを読む（一度に最大${maxRead}件。去年の200件は読まない）`);
await A.reload(); await A.waitForTimeout(500); await A.click('.tabs button[data-tab=schedule]');
ok((await A.getAttribute('.seg4 button[data-view=week]', 'aria-selected')) === 'true', '前回の表示（週間）を覚えている');

// ---------- ホームの週末欄（常に土日を表示：ChatGPT 1767305 / 795aa07 の仕様） ----------
await A.click('.tabs button[data-tab=home]');
ok(await A.isVisible('#homeWeekend') && (await A.textContent('#hWk')).startsWith('今週末の予定'), 'ホームに今週末の欄が常に出る');
const wkText = await A.textContent('#homeWeekendList');
ok(wkText.includes('（土）') && wkText.includes('（日）'), '土曜・日曜の両方が並ぶ');
ok(await A.locator('#homeWeekendList button.link:has-text("＋ 追加")').count() === 2, '土日それぞれに「＋ 追加」');
ok(wkText.includes('野球大会') && wkText.includes('ほか'), '予定が多い日は3件＋「ほかN件を見る」');
await A.click('#homeWeekendList button.link >> nth=1');
ok(await A.isVisible('#scheduleScreen') && await A.inputValue('#quickDate') === W0.sun, '日曜の「＋ 追加」で日付入りの入力欄へ');
await A.click('#quickCancel').catch(() => {});
await A.fill('#quickText', ''); 

// ---------- 夫婦2台の同時操作 ----------
// 1) 予定の削除→相手が同じ予定を保存し直した→元に戻すは上書きしない
await A.click('.tabs button[data-tab=home]'); await B.click('.tabs button[data-tab=home]');
await B.click('#todaySchedule button.ev:has-text("出勤")');           // 妻が先に編集画面を開いておく
await A.click('#todaySchedule button.ev:has-text("出勤")');
await A.click('#quickDelete'); await A.waitForTimeout(300);
ok(!(await db(A)).familySchedules.t1, '夫が予定を削除');
await B.fill('#quickReturn', '20:00'); await B.click('#quickSave'); await B.waitForTimeout(300);
ok((await db(A)).familySchedules.t1?.returnTime === '20:00', '妻が編集画面から保存（同じIDで作り直し）');
await A.click('#toastUndo'); await A.waitForTimeout(400);
ok((await db(A)).familySchedules.t1?.returnTime === '20:00' && (await A.textContent('#toastText')).includes('上書きしませんでした'), '夫の「元に戻す」は妻の保存を上書きしない');

// 2) 同時に＋を押す（読み取り→書き込みの間に相手が更新→やり直して両方反映）
await A.click('.tabs button[data-tab=home]'); await B.click('.tabs button[data-tab=home]');
await A.evaluate(() => { localStorage.setItem('fakeTxDelay', '300'); localStorage.setItem('fakeTxRetries', '0'); });
await Promise.all([A.click('#todo li:has-text("牛乳") .stepper button >> nth=1'), B.click('#todo li:has-text("牛乳") .stepper button >> nth=1')]);
await A.waitForTimeout(1500);
ok((await db(A)).shoppingItems.milk.quantity === 3, '同時に＋を押しても2つとも反映（1→3）');

// 3) 同時に同じ商品を追加 → 1つだけ
await A.fill('#product', '納豆'); await B.fill('#product', '納豆');
await Promise.all([A.press('#product', 'Enter'), B.press('#product', 'Enter')]);
await A.waitForTimeout(1500);
const natto = Object.values((await db(A)).shoppingItems).filter((x) => x.name === '納豆');
ok(natto.length === 1 && natto[0].quantity === 1, '同時に同じ商品を追加しても1つだけ');
ok(+(await A.evaluate(() => localStorage.getItem('fakeTxRetries'))) >= 1, '同時追加の衝突を検知してやり直した（トランザクション）');

// 4) 夫が購入済みにする／妻が＋ を同時に → 両方反映
const tap = (p, sel) => p.evaluate((sel) => { const li = [...document.querySelectorAll('#todo li')].find((x) => ['牛乳', '低脂肪牛乳'].includes(x.querySelector('.namebtn')?.textContent)); li.querySelector(sel).click(); }, sel);
// 妻の＋（読み取り→300ms待ち→書き込み）の途中で、夫が購入済みにする
await tap(B, '.stepper button:last-child'); await A.waitForTimeout(50); await tap(A, '.check');
await A.waitForTimeout(1500);
const milk = (await db(A)).shoppingItems.milk;
ok(milk.done === true && milk.quantity === 4, '購入済みと個数変更を同時にしても両方反映');

// 5) 夫が名前を変更／妻が＋ を同時に → 名前変更は個数を取り直してから行う
await B.evaluate(() => { const li = [...document.querySelectorAll('#done li')].find((x) => x.querySelector('.namebtn')?.textContent === '牛乳'); li.querySelector('.check').click(); }); await A.waitForTimeout(600);
await A.click('#todo button.namebtn:has-text("牛乳")'); await A.fill('#editName', '低脂肪牛乳');
// 妻の＋の途中で、夫が名前変更を保存
await tap(B, '.stepper button:last-child'); await A.waitForTimeout(50); await A.evaluate(() => document.getElementById('editSave').click());
await A.waitForTimeout(1800);
const items = Object.values((await db(A)).shoppingItems);
const low = items.find((x) => x.name === '低脂肪牛乳');
ok(low && !items.some((x) => x.name === '牛乳'), '同時操作でも名前変更後に古い商品が残らない');
ok(low && low.quantity === 5, '名前変更と同時に押された相手の＋も失われない（4→5）');
await A.evaluate(() => localStorage.setItem('fakeTxDelay', '0'));

const sw = await A.evaluate(() => document.documentElement.scrollWidth - innerWidth);
ok(sw <= 0, '横スクロールなし');
ok(errs.length === 0, 'JSエラーなし ' + errs.join('|'));
await b.close();
