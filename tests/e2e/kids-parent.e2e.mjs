// 親の画面（app.html の「伝言」タブ・家族タブ）と、QR によるタブレット登録のテスト（偽のFirebase。名前・伝言はテスト用）
// SHOTS=フォルダ を指定するとスクリーンショットを保存
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const BASE = 'http://localhost:8790/';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const NOW = new Date(2026, 9, 15, 20, 30); // 木曜の夜
const TODAY = ymd(NOW), TOMORROW = ymd(new Date(2026, 9, 16));
const OLD = ymd(new Date(2026, 9, 5)), RECENT = ymd(new Date(2026, 9, 12));
const ts = (s) => ({ seconds: s, nanoseconds: 0 });
const route = (ctx) => ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const seed = () => ({
  shoppingItems: { m: { name: 'テスト牛乳', quantity: 1, done: false, createdAt: 1, doneAt: null } },
  shoppingFavorites: {}, familyMembers: { 'wifeuid0002@example.com': { addedAt: 1 } },
  familySchedules: { s: { date: TODAY, who: 'child1', name: 'テスト習い事', departure: '16:00', returnTime: '' } },
  kidNotices: {
    daily: { text: 'テスト毎日の伝言', targets: ['child1', 'child2', 'child3'], period: 'morning', repeat: 'daily', onDate: '', active: true, updatedAt: ts(10) },
    old: { text: 'テスト古い今日だけ', targets: ['child1'], period: 'morning', repeat: 'once', onDate: OLD, active: true, updatedAt: ts(11) },
    recent: { text: 'テスト最近の今日だけ', targets: ['child1'], period: 'morning', repeat: 'once', onDate: RECENT, active: true, updatedAt: ts(12) },
  },
  kidTemplates: {}, kidSettings: {},
});
const DB = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
async function login(p, uid) {
  await p.evaluate((u) => sessionStorage.setItem('nextUid', u), uid);
  if (await p.isVisible('#login')) await p.click('#login');
  await p.waitForTimeout(500);
}

