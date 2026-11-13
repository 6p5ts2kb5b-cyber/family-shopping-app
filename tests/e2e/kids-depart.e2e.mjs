// 子ども用タブレット：朝の「しゅっぱつ まで あと なんぷん」と「いまの とけい」のテスト
// （タブレットの中だけで動く。偽のFirebase。名前はテスト用）
import { chromium } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const BASE = 'http://localhost:8790/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const route = (ctx) => ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const ts = (s) => ({ seconds: s, nanoseconds: 0 });
const N = (text, targets, period = 'morning') => ({ text, targets, period, repeat: 'daily', onDate: '', active: true, updatedAt: ts(1) });
const seed = () => ({
  shoppingItems: {}, shoppingFavorites: {}, familyMembers: {}, familySchedules: {},
  kidNotices: { a: N('テストすいとう', ['child1', 'child2', 'child3']), b: N('テストはみがき', ['child1'], 'evening') },
  kidTemplates: {}, kidSettings: {}, kidDevices: { tabT: { label: 'x', addedAt: ts(1), pairToken: 'x'.repeat(22) } },
  familySettings: { children: { child1: 'テ一', child2: 'テ二', child3: 'テ三' } },
});
const THU = (h, m, s = 0) => new Date(2026, 10, 5, h, m, s);   // 木曜

const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
await route(ctx);
const k = await ctx.newPage(); const errs = []; k.on('pageerror', (e) => errs.push(e.message));
const at = async (d) => { await k.clock.setFixedTime(d); await k.waitForTimeout(1300); };
await k.clock.setFixedTime(THU(7, 5));
await k.goto(BASE + 'kids.html');
await k.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('ownerUid', 'tabT'); sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'tabT', email: 'tabT@example.com', isAnonymous: false })); }, seed());
await k.reload(); await k.waitForSelector('#board .kid', { timeout: 10000 }); await k.waitForTimeout(1300);
const dbBefore = await k.evaluate(() => localStorage.getItem('fakeDB'));
const txt = (id) => k.textContent('#' + id);
const attr = (id, a) => k.getAttribute('#' + id, a);
const vis = (sel) => k.isVisible(sel);

// ---- 朝 7:05（しゅっぱつ 7:30） ----
ok(await vis('#depart'), '朝は「しゅっぱつ まで」が出る');
ok((await txt('dGroups')) === 'しゅっぱつ 7:30' && (await txt('dLeftText')) === 'あと 25ふん', `しゅっぱつ 7:30・あと 25ふん（${await txt('dLeftText')}）`);
const wedge = await attr('dLeftWedge', 'd');
// 25ふん → 0 から 左まわりに 25 の所まで（タイムタイマーと同じ）
const ang = 25 / 60 * 2 * Math.PI, ex = (100 - 68 * Math.sin(ang)).toFixed(2), ey = (100 - 68 * Math.cos(ang)).toFixed(2);
ok(wedge === `M 100 100 L 100 32 A 68 68 0 0 0 ${ex} ${ey}`.replace(/$/, ' Z'), `しゅっぱつまでの とけい：0 から 左まわりに 25 まで いろ（${wedge}）`);
const nums = await k.$$eval('#dLeftTicks text', (x) => x.map((e) => [e.textContent, Math.round(Number(e.getAttribute('x'))), Math.round(Number(e.getAttribute('y')))]));
ok(nums.map((n) => n[0]).join() === '0,5,10,15,20,25,30,35,40,45,50,55' && nums[3][1] === 14 && nums[3][2] === 100 && nums[9][1] === 186, 'すうじは 0 が上、15 が左、45 が右（タイムタイマーと同じ）');
ok(await vis('#dNow') && (await txt('dNowText')) === '7:05', 'いまの とけい：7:05');
const hand = async (id) => [Number(await attr(id, 'x2')), Number(await attr(id, 'y2'))];
const [mx, my] = await hand('dMin');
ok(Math.abs(mx - (100 + 74 * Math.sin(Math.PI / 6))) < 0.1 && Math.abs(my - (100 - 74 * Math.cos(Math.PI / 6))) < 0.1, '長い針は 1（5ふん）を さす');
const [hx, hy] = await hand('dHour');
const ha = (7 + 5 / 60) * 30 * Math.PI / 180;
ok(Math.abs(hx - (100 + 48 * Math.sin(ha))) < 0.1 && Math.abs(hy - (100 - 48 * Math.cos(ha))) < 0.1, '短い針は 7 の すこし さき');
ok((await attr('dNowSector', 'd')).length > 10 && Number(await k.getAttribute('#dMarks circle', 'cy')) > 180, 'いまの とけいに しゅっぱつまでの いろと、しゅっぱつ（6）の しるし');
ok((await k.$$eval('#dNowTicks text', (x) => x.map((e) => e.textContent).join())) === '1,2,3,4,5,6,7,8,9,10,11,12', 'いまの とけいに 1〜12 の すうじ');

