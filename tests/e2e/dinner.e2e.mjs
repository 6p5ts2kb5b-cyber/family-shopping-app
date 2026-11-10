// 夕飯の献立のテスト（親のアプリで決める → 子ども用タブレットに1週間ぶん）。偽のFirebase。メニューはテスト用
// SHOTS=フォルダ を指定すると、スクリーンショットを保存
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
const ts = (s) => ({ seconds: s, nanoseconds: 0 });
const NOW = new Date(2026, 10, 10, 15, 0);     // 火曜 15:00
const ymd = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const day = (k) => { const d = new Date(NOW); d.setDate(d.getDate() + k); return ymd(d); };
const T = day(0);
const seed = (extra = {}) => ({
  shoppingItems: {}, shoppingFavorites: {}, familySchedules: {}, familyMembers: { 'wifeuid456789@example.com': { addedAt: 1 } },
  kidNotices: { a: { text: 'テストしゅくだい', targets: ['child1', 'child2', 'child3'], period: 'evening', repeat: 'daily', onDate: '', active: true, updatedAt: ts(1) } },
  kidTemplates: {}, kidSettings: {}, kidDevices: { tabT: { label: 'x', addedAt: ts(1), pairToken: 'x'.repeat(22) } },
  familySettings: { children: { child1: 'テ一', child2: 'テ二', child3: 'テ三' } },
  dinnerDishes: { d1: { name: 'テストカレー', order: 0 }, d2: { name: 'テストハンバーグ', order: 1 } },
  dinnerMenus: { [day(-20)]: { date: day(-20), dish: 'テスト昔のメニュー' } },
  ...extra,
});

// ---------------- 親のアプリ ----------------
const ctx = await b.newContext({ ...devices['iPhone 13'] });
await route(ctx);
const errs = [];
const pg = await ctx.newPage(); await pg.clock.setFixedTime(NOW);
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(BASE + 'app.html');
await pg.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'husbandUID123'); localStorage.setItem('fakeDB', JSON.stringify(d)); sessionStorage.setItem('nextUid', 'husbandUID123'); }, seed());
await pg.goto(BASE + 'app.html?x'); await pg.click('#login'); await pg.waitForTimeout(500);
const db = () => pg.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));