// ================= 管理者（iPhone 13） =================
{
  const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
  await route(ctx);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  let dialogAnswer = null; p.on('dialog', (d) => d.type() === 'prompt' ? d.accept(dialogAnswer ?? '') : d.accept());
  await p.clock.setFixedTime(NOW);
  await p.goto(BASE + 'app.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'ownerUid1'); localStorage.setItem('fakeDB', JSON.stringify(d)); }, seed());
  await p.reload(); await login(p, 'ownerUid1');

  // ---- 4つのタブ ----
  const tabs = await p.$$eval('.tabs button', (x) => x.map((e) => e.textContent.trim()));
  ok(tabs.join() === '今日,予定,伝言,家族', `下のタブは 今日｜予定｜伝言｜家族（${tabs.join('｜')}）`);
  const old = (await DB(p)).kidNotices;
  ok(!old.old && old.recent && old.daily, '7日より前の「今日だけ」は自動で片付け、最近のもの・毎日の伝言は残す');

  // ---- 呼び名（Firebaseの家族設定） ----
  await p.click('.tabs button[data-tab=family]');
  ok(await p.isVisible('#namesMissing'), '呼び名が未設定なら、家族タブで入力を促す');
  ok(await p.isVisible('#devicesPanel'), '管理者には「子ども用タブレット」の欄が出る');
  for (const [k, v] of [['husband', 'テスト夫'], ['wife', 'テスト妻'], ['child1', 'テ一'], ['child2', 'テ二'], ['child3', 'テ三']]) await p.fill('#nm_' + k, v);
  await p.click('#namesForm button'); await p.waitForTimeout(300);
  const fs1 = (await DB(p)).familySettings;
  ok(fs1?.parents?.husband === 'テスト夫' && fs1?.children?.child3 === 'テ三', '呼び名を家族設定に保存');
  ok(await p.isHidden('#namesMissing'), '保存後は入力のお願いが消える');
  await p.click('.tabs button[data-tab=schedule]');
  ok((await p.$$eval('#quickWho button', (x) => x.map((e) => e.textContent))).join() === 'テスト夫,テスト妻,テ一,テ二,テ三,家族', '予定の「誰の予定」にも呼び名が反映');
  await p.fill('#quickText', '明日 テ二 テスト水泳'); await p.waitForTimeout(200);
  ok(await p.getAttribute('#quickWho button[data-v=child2]', 'aria-pressed') === 'true', '予定の文章入力でも呼び名を読み取る');
  await p.fill('#quickText', '');

  // ---- 伝言タブ ----
  await p.click('.tabs button[data-tab=notes]');
  ok(await p.isVisible('#notesScreen') && await p.isHidden('#add'), '伝言タブが開く（買い物の追加欄は出ない）');
  ok(await p.isHidden('#notesRules'), 'ルールが新しければ注意は出ない');
  ok(await p.getAttribute('[data-nper=evening]', 'aria-selected') === 'true', '夜（20:30）に開くと「夕方」から');
  await p.click('[data-nper=morning]');
  const names = await p.$$eval('#notesBoard .kidcard h3', (x) => x.map((e) => e.textContent));
  ok(names.join() === 'テ一,テ二,テ三', `3人分の伝言を確認できる（${names.join()}）`);
  ok((await p.textContent('#notesBoard')).includes('テスト毎日の伝言'), '今日の朝の伝言が出る');

  // 定型文
  await p.click('#tplSeed'); await p.waitForTimeout(300);
  let tpls = Object.values((await DB(p)).kidTemplates);
  ok(tpls.length === 8 && tpls.some((t) => t.text === '水筒を持ってね'), '「例を入れる」で定型文8つ（固定ではなく普通のデータ）');
  await p.fill('#tplText', 'テスト定型文A'); await p.click('#tplForm button'); await p.waitForTimeout(300);
  ok((await p.$$eval('#tplList .tpl span', (x) => x.map((e) => e.textContent))).at(-1) === 'テスト定型文A', '定型文を追加（最後に並ぶ）');
  await p.click('#tplList .tpl:last-child button[aria-label=上へ]'); await p.waitForTimeout(300);
  const order = await p.$$eval('#tplList .tpl span', (x) => x.map((e) => e.textContent));
  ok(order.at(-2) === 'テスト定型文A', '定型文の並べ替え');
  await p.click('.tabs button[data-tab=notes]');

  // 伝言を追加：定型文をタップ → 1人だけ・朝・明日だけ
  await p.click('#noteAdd');
  ok(await p.isVisible('#noteSheet') && await p.isDisabled('#noteSave'), '追加シートが開き、空のままでは保存できない');
  await p.click('#noteTpls button:has-text("水筒を持ってね")');
  ok(await p.inputValue('#noteText') === '水筒を持ってね' && await p.isEnabled('#noteSave'), '定型文をタップすると入力欄に入る');
  await p.click('#noteWho button[data-v=all]');
  ok(await p.isDisabled('#noteSave') && (await p.textContent('#noteWarn')).includes('だれに'), '相手を選ばないと保存できない');
  await p.click('#noteWho button[data-v=child1]');
  await p.click('#notePer button[data-v=morning]');
  await p.click('#noteRep button[data-v=tomorrow]');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/parent-note-sheet.png` });
  await p.click('#noteSave'); await p.waitForTimeout(300);
  let n = Object.entries((await DB(p)).kidNotices).find(([, v]) => v.text === '水筒を持ってね');
  ok(n && n[1].targets.join() === 'child1' && n[1].period === 'morning' && n[1].repeat === 'once' && n[1].onDate === TOMORROW && n[1].active === true && n[1].updatedAt?.seconds > 0 && Object.keys(n[1]).sort().join() === 'active,onDate,period,repeat,targets,text,updatedAt', '「明日だけ」を夜に登録：翌日の日付・ルールどおりの7項目で保存');
  ok(await p.getAttribute('[data-nday=tomorrow]', 'aria-selected') === 'true' && (await p.textContent('#notesBoard .kidcard[data-child=child1]')).includes('水筒を持ってね') && !(await p.textContent('#notesBoard .kidcard[data-child=child2]')).includes('水筒を持ってね'), '保存後は明日の朝に切り替わり、選んだ子だけに出る');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/parent-notes.png` });

  // 2人あて・夕方・平日だけ、定型文にも保存
  await p.click('#noteAdd');
  await p.fill('#noteText', 'テスト2人への夕方の伝言');
  await p.click('#noteWho button[data-v=child1]');
  await p.click('#notePer button[data-v=evening]');
  await p.click('#noteRep button[data-v=weekdays]');
  await p.check('#noteSaveTpl');
  await p.click('#noteSave'); await p.waitForTimeout(300);
  const d2 = await DB(p);
  n = Object.values(d2.kidNotices).find((v) => v.text === 'テスト2人への夕方の伝言');
  ok(n && n.targets.join() === 'child2,child3' && n.repeat === 'weekdays' && n.onDate === '' && n.period === 'evening', '2人あて・夕方・平日だけ');
  ok(Object.values(d2.kidTemplates).some((t) => t.text === 'テスト2人への夕方の伝言'), '「定型文にも保存」');

  // 編集：文面を直すと更新版が変わる（タブレットのチェックが外れる）
  await p.click('[data-nday=tomorrow]'); await p.click('[data-nper=morning]');
  const before = Object.entries((await DB(p)).kidNotices).find(([, v]) => v.text === '水筒を持ってね');
  await p.click('#notesBoard .nrow:has-text("水筒を持ってね")');
  ok(await p.textContent('#noteTitle') === '伝言を直す' && await p.getAttribute('#noteRep button[data-v=tomorrow]', 'aria-pressed') === 'true', '伝言を押すと編集（繰り返しも元のまま）');
  await p.clock.setFixedTime(new Date(NOW.getTime() + 5000));
  await p.fill('#noteText', '水筒とハンカチを持ってね'); await p.click('#noteSave'); await p.waitForTimeout(300);
  const after = (await DB(p)).kidNotices[before[0]];
  ok(after.text === '水筒とハンカチを持ってね' && after.updatedAt.seconds > before[1].updatedAt.seconds, '文面を直すと更新版（updatedAt）が新しくなる');
  // 定型文の変更は登録済みの伝言を変えない
  dialogAnswer = 'テスト直した定型文';
  await p.click('#tplList .tpl:has-text("水筒を持ってね") button:has-text("直す")'); await p.waitForTimeout(300);
  ok((await DB(p)).kidNotices[before[0]].text === '水筒とハンカチを持ってね' && Object.values((await DB(p)).kidTemplates).some((t) => t.text === 'テスト直した定型文'), '定型文を直しても、登録済みの伝言は変わらない');
  // 削除と元に戻す
  await p.click('#notesBoard .nrow:has-text("水筒とハンカチ")');
  await p.click('#noteDelete'); await p.waitForTimeout(300);
  ok(!(await DB(p)).kidNotices[before[0]], '伝言を削除');
  await p.click('#toastUndo'); await p.waitForTimeout(300);
  ok((await DB(p)).kidNotices[before[0]]?.text === '水筒とハンカチを持ってね', '「元に戻す」で復活');

  // お休みモード・切り替え時刻
  await p.click('#pauseBtns button[data-pause=today]'); await p.waitForTimeout(300);
  ok((await DB(p)).kidSettings.board.pause === TODAY && (await p.textContent('#pauseState')).includes('今日はお休み'), '「今日だけお休み」＝今日の日付を保存（翌日は自動で解除）');
  await p.click('[data-nday=today]');
  ok(await p.isVisible('#notesPaused'), '親の画面にもお休み中と表示');
  await p.click('#pauseBtns button[data-pause=on]'); await p.waitForTimeout(300);
  ok((await DB(p)).kidSettings.board.pause === 'on', '「解除するまでお休み」');
  await p.click('#pauseBtns button[data-pause=""]'); await p.waitForTimeout(300);
  ok((await DB(p)).kidSettings.board.pause === '' && await p.isHidden('#notesPaused'), 'お休みを解除');
  await p.fill('#eveFrom', '15:00'); await p.click('#eveForm button'); await p.waitForTimeout(300);
  ok((await DB(p)).kidSettings.board.eveningFrom === '15:00', '夕方に切り替える時刻を保存');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '伝言タブで横にはみ出さない');

  // ---- QR でタブレットを登録 ----
  const kid = await ctx.newPage(); const kerrs = []; kid.on('pageerror', (e) => kerrs.push(e.message));
  await kid.clock.setFixedTime(NOW);
  await kid.evaluate(() => 0);
  await kid.goto(BASE + 'kids.html');
  await kid.evaluate(() => localStorage.setItem('nextAnonUid', 'tabletParent1'));
  await kid.reload(); await kid.waitForTimeout(600);
  const qr = await kid.getAttribute('#qr', 'data-url');
  const kidEmojis = (await kid.textContent('#emojis')).trim();
  ok(/#pair=tabletParent1\./.test(qr || ''), 'タブレットにQR');
  await p.goto(qr); await p.waitForTimeout(800);
  ok(!p.url().includes('#pair'), 'QRで開いたら、トークンはアドレス欄から消す');
  ok(await p.isVisible('#pairSheet') && await p.isVisible('#pairBody'), '管理者のスマホに登録の確認画面');
  const choices = await p.$$eval('#pairChoices button', (x) => x.map((e) => e.textContent));
  ok(choices.length === 4 && choices.filter((c) => c === kidEmojis).length === 1, `確認の絵：タブレットと同じ絵を4つから選ぶ（${kidEmojis}）`);
  ok(await p.isHidden('#pairConfirm') && !(await DB(p)).kidDevices?.tabletParent1, 'QRを読んだだけでは登録されない（絵を選び、登録を押す必要がある）');
  await p.click(`#pairChoices button:text-is("${kidEmojis}")`);
  ok(await p.isVisible('#pairConfirm'), '正しい絵を選ぶと登録ボタンが出る');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/parent-pair.png` });
  await p.fill('#pairLabel', 'テストのタブレット');
  await p.click('#pairOk'); await p.waitForTimeout(600);
  const d3 = await DB(p);
  ok(d3.kidDevices?.tabletParent1?.label === 'テストのタブレット' && !d3.kidPairRequests?.tabletParent1, '「登録する」で登録され、申請は消える（1回きり）');
  ok(await kid.isVisible('#board') && (await kid.textContent('.kid[data-child=child1] h2')).includes('テ一'), 'タブレットが自動で伝言画面になり、呼び名が出る');
  await p.click('.tabs button[data-tab=family]');
  ok((await p.textContent('#devList')).includes('テストのタブレット'), '家族タブに登録済みタブレットが出る');
  // 同じQRをもう一度開く（使用済み）
  await p.goto(qr); await p.waitForTimeout(800);
  ok((await p.textContent('#pairMsg')).includes('使用済み') && await p.isHidden('#pairBody'), '使用済みのQRは登録画面に進まない');
  await p.click('#pairClose');
  // 解除
  await p.click('.tabs button[data-tab=family]');
  await p.click('#devList button:has-text("解除")'); await p.waitForTimeout(600);
  ok(!(await DB(p)).kidDevices?.tabletParent1 && await kid.isVisible('#pair'), '解除するとタブレットは登録画面に戻る');
  // 違う絵を選ぶと登録しない
  await kid.waitForTimeout(800);
  const qr2 = await kid.getAttribute('#qr', 'data-url');
  const kidEmojis2 = (await kid.textContent('#emojis')).trim();
  await p.goto(qr2); await p.waitForTimeout(800);
  const wrong = (await p.$$eval('#pairChoices button', (x) => x.map((e) => e.textContent))).find((c) => c !== kidEmojis2);
  await p.click(`#pairChoices button:text-is("${wrong}")`); await p.waitForTimeout(300);
  ok(await p.isHidden('#pairSheet') && !(await DB(p)).kidDevices?.tabletParent1, '違う絵を選ぶと登録しない');
  // 期限切れ（11分後）
  await p.clock.setFixedTime(new Date(NOW.getTime() + 11 * 60 * 1000));
  await p.goto(qr2); await p.waitForTimeout(800);
  ok((await p.textContent('#pairMsg')).includes('期限') && await p.isHidden('#pairBody'), '10分を過ぎたQRは期限切れ');
  ok(errs.length === 0 && kerrs.length === 0, `JSエラーなし ${[...errs, ...kerrs].join(' | ')}`);
  await ctx.close();
}