// ---- 時間が進む ----
await at(THU(7, 26));
ok((await txt('dLeftText')) === 'あと 4ぷん' && (await txt('dMsg')).includes('もうすぐ') && await k.$eval('#depart', (e) => e.classList.contains('soon')), 'のこり5ふん以内は「もうすぐ」');
await at(THU(7, 30));
ok((await txt('dLeftText')) === 'しゅっぱつ じかん！' && (await txt('dMsg')).includes('いってらっしゃい') && (await attr('dLeftWedge', 'd')) === '', '7:30 は「しゅっぱつ じかん！」');
await at(THU(7, 46));
ok(!(await vis('#depart')), 'しゅっぱつ15ふん後は けす');

// ---- 設定（このタブレットの中だけ） ----
await at(THU(7, 5));
ok(await k.isHidden('#dSet'), 'せっていは ふだん かくれている');
await k.click('#dSetOpen');
ok(await vis('#dSet') && (await attr('dSetOpen', 'aria-expanded')) === 'true', '「せってい」で ひらく');
const rows = await k.$$eval('#dTimes .stepper', (x) => x.map((e) => e.textContent.replace(/[−＋]/g, '')));
ok(rows.join() === 'テ一7:30,テ二7:30,テ三7:30', `ひとりずつ しゅっぱつ時刻が ならぶ（${rows.join('・')}）`);
// テ三だけ おそく（7:50）
const later = (id) => k.click(`#dTimes [data-kid=${id}] button[data-d="1"]`), earlier = (id) => k.click(`#dTimes [data-kid=${id}] button[data-d="-1"]`);
for (let i = 0; i < 4; i++) await later('child3');
ok((await k.textContent('#dTimes [data-kid=child3] b')) === '7:50' && (await k.textContent('#dTimes [data-kid=child1] b')) === '7:30', 'テ三だけ 5ふんずつ おそく できる（7:50）');
const groups = () => k.$$eval('#dGroups .dg', (x) => x.map((e) => e.textContent.trim()));
ok((await groups()).join('|') === 'テ一・テ二 7:30|テ三 7:50' && (await txt('dLeftText')) === 'あと 25ふん', `時刻が ちがうと ひとりずつ 出る（${(await groups()).join('・')}）・大きい数字は いちばん近い しゅっぱつ`);
ok((await k.$$eval('#dMarks circle', (x) => x.length)) === 2, 'いまの とけいに しゅっぱつ時刻の しるしが 2つ');
await k.click('#dSetOpen');
await at(THU(7, 33));
ok((await txt('dLeftText')) === 'あと 17ふん' && (await txt('dMsg')) === 'テ一・テ二：いってらっしゃい！' && (await groups())[0].endsWith('✓'), '7:33：テ一・テ二は いってらっしゃい、テ三は あと 17ふん');
ok(await k.$eval('#dGroups .dg.now', (e) => e.textContent.startsWith('テ三')), 'つぎに しゅっぱつする テ三が めだつ');
await at(THU(7, 47));
ok((await txt('dLeftText')) === 'あと 3ぷん' && (await txt('dMsg')) === 'テ三：もうすぐ！ じゅんび できた？', '7:47：テ三 もうすぐ');
await at(THU(7, 50));
ok((await txt('dMsg')) === 'テ三：いってらっしゃい！' && (await txt('dLeftText')) === 'しゅっぱつ じかん！', '7:50：テ三 いってらっしゃい');
await at(THU(8, 4));
ok(await vis('#depart'), 'いちばん おそい しゅっぱつ（7:50）の 15ふん後までは 出る');
await at(THU(8, 5));
ok(!(await vis('#depart')), '8:05 には けす');
await at(THU(7, 5));
await k.click('#dSetOpen'); await earlier('child1');
ok((await k.textContent('#dTimes [data-kid=child1] b')) === '7:25' && (await groups())[0] === 'テ一 7:25', '−で はやく できる（テ一 7:25）');
// いまの とけい：けす／だす
await k.click('#dShowNow');
ok(await k.isHidden('#dNow') && await vis('#dLeftSvg'), '「いまの とけい」を けせる（しゅっぱつまでの とけいは のこる）');
await k.reload(); await k.waitForSelector('#board .kid'); await k.waitForTimeout(1300);
ok((await groups()).join('|') === 'テ一 7:25|テ二 7:30|テ三 7:50' && await k.isHidden('#dNow'), 'もういちど ひらいても せっていは のこる（ひとりずつの 時刻も）');
await k.click('#dSetOpen'); await k.click('#dShowNow');
ok(await vis('#dNow'), '「いまの とけい」を また だせる');
// あとの テストのため みんな 7:30 に もどす
await later('child1'); for (let i = 0; i < 4; i++) await earlier('child3');
ok((await txt('dGroups')) === 'しゅっぱつ 7:30', 'みんな 同じ時刻なら「しゅっぱつ 7:30」だけ');
// とけいを けす → だす
await k.click('#dOff');
ok(await k.isHidden('#depart') && await vis('#dOn'), '「とけいを けす」で けせて、「だす」ボタンが出る');
await k.click('#dOn');
ok(await vis('#depart') && await k.isHidden('#dOn'), '「しゅっぱつの とけいを だす」で もどる');

