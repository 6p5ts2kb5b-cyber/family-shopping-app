// 子ども用タブレットの「タイマー」と「とうひょう」のテスト（タブレットの中だけで動く。偽のFirebase。名前はテスト用）
import { chromium } from 'playwright';
import fs from 'fs';
import { rotationOrder } from '../../lib/kid-tools.js';

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
const NAMES = { child1: 'テ一', child2: 'テ二', child3: 'テ三' };
const seed = () => ({
  shoppingItems: {}, shoppingFavorites: {}, familyMembers: {}, familySchedules: {},
  kidNotices: { d: { text: 'テスト毎日', targets: ['child1', 'child2', 'child3'], period: 'evening', repeat: 'daily', onDate: '', active: true, updatedAt: ts(1) } },
  kidTemplates: {}, kidSettings: {}, kidDevices: { tabletT: { label: 'x', addedAt: ts(1), pairToken: 'x'.repeat(22) } },
  familySettings: { children: NAMES },
});
const T0 = new Date(2026, 9, 20, 18, 0, 0).getTime();
const at = (ms) => new Date(T0 + ms);
const MIN = 60000;

const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
await route(ctx);
const k = await ctx.newPage(); const errs = []; k.on('pageerror', (e) => errs.push(e.message));
k.on('dialog', (d) => d.accept());
await k.clock.setFixedTime(at(0));
await k.goto(BASE + 'kids.html');
await k.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabletT'); }, seed());
await k.reload(); await until(k, '#board .kid');
const dbBefore = await k.evaluate(() => localStorage.getItem('fakeDB'));

// ---- 切り替え ----
const tabs = await k.$$eval('.tabs button', (x) => x.map((e) => e.textContent.trim()));
ok(tabs.join() === 'でんごん,タイマー,とうひょう', `でんごん・タイマー・とうひょうの切り替え（${tabs.join('・')}）`);
await k.click('.tabs button[data-tool=timer]');
ok(await k.isVisible('#toolTimer') && await k.isHidden('#toolNotes') && await k.isHidden('#toolVote'), 'タイマーに切り替わる');

// ---- 順番（日替わり） ----
const order = rotationOrder('2026-10-20').map((id) => NAMES[id]);
const orderText = async () => (await k.$$eval('#orderRow .who', (x) => x.map((e) => e.textContent.replace('✓ ', ''))));
ok((await orderText()).join() === order.join() && await k.isChecked('#orderMode'), `順番モード（はじめからオン）：きょうの順番 ${order.join('→')}`);
ok((await k.textContent('#tStart')).includes(order[0]), '1番の人のスタートボタン');

// ---- 時間の変更 ----
await k.click('#minUp'); ok((await k.textContent('#minLabel')) === '11ぷん' && (await k.textContent('#clockTime')) === '11:00', '＋で1分ふやせる');
await k.click('#minDown'); await k.click('#minDown'); ok((await k.textContent('#minLabel')) === '9ぷん', '−で1分へらせる');
await k.click('#minUp');

// ---- タイマー ----
await k.click('#tStart'); await k.waitForTimeout(300);
ok(await k.isVisible('#tPause') && await k.isHidden('#tStart') && (await k.textContent('#clockTime')) === '10:00', 'スタートで10:00から動く');
ok(await k.isDisabled('#minUp'), '動いている間は時間を変えられない');
await k.clock.setFixedTime(at(5 * MIN)); await k.waitForTimeout(400);
ok((await k.textContent('#clockTime')) === '5:00', '5分たつと残り5:00');
await k.click('#tPause'); await k.clock.setFixedTime(at(8 * MIN)); await k.waitForTimeout(400);
ok((await k.textContent('#clockTime')) === '5:00' && (await k.textContent('#tPause')) === 'さいかい', '一時停止中は減らない');
await k.reload(); await until(k, '#board .kid'); await k.click('.tabs button[data-tool=timer]');
ok((await k.textContent('#clockTime')) === '5:00' && (await k.textContent('#tPause')) === 'さいかい', '再読み込みしても止めた時間のまま');
await k.click('#tPause'); await k.clock.setFixedTime(at(13 * MIN + 1000)); await k.waitForTimeout(600);
const msg = await k.textContent('#clockMsg');
ok(msg.includes(`${order[0]} は おわり`) && (await k.textContent('#clockWho')) === `つぎは ${order[1]}：テレビを えらぶ じかん`, `時間になると「おわり！」、つぎは ${order[1]} の準備時間`);
ok((await k.textContent('#clockTime')) === '1:59' && await k.isVisible('#tSkip') && await k.isHidden('#tStart'), '準備時間は2分（のこり 1:59）・「すぐ はじめる」');
ok((await k.$$eval('#orderRow .who', (x) => x.map((e) => e.textContent)))[0].startsWith('✓'), '終わった人に✓');
await k.clock.setFixedTime(at(15 * MIN + 1000)); await k.waitForTimeout(600);
ok((await k.textContent('#clockWho')) === `${order[1]} の ばん` && (await k.textContent('#clockTime')) === '9:59' && await k.isHidden('#tSkip'), '2分たつと次の人のタイマーが自動で始まる');