// ================= 配偶者（名簿のアカウント）・未ログイン =================
{
  const ctx = await b.newContext(devices['iPhone SE']);
  await route(ctx);
  const kid = await ctx.newPage();
  await kid.goto(BASE + 'kids.html');
  await kid.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'ownerUid1'); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabletWife1'); }, seed());
  await kid.reload(); await kid.waitForTimeout(600);
  const qr = await kid.getAttribute('#qr', 'data-url');
  const p = await ctx.newPage();
  await p.goto(qr); await p.waitForTimeout(500);
  ok(await p.isVisible('#login') && (await p.textContent('#status')).includes('タブレットの登録'), '未ログインでQRを開くと、ログイン後に登録へ進むと案内');
  await login(p, 'wifeUid0002'); await p.waitForTimeout(400);
  ok((await p.textContent('#pairMsg')).includes('管理者だけ') && await p.isHidden('#pairBody'), '配偶者のアカウントでは登録できない（管理者だけ）');
  await p.click('#pairClose');
  ok(await p.isHidden('#devicesPanel'), '配偶者には「子ども用タブレット」の欄を出さない');
  // 配偶者も伝言は書ける（ルールでも許可）
  await p.click('.tabs button[data-tab=notes]');
  const tabW = await p.$$eval('.tabs button', (x) => Math.min(...x.map((e) => e.getBoundingClientRect().width)));
  ok(tabW >= 60 && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `iPhone SE：4つのタブが収まる（最小 ${Math.round(tabW)}px）`);
  await p.click('#noteAdd'); await p.fill('#noteText', 'テスト妻からの伝言'); await p.click('#noteSave'); await p.waitForTimeout(300);
  ok(Object.values((await DB(p)).kidNotices).some((v) => v.text === 'テスト妻からの伝言'), '配偶者も伝言を追加できる');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'iPhone SE：伝言タブで横にはみ出さない');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/parent-notes-se.png`, fullPage: true });
  await ctx.close();
}

// ================= ルールが古いまま／PC =================
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await route(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE + 'app.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'ownerUid1'); localStorage.setItem('fakeDB', JSON.stringify(d)); }, seed());
  await p.reload(); await login(p, 'ownerUid1');
  await p.click('.tabs button[data-tab=notes]');
  const v = await p.$eval('#notesScreen .col-view', (e) => e.getBoundingClientRect()), f = await p.$eval('#notesScreen .col-form', (e) => e.getBoundingClientRect());
  ok(v.x + v.width <= f.x && Math.abs(v.y - f.y) < 4, 'PC：伝言は左、定型文・設定は右の2列');
  await p.evaluate(() => localStorage.setItem('fakeNoKidRules', '1'));
  await p.reload(); await login(p, 'ownerUid1');
  ok(await p.isVisible('#homeScreen') && (await p.textContent('#todo')).includes('テスト牛乳'), 'ルールが古いままでも、買い物・予定はいつもどおり使える');
  await p.click('.tabs button[data-tab=notes]');
  ok(await p.isVisible('#notesRules'), 'ルールが古いままなら、伝言タブに「ルールの更新が必要」と表示');
  await p.click('.tabs button[data-tab=schedule]');
  ok((await p.$$eval('#quickWho button', (x) => x.map((e) => e.textContent))).join() === '夫,妻,子ども1,子ども2,子ども3,家族', '呼び名が読めないときは既定の呼び名');
  await ctx.close();
}
await b.close();