// ---- 夕方・土日・おやすみ ----
await k.click('.period button[data-p=evening]'); await k.waitForTimeout(200);
ok(await k.isHidden('#depart') && await k.isHidden('#dOn'), 'ゆうがたに すると 出ない');
await k.click('.period button[data-p=morning]'); await k.waitForTimeout(200);
ok(await vis('#depart'), 'あさに もどすと 出る');
await at(new Date(2026, 10, 7, 7, 5));
ok(await k.isHidden('#depart'), 'どようびは 出ない（へいじつ だけ）');
await k.evaluate(() => { const v = JSON.parse(localStorage.getItem('kidsDepart')); v.weekdaysOnly = false; localStorage.setItem('kidsDepart', JSON.stringify(v)); });
await k.reload(); await k.waitForSelector('#board .kid'); await at(new Date(2026, 10, 7, 7, 5));
ok(await vis('#depart') && (await txt('dLeftText')) === 'あと 25ふん', '「へいじつ だけ」を はずすと どようびも 出る');

ok((await k.evaluate(() => localStorage.getItem('fakeDB'))) === dbBefore, 'Firebaseには なにも 送らない（データは変わらない）');
ok(errs.length === 0, 'エラーなし ' + errs.join(' / '));
await ctx.close();

// ---- 画面の大きさ ----
for (const [label, vp] of [['iPad たて', { width: 820, height: 1180 }], ['iPad よこ', { width: 1180, height: 820 }], ['Android よこ', { width: 1280, height: 800 }], ['iPhone SE', { width: 375, height: 667 }]]) {
  const c = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await route(c);
  const p = await c.newPage(); await p.clock.setFixedTime(THU(7, 5));
  await p.goto(BASE + 'kids.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('ownerUid', 'tabT'); sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'tabT', email: 'tabT@example.com', isAnonymous: false })); }, seed());
  await p.reload(); await p.waitForSelector('#board .kid'); await p.waitForTimeout(1300);
  await p.click('#dSetOpen');
  const r = await p.evaluate(() => {
    const W = (id) => document.getElementById(id).getBoundingClientRect();
    const btns = [...document.querySelectorAll('#depart button')].filter((x) => x.offsetParent);
    return { noH: document.documentElement.scrollWidth <= innerWidth, minBtn: Math.min(...btns.map((x) => x.getBoundingClientRect().height)),
      dial: W('dLeftSvg').width, now: W('dNowSvg').width, left: parseFloat(getComputedStyle(document.getElementById('dLeftText')).fontSize) };
  });
  ok(r.noH, `${label}：横に はみ出さない`);
  ok(r.minBtn >= 48, `${label}：せっていの ボタンが押しやすい（${Math.round(r.minBtn)}px）`);
  ok(r.dial >= 72 && r.now >= 72 && r.left >= 30, `${label}：とけい（${Math.round(r.dial)}px）と「あと なんぷん」（${r.left}px）が 見える大きさ`);
  await c.close();
}

// ---- 1画面に おさまる（スライドしなくてよい）：Safariの上のバーや「ページの拡大」を引いた大きさ ----
{
  const N4 = (text, targets) => ({ text, targets, period: 'morning', repeat: 'daily', onDate: '', active: true, updatedAt: ts(1) });
  const full = () => ({ ...seed(), kidNotices: {
    a: N4('テストぬりぬり', ['child1', 'child2']), b: N4('テストおはし', ['child1', 'child2']),
    c: N4('テストすいとう', ['child1', 'child2', 'child3']), d: N4('テストハンカチ・ティッシュ', ['child1', 'child2']), e: N4('テストごむ', ['child3']) } });
  for (const [label, vp] of [['iPad よこ（Safari）', { width: 1080, height: 690 }], ['iPad 1024 よこ', { width: 1024, height: 650 }],
    ['iPad mini よこ', { width: 1133, height: 630 }], ['iPad よこ・拡大125%', { width: 864, height: 520 }], ['iPad たて', { width: 810, height: 960 }]]) {
    const c = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await route(c);
    const p = await c.newPage(); await p.clock.setFixedTime(THU(7, 15));
    await p.goto(BASE + 'kids.html');
    await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('ownerUid', 'tabT'); sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'tabT', email: 'tabT@example.com', isAnonymous: false })); }, full());
    await p.reload(); await p.waitForSelector('#board .kid'); await p.waitForTimeout(1300);
    const r = await p.evaluate(() => ({ fits: document.documentElement.scrollHeight <= innerHeight + 1, dial: document.getElementById('dLeftSvg').getBoundingClientRect().width, vis: !document.getElementById('depart').hidden }));
    ok(r.vis && r.fits && r.dial >= 72, `${label}：伝言と時計が 1画面に おさまる（時計 ${Math.round(r.dial)}px）`);
    await c.close();
  }
  // 向きを変えたら 合わせなおす
  const c = await b.newContext({ viewport: { width: 810, height: 960 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await route(c);
  const p = await c.newPage(); await p.clock.setFixedTime(THU(7, 15));
  await p.goto(BASE + 'kids.html');
  await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('fakeDB', JSON.stringify(d)); localStorage.setItem('ownerUid', 'tabT'); sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'tabT', email: 'tabT@example.com', isAnonymous: false })); }, full());
  await p.reload(); await p.waitForSelector('#board .kid'); await p.waitForTimeout(1300);
  await p.setViewportSize({ width: 1024, height: 650 }); await p.waitForTimeout(1300);
  ok(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'たて→よこに 向きを変えても 1画面に おさまる');
  await c.close();
}
await b.close();