// 途中でやめる（終わった扱いにしない）
await k.click('#tStop'); await k.waitForTimeout(200);
ok((await k.textContent('#tStart')).includes(order[1]) && !(await k.$$eval('#orderRow .who', (x) => x[1].textContent)).startsWith('✓'), '「やめる」は終わった扱いにしない');

// 「すぐ はじめる」で準備時間をとばす
await k.click('#tStart'); await k.clock.setFixedTime(at(25 * MIN + 2000)); await k.waitForTimeout(600);
ok((await k.textContent('#clockWho')).startsWith(`つぎは ${order[2]}`), `${order[1]} が終わると ${order[2]} の準備時間`);
await k.click('#tSkip'); await k.waitForTimeout(300);
ok((await k.textContent('#clockWho')) === `${order[2]} の ばん` && (await k.textContent('#clockTime')) === '10:00', '「すぐ はじめる」で準備をとばしてすぐ始まる');
await k.click('#tStop'); await k.waitForTimeout(200);

// カウントアップ／ダウンとアナログ表示
const wedge = () => k.getAttribute('#dialWedge', 'd');
ok((await wedge()).startsWith('M 100 10 A') && (await k.getAttribute('#dial', 'aria-label')).includes('のこり 10:00'), 'アナログ表示：はじめは全部が色で埋まる（へっていく）');
await k.click('[data-count=up]');
ok((await k.textContent('#clockTime')) === '0:00' && (await wedge()) === '', '「ふえていく」にすると 0:00 から');
await k.click('#tStart'); await k.clock.setFixedTime(at(28 * MIN + 2000)); await k.waitForTimeout(600);
ok((await k.textContent('#clockTime')) === '3:00' && (await k.textContent('#clockMsg')).includes('10ぷん まで') && /A 90 90 0 0 1 /.test(await wedge()), 'カウントアップ：3分たつと 3:00、アナログの色も3分ぶん');
await k.click('[data-count=down]'); await k.waitForTimeout(300);
ok((await k.textContent('#clockTime')) === '7:00' && /A 90 90 0 1 1 /.test(await wedge()), '途中で「へっていく」に戻すと のこり 7:00');
await k.click('#tStop'); await k.waitForTimeout(200);

// 翌日は順番がずれて、✓ も消える
await k.clock.setFixedTime(new Date(2026, 9, 21, 18, 0)); await k.reload(); await until(k, '#board .kid'); await k.click('.tabs button[data-tool=timer]');
const order2 = rotationOrder('2026-10-21').map((id) => NAMES[id]);
ok((await orderText()).join() === order2.join() && order2[0] === order[1] && !(await k.textContent('#orderRow')).includes('✓'), `翌日は順番がずれる（${order2.join('→')}）・✓は消える`);

// 順番モードを切ると、だれでも選べる
await k.uncheck('#orderMode');
ok(await k.isVisible('#pickKid') && await k.isDisabled('#tStart'), '順番モードを切ると、だれの番か選ぶ');
await k.click('#pickKid button[data-who=child3]');
ok((await k.textContent('#tStart')).includes('テ三') && await k.isEnabled('#tStart'), '選んだ子でスタートできる');
await k.check('#orderMode');

