// 「休日のみ」（土・日だけ）の伝言のテスト：親の画面（iPhone SE / iPhone 13 / PC）と子ども用タブレット
// 偽のFirebase。名前・伝言はテスト用
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const BASE = 'http://localhost:8790/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const until = (page, sel) => page.waitForSelector(sel, { state: 'visible', timeout: 10000 }).catch(() => {});
const route = (ctx) => ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const ts = (s) => ({ seconds: s, nanoseconds: 0 });
const N = (text, o = {}) => ({ text, targets: ['child1', 'child2', 'child3'], period: 'morning', repeat: 'daily', onDate: '', active: true, updatedAt: ts(10), ...o });
const THU = new Date(2026, 9, 15, 7, 30), FRI = new Date(2026, 9, 16, 7, 30), SAT = new Date(2026, 9, 17, 7, 30), SUN = new Date(2026, 9, 18, 7, 30), MON = new Date(2026, 9, 19, 7, 30);
const seed = () => ({
  shoppingItems: {}, shoppingFavorites: {}, familyMembers: {}, familySchedules: {},
  kidNotices: {
    d: N('テスト毎日'), wd: N('テスト平日だけ', { repeat: 'weekdays' }),
    we: N('テスト休日のみ', { repeat: 'weekends', targets: ['child2'] }),
    o1: N('テスト今日だけ', { repeat: 'once', onDate: '2026-10-15' }),
  },
  kidTemplates: {}, kidSettings: {}, kidDevices: { tabletW: { label: 'x', addedAt: ts(1), pairToken: 'x'.repeat(22) } },
  familySettings: { children: { child1: 'テ一', child2: 'テ二', child3: 'テ三' }, parents: { husband: 'テスト夫', wife: 'テスト妻' } },
});
const DB = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
const board = (p) => p.textContent('#notesBoard');

