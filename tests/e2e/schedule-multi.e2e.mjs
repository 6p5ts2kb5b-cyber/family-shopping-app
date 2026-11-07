// 予定の「誰の予定」を何人でも選べる（保存は1人1件・表示は1行にまとめる）のテスト
// 偽のFirebase。名前・予定はテスト用
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const URL0 = 'http://localhost:8790/app.html';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const errs = [];
// 平日の水曜に固定
const NOW = (() => { const d = new Date(); d.setHours(9, 0, 0, 0); while (d.getDay() !== 3) d.setDate(d.getDate() + 1); return d; })();
const ymd = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const DAY = new Date(NOW); DAY.setDate(DAY.getDate() + 5);      // 5日後（月曜）
const D = ymd(DAY), MD = `${DAY.getMonth() + 1}/${DAY.getDate()}`;

const seed = await ctx.newPage(); await seed.clock.setFixedTime(NOW);
await seed.goto(URL0);
await seed.evaluate(() => {
  localStorage.clear(); localStorage.setItem('ownerUid', 'husbandUID123');
  localStorage.setItem('fakeDB', JSON.stringify({ shoppingItems: {}, shoppingFavorites: {}, familyMembers: { 'wifeuid456789@example.com': { addedAt: 1 } }, familySchedules: {},
    familySettings: { children: { child1: 'テ一', child2: 'テ二', child3: 'テ三' } } }));
});
await seed.close();
const open = async (uid) => {
  const p = await ctx.newPage(); await p.clock.setFixedTime(NOW);
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL0); await p.evaluate((u) => sessionStorage.setItem('nextUid', u), uid);
  await p.goto(URL0 + '?x'); await p.click('#login'); await p.waitForTimeout(400);
  return p;
};
const A = await open('husbandUID123');
const db = () => A.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')).familySchedules);
const pressed = () => A.$$eval('#quickWho button[aria-pressed=true]', (x) => x.map((e) => e.dataset.v).join());
const W = (v) => A.click(`#quickWho button[data-v=${v}]`);

await A.click('.tabs button[data-tab=schedule]');
ok((await A.textContent('#whoLabel')).includes('何人でも'), '「誰の予定」に「何人でも選べます」');
await A.fill('#quickText', `${MD} テスト大会 7:00〜15:00`);
await W('child1'); await W('child2');
ok(await pressed() === 'child1,child2', '2人 選べる（子ども1・子ども2）');
ok((await A.textContent('#quickWarn')).includes('2人の予定として保存'), '「2人の予定として保存します」と出る');
await W('child2');
ok(await pressed() === 'child1', 'もう一度押すと はずれる');
await W('child2'); await W('family');
ok(await pressed() === 'family', '「家族」を選ぶと ほかは はずれる（家族＝全員）');
await W('child1');
ok(await pressed() === 'child1', '「家族」のあとで人を選ぶと「家族」は はずれる');
await W('child2');
ok(!(await A.isDisabled('#quickSave')), '2人で 保存できる');
await A.click('#quickSave'); await A.waitForTimeout(400);
let docs = Object.entries(await db()).filter(([, x]) => x.name === 'テスト大会');
ok(docs.length === 2 && docs.map(([, x]) => x.who).sort().join() === 'child1,child2'
  && docs.every(([, x]) => x.date === D && x.departure === '07:00' && x.returnTime === '15:00' && Object.keys(x).sort().join() === 'date,departure,name,returnTime,who'),
  '保存は1人1件（ルールどおりの5項目）');
// 表示は1行
const rows = A.locator('#scheduleBody button.ev:has-text("テスト大会")');
ok(await rows.count() === 1 && (await rows.first().locator('.tag').allTextContents()).join() === 'テ一,テ二', `1行にまとめて「テ一・テ二」の2つの札（${(await rows.first().locator('.tag').allTextContents()).join('・')}）`);
ok((await rows.first().getAttribute('aria-label')).includes('テ一・テ二'), '読み上げも「テ一・テ二」');
ok(await A.locator('#scheduleBody .ov').count() === 0, '同じ予定の2人を「重なり」と出さない');


// 文章に2人書いたら 2人とも選ばれる
await A.fill('#quickText', '明日 夫 妻 テスト買い物');
ok(await pressed() === 'husband,wife', '文章に「夫 妻」→ 2人とも選ばれる');
await A.fill('#quickText', `${MD} テスト練習（テ一、テ二）7:00〜15:00`);
ok(await pressed() === 'child1,child2', `「（テ一、テ二）」と書いても 2人とも選ばれる（予定内容：${await A.inputValue('#quickName')}）`);
await A.fill('#quickText', '');

// 編集：テ二をはずして テ三を足す（テ一はそのまま上書き）
const idsBefore = Object.fromEntries(docs.map(([id, x]) => [x.who, id]));
await rows.first().click();
ok(await pressed() === 'child1,child2' && (await A.textContent('#quickSave')) === '変更を保存', '1行をタップすると 2人とも選ばれた編集画面');
await W('child2'); await W('child3');
await A.click('#quickSave'); await A.waitForTimeout(400);
docs = Object.entries(await db()).filter(([, x]) => x.name === 'テスト大会');
const byWho = Object.fromEntries(docs.map(([id, x]) => [x.who, id]));
ok(docs.length === 2 && byWho.child1 === idsBefore.child1 && !byWho.child2 && byWho.child3 && byWho.child3 !== idsBefore.child2,
  '編集：残る人は同じ予定を上書き・はずした人は削除・足した人は追加');
// 時間を変えると 2人とも変わる
await A.locator('#scheduleBody button.ev:has-text("テスト大会")').first().click();
await A.fill('#quickReturn', '16:00'); await A.click('#quickSave'); await A.waitForTimeout(400);
docs = Object.entries(await db()).filter(([, x]) => x.name === 'テスト大会');
ok(docs.length === 2 && docs.every(([, x]) => x.returnTime === '16:00'), '時間を直すと 2人とも直る');
ok(await A.locator('#scheduleBody button.ev:has-text("テスト大会")').count() === 1, '直したあとも1行');

// 削除→元に戻す（2人とも）
await A.locator('#scheduleBody button.ev:has-text("テスト大会")').first().click();
await A.click('#quickDelete'); await A.waitForTimeout(400);
ok(Object.values(await db()).filter((x) => x.name === 'テスト大会').length === 0, '削除すると 2人とも消える');
await A.click('#toastUndo'); await A.waitForTimeout(500);
docs = Object.entries(await db()).filter(([, x]) => x.name === 'テスト大会');
ok(docs.length === 2 && docs.map(([, x]) => x.who).sort().join() === 'child1,child3', '「元に戻す」で 2人とも もどる');

// 1人の予定は今までどおり
await A.fill('#quickText', `${MD} テスト歯医者 10:00〜11:00 妻`);
ok(await pressed() === 'wife', '1人の予定は今までどおり');
await A.click('#quickSave'); await A.waitForTimeout(400);
ok(Object.values(await db()).filter((x) => x.name === 'テスト歯医者').length === 1, '1人なら1件');
ok(errs.length === 0, 'エラーなし ' + errs.join(' / '));
await b.close();