ok(await pg.isVisible('#dinnerCard') && (await pg.textContent('#dinnerToday')).includes('未定'), 'ホームに「今日の夕飯：未定」');
await pg.click('#dinnerToday');
ok(await pg.isVisible('#dinnerSheet'), 'タップで「夕飯の献立」が開く');
const rows = () => pg.$$eval('#dinnerWeek .drow', (x) => x.map((e) => e.textContent));
let r = await rows();
ok(r.length === 7 && r[0].includes('今日') && r.every((t) => t.includes('未定')), `1週間（7日）が並び、決めていない日は「未定」（${r.length}日）`);
ok((await pg.$$eval('#dishChips .dc > button:first-child', (x) => x.map((e) => e.textContent))).join() === 'テストカレー,テストハンバーグ', '作れるメニュー一覧から選べる');
if (SHOTS) await pg.screenshot({ path: `${SHOTS}/dinner-sheet.png` });
await pg.click('#dishChips button:has-text("テストカレー")'); await pg.waitForTimeout(300);
let d = await db();
ok(d.dinnerMenus[T]?.dish === 'テストカレー' && Object.keys(d.dinnerMenus[T]).sort().join() === 'date,dish' && d.dinnerMenus[T].date === T, '今日を「テストカレー」に（保存はルールどおり date・dish だけ）');
ok((await pg.getAttribute('#dinnerWeek .drow[aria-pressed=true]', 'data-date')) === day(1), '決めると 次の未定の日（あした）へ進む');
// 新しいメニューを足して あしたに
await pg.fill('#dishNew', '　テスト 焼きそば　'); await pg.click('#dishForm button'); await pg.waitForTimeout(300);
d = await db();
ok(d.dinnerMenus[day(1)]?.dish === 'テスト 焼きそば' && Object.values(d.dinnerDishes).some((x) => x.name === 'テスト 焼きそば' && x.order === 2), '新しいメニューは一覧に足して、その日の献立に');
await pg.fill('#dishNew', 'テストカレー'); await pg.click('#dishForm button'); await pg.waitForTimeout(300);
d = await db();
ok(Object.values(d.dinnerDishes).filter((x) => x.name === 'テストカレー').length === 1 && d.dinnerMenus[day(2)]?.dish === 'テストカレー', '一覧にあるメニューは二重に足さない（その日の献立には入る）');
// 未定にもどす
await pg.click(`#dinnerWeek .drow[data-date="${day(2)}"]`); await pg.click('#dinnerUnset'); await pg.waitForTimeout(300);
ok(!(await db()).dinnerMenus[day(2)] && (await pg.textContent(`#dinnerWeek .drow[data-date="${day(2)}"]`)).includes('未定'), '「未定にする」で もどせる');
// 次の週
await pg.click('#dinnerNext');
r = await rows();
ok(r.length === 7 && (await pg.getAttribute('#dinnerWeek .drow', 'data-date')) === day(7) && await pg.isEnabled('#dinnerPrev'), '「次の週」で その次の7日');
await pg.click('#dishChips button:has-text("テストハンバーグ")'); await pg.waitForTimeout(300);
ok((await db()).dinnerMenus[day(7)]?.dish === 'テストハンバーグ', '次の週の献立も決められる');
await pg.click('#dinnerPrev');
// 一覧の編集（消しても 決めた献立は のこる）
pg.on('dialog', (x) => x.accept());
await pg.click('#dishEdit');
await pg.click('#dishChips .dc:has-text("テストハンバーグ") .x'); await pg.waitForTimeout(300);
d = await db();
ok(!Object.values(d.dinnerDishes).some((x) => x.name === 'テストハンバーグ') && d.dinnerMenus[day(7)]?.dish === 'テストハンバーグ', '一覧から消せる（決めてある献立は消えない）');
await pg.click('#dinnerClose');
ok((await pg.textContent('#dinnerToday')).includes('テストカレー'), 'ホームの「今日の夕飯」が テストカレー に');
ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'スマホで はみ出さない');
if (SHOTS) await pg.screenshot({ path: `${SHOTS}/dinner-home.png` });
// ランダムで決める（候補を選ぶ／選ばないと全部から）
await pg.click('#openDinner');
await pg.click(`#dinnerWeek .drow[data-date="${day(4)}"]`);
await pg.click('#dinnerRandom');
ok((await pg.textContent('#dinnerHint')).includes('えらばないと 全部'), 'ランダム：候補を選ぶ画面（選ばないと全部から）');
await pg.click('#dishChips button:has-text("テストカレー")');
ok(await pg.getAttribute('#dishChips .dc.cand > button', 'aria-pressed') === 'true' && (await pg.textContent('#dinnerGo')) === 'この中からランダム', '候補を選ぶと ✓ がつく');
await pg.click('#dinnerGo'); await pg.waitForTimeout(2500);
ok((await db()).dinnerMenus[day(4)]?.dish === 'テストカレー' && (await pg.textContent('#toastText')).includes('ランダムで'), 'ランダムで決まり、その日の献立に保存（候補1つならそれ）');
await pg.click(`#dinnerWeek .drow[data-date="${day(5)}"]`);
await pg.click('#dinnerRandom'); await pg.click('#dinnerGo'); await pg.waitForTimeout(2500);
const r5 = (await db()).dinnerMenus[day(5)]?.dish;
ok(['テストカレー', 'テスト 焼きそば'].includes(r5), `候補を選ばないと 一覧の全部から（${r5}）`);
// 投票
await pg.click(`#dinnerWeek .drow[data-date="${day(6)}"]`);
await pg.click('#dinnerVoteStart');
await pg.click('#dinnerGo');
ok(await pg.isHidden('#dinnerVote'), '候補が1つ以下では 投票を はじめない');
await pg.click('#dishChips button:has-text("テストカレー")'); await pg.click('#dishChips button:has-text("テスト 焼きそば")');
await pg.click('#dinnerGo');
ok(await pg.isVisible('#dinnerVote') && (await pg.$$eval('#dvList .dvc', (x) => x.length)) === 2, '投票：候補2つの投票画面');
ok((await pg.$$eval('#dvVoters button', (x) => x.map((e) => e.textContent))).length === 5 && await pg.getAttribute('#dvVoters button[data-v=husband]', 'aria-pressed') === 'true', '5人（夫・妻・子ども3人）。はじめは夫の番');
const vote = (i) => pg.click(`#dvList .dvc >> nth=${i}`);
await vote(1); await vote(1); await vote(0); await vote(1); await vote(0);
ok((await pg.$$eval('#dvList .dvc .ct', (x) => x.map((e) => e.textContent))).join() === '2票,3票' && (await pg.textContent('#dvMsg')).includes('みんな 投票しました'), `票が数えられ、全員おわると案内（${(await pg.$$eval('#dvList .dvc .ct', (x) => x.map((e) => e.textContent))).join('・')}）`);
await pg.click('#dvVoters button[data-v=child2]'); await vote(0);
ok((await pg.$$eval('#dvList .dvc .ct', (x) => x.map((e) => e.textContent))).join() === '3票,2票', '人を選びなおすと 投票を変えられる');
await pg.click('#dvDecide'); await pg.waitForTimeout(800);
ok((await db()).dinnerMenus[day(6)]?.dish === 'テストカレー' && (await pg.textContent('#toastText')).includes('投票で') && await pg.isHidden('#dinnerVote'), '「けっかで決める」で いちばん多いメニューに');
await pg.click('#dinnerClose');