// ---- とうひょう ----
await k.click('.tabs button[data-tool=vote]');
ok(await k.isVisible('#pollForm'), 'とうひょうの作成画面');
await k.click('#startPoll');
ok((await k.textContent('#pollWarn')).includes('なにを きめる'), '質問がないと始められない');
await k.fill('#pollQ', 'きょうの ゆうはん'); await k.fill('#pollC0', 'カレー');
await k.click('#startPoll');
ok((await k.textContent('#pollWarn')).includes('2つ'), '選択肢が1つでは始められない');
await k.fill('#pollC1', 'すし'); await k.fill('#pollC2', 'うどん');
await k.click('#startPoll');
ok(await k.isVisible('#pollLive') && (await k.textContent('#pollTitle')) === 'きょうの ゆうはん', 'とうひょうが始まる');
const voters = await k.$$eval('#voterRow button', (x) => x.map((e) => e.textContent));
ok(voters.join() === 'おとうさん,おかあさん,テ一,テ二,テ三', `5人分の投票欄（${voters.join('・')}）`);
const choice = (t) => k.click(`#choiceList button:has-text("${t}")`);
await choice('カレー'); // おとうさん
ok(await k.getAttribute('#voterRow button[data-who=mother]', 'aria-pressed') === 'true', '入れると次の人に自動で進む');
await choice('すし'); await choice('すし'); await choice('カレー'); // おかあさん・テ一・テ二
await k.click('#voterRow button[data-who=child3]'); await choice('うどん'); await k.click('#voterRow button[data-who=child3]'); await choice('うどん'); // 入れて取り消し
const counts = await k.$$eval('#choiceList button', (x) => x.map((e) => e.getAttribute('aria-label')));
ok(counts.join() === 'カレー（2ひょう・1い）,すし（2ひょう・1い）,うどん（0ひょう）', `票数（${counts.join(' ')}）`);
await k.click('#showResult'); await k.waitForTimeout(1200);
const r1 = await k.textContent('#pollResult');
ok(/きまり：(カレー|すし)！/.test(r1), `同点はルーレットで同点の中から決める（${r1}）`);
await k.click('#voterRow button[data-who=child3]'); await choice('すし');
await k.click('#showResult'); await k.waitForTimeout(200);
ok((await k.textContent('#pollResult')) === 'けっか：すし！3ひょう' && await k.isVisible('#choiceList .choice.win'), '票が多いものが「けっか」（票数も大きく）');
ok((await k.textContent('#pollTally')).includes('いれた人 5 / 5') && (await k.textContent('#pollTally')).includes('みんな いれたよ'), '何人入れたかを数字で（5 / 5）');
const nums = await k.$$eval('#choiceList .num b', (x) => x.map((e) => e.textContent));
const ranks = await k.$$eval('#choiceList .rank', (x) => x.map((e) => e.textContent));
ok(nums.join() === '2,3,0' && ranks.join() === '2い,1い,−', `選択肢ごとに票数と順位（${nums.join('・')}／${ranks.join('・')}）`);
const cells = await k.$$eval('#choiceList button:nth-child(2) .cells span[data-who]', (x) => x.length);
ok(cells === 3, '票の数だけマスが色で埋まる（だれが入れたかも分かる）');
await k.reload(); await until(k, '#board .kid'); await k.click('.tabs button[data-tool=vote]');
ok(await k.isVisible('#pollLive') && (await k.$$eval('#choiceList .num b', (x) => x.map((e) => e.textContent))).join() === '2,3,0', '再読み込みしても投票は残る');
await k.click('#spinAll'); await k.waitForTimeout(800);
ok(/きまり：(カレー|すし|うどん)！/.test(await k.textContent('#pollResult')), '「ルーレットで きめる」は全部の中から1つ');
await k.click('#newPoll');
ok(await k.isVisible('#pollForm'), '「あたらしく つくる」で作成画面に戻る');
await k.fill('#pollQ', 'あそび'); await k.fill('#pollC0', 'こうえん'); await k.fill('#pollC1', 'としょかん'); await k.fill('#pollC2', '');
await k.click('#quickSpin'); await k.waitForTimeout(800);
ok(/きまり：(こうえん|としょかん)！/.test(await k.textContent('#pollResult')), '「ルーレットだけ」で投票なしにランダムで決める');

// ---- サーバーには何も送らない ----
ok(await k.evaluate(() => localStorage.getItem('fakeDB')) === dbBefore, 'タイマー・とうひょうは Firestore に一切書き込まない');
await k.click('.tabs button[data-tool=notes]');
ok(await k.isVisible('#toolNotes') && (await k.textContent('#cols')).includes('テスト毎日'), 'でんごんに戻れる');
ok(errs.length === 0, `JSエラーなし ${errs.join(' | ')}`);
await ctx.close();

// ---- 画面サイズ ----
for (const [label, opts] of [['iPad 縦', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['Androidタブレット 横', { viewport: { width: 1138, height: 712 }, hasTouch: true, isMobile: true }], ['iPhone SE', { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true }]]) {
  const c2 = await b.newContext(opts); await route(c2);
  const p = await c2.newPage();
  await p.clock.setFixedTime(at(0));
  await p.goto(BASE + 'kids.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('nextAnonUid', 'tabletT'); localStorage.setItem('kidsTools', JSON.stringify({ poll: { question: 'テスト', choices: ['いちばん ながい せんたくしの なまえ', 'B', 'C', 'D'], votes: {} } })); }, seed());
  await p.reload(); await until(p, '#board .kid');
  const noH = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const th = await p.$$eval('.tabs button', (x) => Math.min(...x.map((e) => e.getBoundingClientRect().height)));
  ok(th >= 48 && await noH(), `${label}：切り替えボタンが押しやすく、はみ出さない（${Math.round(th)}px）`);
  await p.click('.tabs button[data-tool=timer]');
  const bh = await p.$eval('#tStart', (e) => e.getBoundingClientRect().height);
  ok(bh >= 56 && await noH(), `${label}：タイマーのボタンが大きく、はみ出さない`);
  await p.click('.tabs button[data-tool=vote]');
  const ch = await p.$$eval('#choiceList button', (x) => Math.min(...x.map((e) => e.getBoundingClientRect().height)));
  ok(ch >= 64 && await noH(), `${label}：とうひょうの選択肢が大きく、はみ出さない`);
  await c2.close();
}
await b.close();