// ================= 親の画面 =================
for (const [label, opts] of [['iPhone SE', devices['iPhone SE']], ['iPhone 13', devices['iPhone 13']], ['PC 1280', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await b.newContext(opts);
  await route(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.setFixedTime(THU);
  await p.goto(BASE + 'app.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'ownerUid1'); localStorage.setItem('fakeDB', JSON.stringify(d)); sessionStorage.setItem('nextUid', 'ownerUid1'); }, seed());
  await p.reload(); await p.click('#login'); await until(p, '#homeScreen');
  await p.click('.tabs button[data-tab=notes]'); await p.click('[data-nper=morning]');

  // 木曜：今日・明日（金）とも休日のみは出ない
  ok(!(await board(p)).includes('テスト休日のみ') && (await board(p)).includes('テスト平日だけ'), `${label}：木曜の今日は「休日のみ」を出さない（平日だけは出る）`);
  await p.click('[data-nday=tomorrow]');
  ok(!(await board(p)).includes('テスト休日のみ') && (await board(p)).includes('テスト平日だけ'), `${label}：明日（金）も「休日のみ」は出ない`);

  // くりかえしの並びと、狭い画面で崩れないこと
  await p.click('#noteAdd');
  const reps = await p.$$eval('#noteRep button:not([hidden])', (x) => x.map((e) => e.textContent));
  ok(reps.join() === '毎日,平日だけ,休日のみ,今日だけ,明日だけ', `${label}：くりかえしは 毎日・平日だけ・休日のみ・今日だけ・明日だけ の順（${reps.join('・')}）`);
  const fit = await p.$$eval('#noteRep button:not([hidden])', (x) => x.every((e) => { const r = e.getBoundingClientRect(); return r.height >= 44 && r.right <= innerWidth && e.scrollWidth <= e.clientWidth + 1; }));
  ok(fit && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}：ボタンが押しやすく、はみ出さない`);
  if (label === 'iPhone SE') await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/weekends-sheet-se.png` : '/dev/null' }).catch(() => {});

  // 保存
  await p.fill('#noteText', `テスト新しい休日の伝言${label}`);
  await p.click('#noteWho button[data-v=all]'); await p.click('#noteWho button[data-v=child1]');
  await p.click('#notePer button[data-v=morning]');
  await p.click('#noteRep button[data-v=weekends]');
  ok(await p.getAttribute('#noteRep button[data-v=weekends]', 'aria-pressed') === 'true' && await p.isEnabled('#noteSave'), `${label}：「休日のみ」を選べる`);
  await p.click('#noteSave'); await p.waitForTimeout(300);
  const saved = Object.entries((await DB(p)).kidNotices).find(([, v]) => v.text === `テスト新しい休日の伝言${label}`);
  ok(saved && saved[1].repeat === 'weekends' && saved[1].onDate === '' && saved[1].targets.join() === 'child1', `${label}：repeat=weekends・onDate なしで保存`);

  // 編集で選択が戻る：土曜にして「今日」に表示されるものを開く
  await p.clock.setFixedTime(SAT); await p.reload(); await until(p, '#homeScreen');
  await p.click('.tabs button[data-tab=notes]'); await p.click('[data-nper=morning]'); await p.click('[data-nday=today]');
  ok((await board(p)).includes(`テスト新しい休日の伝言${label}`) && (await board(p)).includes('テスト休日のみ') && !(await board(p)).includes('テスト平日だけ'), `${label}：土曜の今日は「休日のみ」を出し、「平日だけ」は出さない`);
  ok((await p.textContent(`#notesBoard .nrow:has-text("テスト新しい休日の伝言${label}") .r`)) === '休日のみ', `${label}：一覧の表示は「休日のみ」`);
  await p.click(`#notesBoard .nrow:has-text("テスト新しい休日の伝言${label}")`);
  ok(await p.getAttribute('#noteRep button[data-v=weekends]', 'aria-pressed') === 'true' && (await p.$$eval('#noteRep button[aria-pressed=true]', (x) => x.length)) === 1, `${label}：編集を開くと「休日のみ」が選ばれた状態`);
  await p.click('#noteRep button[data-v=weekdays]'); await p.click('#noteSave'); await p.waitForTimeout(300);
  ok((await DB(p)).kidNotices[saved[0]].repeat === 'weekdays', `${label}：編集で「平日だけ」に変えられる`);
  await p.click('[data-nday=tomorrow]');
  ok((await board(p)).includes('テスト休日のみ') && (await board(p)).includes('テスト毎日'), `${label}：土曜の明日（日）も「休日のみ」を出す`);

  // 金曜：明日（土）は出る、今日は出ない
  await p.clock.setFixedTime(FRI); await p.reload(); await until(p, '#homeScreen');
  await p.click('.tabs button[data-tab=notes]'); await p.click('[data-nper=morning]'); await p.click('[data-nday=today]');
  ok(!(await board(p)).includes('テスト休日のみ'), `${label}：金曜の今日は出ない`);
  await p.click('[data-nday=tomorrow]');
  ok((await board(p)).includes('テスト休日のみ') && !(await board(p)).includes('テスト平日だけ'), `${label}：金曜に「明日」を見ると土曜分として出る`);
  ok(errs.length === 0, `${label}：JSエラーなし ${errs.join(' | ')}`);
  await ctx.close();
}

// ================= 子ども用タブレット =================
{
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  await route(ctx);
  const k = await ctx.newPage(); const errs = []; k.on('pageerror', (e) => errs.push(e.message));
  await k.clock.setFixedTime(THU);
  await k.goto(BASE + 'kids.html');
  await k.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabletW'); }, seed());
  for (const [label, when, show] of [['木曜', THU, false], ['金曜', FRI, false], ['土曜', SAT, true], ['日曜', SUN, true], ['月曜', MON, false]]) {
    await k.clock.setFixedTime(when); await k.reload(); await until(k, '#board .kid');
    const c2 = await k.textContent('.kid[data-child=child2]'), c1 = await k.textContent('.kid[data-child=child1]');
    ok(c2.includes('テスト休日のみ') === show && !c1.includes('テスト休日のみ'), `タブレット ${label}：「休日のみ」は${show ? '出る' : '出ない'}（対象の子だけ）`);
    ok(c1.includes('テスト毎日') && c1.includes('テスト平日だけ') === !show, `タブレット ${label}：毎日は出る・平日だけは${show ? '出ない' : '出る'}`);
  }
  await k.clock.setFixedTime(THU); await k.reload(); await until(k, '#board .kid');
  ok((await k.textContent('.kid[data-child=child1]')).includes('テスト今日だけ'), 'タブレット：今日だけの伝言も今まで通り');
  ok(errs.length === 0, `タブレット：JSエラーなし ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