// 予定（カレンダー）の画面でも夕飯が分かる
await pg.click('.tabs button[data-tab=schedule]');
await pg.click('.seg4 button[data-view=week]'); await pg.waitForTimeout(200);
const wk = await pg.$$eval('#scheduleBody .wrow .dn', (x) => x.map((e) => e.textContent));
ok(wk.length === 7 && wk.some((t) => t === '🍚 夕飯：テストカレー') && wk.some((t) => t === '🍚 夕飯：未定'), `週間：7日すべてに夕飯（決まっていない日は未定）（${wk.join('／')}）`);
if (SHOTS) await pg.screenshot({ path: `${SHOTS}/dinner-week.png` });
await pg.click('.seg4 button[data-view=today]'); await pg.waitForTimeout(200);
ok((await pg.textContent('#scheduleBody .ddin')).includes('テストカレー'), '今日の画面：「🍚 夕飯 テストカレー」');
await pg.click('.seg4 button[data-view=tomorrow]'); await pg.waitForTimeout(200);
ok((await pg.textContent('#scheduleBody .ddin')).includes('テスト 焼きそば'), '明日の画面：「🍚 夕飯 テスト 焼きそば」');
await pg.click('#scheduleBody .ddin');
ok(await pg.isVisible('#dinnerSheet') && (await pg.getAttribute('#dinnerWeek .drow[aria-pressed=true]', 'data-date')) === day(1), '夕飯の行を押すと その日を選んだ献立が開く');
await pg.click('#dinnerClose');
ok(errs.length === 0, '親：エラーなし ' + errs.join(' / '));
const finalDB = await db();
await ctx.close();

// 妻も決められる
{
  const c = await b.newContext({ ...devices['iPhone 13'] }); await route(c);
  const p = await c.newPage(); await p.clock.setFixedTime(NOW);
  await p.goto(BASE + 'app.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'husbandUID123'); localStorage.setItem('fakeDB', JSON.stringify(d)); sessionStorage.setItem('nextUid', 'wifeUID456789'); }, finalDB);
  await p.goto(BASE + 'app.html?x'); await p.click('#login'); await p.waitForTimeout(500);
  await p.click('#openDinner'); await p.click(`#dinnerWeek .drow[data-date="${day(3)}"]`); await p.click('#dishChips button:has-text("テストカレー")'); await p.waitForTimeout(300);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')))).dinnerMenus[day(3)]?.dish === 'テストカレー', '妻のアプリからも決められる');
  await c.close();
}
// ルールがまだ古いとき：献立のところに案内（ほかは ふつうに使える）
{
  const c = await b.newContext({ ...devices['iPhone 13'] }); await route(c);
  const p = await c.newPage(); await p.clock.setFixedTime(NOW);
  await p.goto(BASE + 'app.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'u1'); localStorage.setItem('fakeNoDinnerRules', '1'); localStorage.setItem('fakeDB', JSON.stringify(d)); sessionStorage.setItem('nextUid', 'u1'); }, seed());
  await p.goto(BASE + 'app.html?x'); await p.click('#login'); await p.waitForTimeout(500);
  ok(await p.isVisible('#dinnerRules') && await p.isVisible('#homeScreen'), 'ルールが古いと「ルールの更新が必要です」（ほかは使える）');
  await c.close();
}

// ---------------- 子ども用タブレット ----------------
for (const [label, vp] of [['iPad よこ', { width: 1180, height: 820 }], ['iPad たて', { width: 820, height: 1180 }], ['iPhone SE', { width: 375, height: 667 }]]) {
  const c = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); await route(c);
  const k = await c.newPage(); const kerr = []; k.on('pageerror', (e) => kerr.push(e.message));
  await k.clock.setFixedTime(new Date(2026, 10, 10, 17, 30));   // ゆうがた
  await k.goto(BASE + 'kids.html');
  await k.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabT'); }, finalDB);
  await k.reload(); await k.waitForSelector('#board .kid', { timeout: 10000 }); await k.waitForTimeout(600);
  const tabs = await k.$$eval('.tabs button', (x) => x.map((e) => e.textContent.trim()));
  ok(tabs.join() === 'でんごん,タイマー,ごはん,とうひょう', `${label}：「ごはん」のタブ（${tabs.join('・')}）`);
  ok(await k.isVisible('#tonight') && (await k.textContent('#tonight')).includes('テストカレー'), `${label}：ゆうがたの でんごんに「きょうの ゆうごはん：テストカレー」`);
  await k.click('.tabs button[data-tool=menu]');
  const cards = await k.$$eval('#menuWeek .mday', (x) => x.map((e) => e.textContent));
  ok(cards.length === 7 && cards[0] === 'きょうテストカレー' && cards[1] === 'あしたテスト 焼きそば' && cards[2].includes('みてい') && cards[3].includes('みてい') && cards[4].includes('テストカレー') && cards[6].includes('テストカレー'), `${label}：1しゅうかん（7日）。きまっていない日は「みてい」（${cards.slice(0, 4).join('／')}）`);
  ok(!cards.some((t) => t.includes('テストハンバーグ')) && !cards.some((t) => t.includes('昔')), `${label}：7日より先・過去の献立は出ない`);
  ok(await k.$eval('#menuWeek .mday', (e) => e.classList.contains('today')), `${label}：きょうが めだつ`);
  const lay = await k.evaluate(() => ({ noH: document.documentElement.scrollWidth <= innerWidth, tabH: Math.min(...[...document.querySelectorAll('.tabs button')].map((x) => x.getBoundingClientRect().height)),
    fit: [...document.querySelectorAll('.tabs button')].every((x) => x.scrollWidth <= x.clientWidth + 1), dish: parseFloat(getComputedStyle(document.querySelector('.mday .dish')).fontSize) }));
  ok(lay.noH && lay.tabH >= 48 && lay.fit && lay.dish >= 20, `${label}：はみ出さず、タブ（${Math.round(lay.tabH)}px）と もじ（${lay.dish}px）が 大きい`);
  if (SHOTS && label !== 'iPhone SE') await k.screenshot({ path: `${SHOTS}/dinner-kids-${label === 'iPad よこ' ? 'land' : 'port'}.png` });
  // 朝は「きょうの ゆうごはん」の行を出さない
  await k.click('.tabs button[data-tool=notes]'); await k.click('.period button[data-p=morning]'); await k.waitForTimeout(200);
  ok(await k.isHidden('#tonight'), `${label}：あさは「きょうの ゆうごはん」を出さない`);
  ok(kerr.length === 0, `${label}：エラーなし ${kerr.join(' / ')}`);
  await c.close();
}
// タブレットは書けない・ルールが古いときは でんごんは ふつう
{
  const c = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); await route(c);
  const k = await c.newPage(); await k.clock.setFixedTime(new Date(2026, 10, 10, 17, 30));
  await k.goto(BASE + 'kids.html');
  await k.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeNoDinnerRules', '1'); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabT'); }, finalDB);
  await k.reload(); await k.waitForSelector('#board .kid', { timeout: 10000 }); await k.waitForTimeout(600);
  ok(await k.isVisible('#cols') && (await k.textContent('#cols')).includes('テストしゅくだい') && await k.isHidden('#tonight'), 'ルールが古くても でんごんは ふつうに出る');
  await k.click('.tabs button[data-tool=menu]');
  ok(await k.isVisible('#menuNote') && (await k.textContent('#menuNote')).includes('ルール'), '「ごはん」には おうちの人への案内');
  ok((await k.$$('#toolMenu button')).length === 0, 'タブレットの「ごはん」には ボタンが ない（見るだけ）');
  await c.close();
}
await b.close();
