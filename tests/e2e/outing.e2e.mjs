// おでかけのしおり：親のアプリで作る・見る・チェック・写真・印刷・送る・削除、子ども用タブレットの「おでかけ」（偽のFirebase）
// SHOTS=フォルダ を指定するとスクリーンショットを保存
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const BASE = 'http://localhost:8790/';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const NOW = new Date(2026, 10, 22, 9, 0);   // 2026-11-22（日）
const route = (ctx) => ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
  const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
});
const seed = () => ({
  shoppingItems: {}, shoppingFavorites: {}, familyMembers: { 'wifet2@example.com': { addedAt: 1 } }, kidNotices: {}, kidSettings: { board: { pause: '', eveningFrom: '12:00' } },
  familySettings: { parents: { husband: 'テスト夫', wife: 'テスト妻' }, children: { child1: 'テ一', child2: 'テ二', child3: 'テ三' } },
});
const DB = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakeDB')));
const login = async (p, uid) => { await p.evaluate((u) => sessionStorage.setItem('nextUid', u), uid); await p.reload(); await p.click('#login'); await p.waitForTimeout(500); };
const noH = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// 写真（テスト用に作る大きな画像）
const photoPath = '/tmp/outing-test-photo.png';
{
  const c = await b.newContext(); const pg = await c.newPage();
  const data = await pg.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1600; const g = cv.getContext('2d'); for (let i = 0; i < 1600; i += 4) { g.fillStyle = `hsl(${i / 8},60%,${40 + (i % 40)}%)`; g.fillRect(0, i, 2400, 4); } for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${i % 360},70%,50%)`; g.fillRect((i * 97) % 2400, (i * 53) % 1600, 9, 9); } return cv.toDataURL('image/png'); });
  fs.writeFileSync(photoPath, Buffer.from(data.split(',')[1], 'base64')); await c.close();
}

// ================= 親：作る → 見る → チェック → 写真 → 印刷・送る（iPhone 13） =================
const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
await route(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.clock.setFixedTime(NOW);
await p.goto(BASE + 'app.html');
await p.evaluate((d) => { localStorage.clear(); localStorage.setItem('ownerUid', 'ownerT1'); localStorage.setItem('fakeDB', JSON.stringify(d)); }, seed());
await login(p, 'ownerT1');
ok(await p.isVisible('#outingCard') && (await p.textContent('#outingCard')).includes('これからのおでかけはありません'), '今日の画面に「おでかけのしおり」のカード（まだ無いときの案内）');
await p.click('#outingCard [data-o=new]');
ok(await p.isVisible('#outingPage') && (await p.textContent('#outingPage h1')).includes('しおりを作る'), '「＋ 作る」で作る画面');
await p.click('[data-v=save]');
ok((await p.textContent('#oMsg')).includes('名前'), '名前が無いと保存しない（理由を出す）');
await p.fill('#oTitle', 'テスト動物園の日'); await p.fill('#oDate', '2026-11-29'); await p.fill('#oPlace', 'テストどうぶつ公園');
ok(await p.getAttribute('[data-v=theme][data-k=auto]', 'aria-pressed') === 'true' && (await p.textContent('[data-v=theme][data-k=auto]')).includes('動物園'), '表紙は名前から自動で「動物園」');
// 予定：電車・ふつうの予定
await p.click('[data-v=kind][data-k=train]');
await p.fill('#sFrom', 'テストA駅'); await p.fill('#sTo', 'テストB駅'); await p.fill('#sTime', '08:21'); await p.fill('#sArr', '08:44'); await p.fill('#sTrack', '3'); await p.fill('#sLine', 'テスト線');
await p.click('[data-v=stepadd]');
await p.click('[data-v=kind][data-k=plan]'); await p.fill('#sTime', '08:00'); await p.fill('#sText', '家を出る'); await p.click('[data-v=stepadd]');
await p.fill('#sTime', '12:00'); await p.fill('#sText', 'テストおべんとう'); await p.click('[data-v=stepadd]');
const lines = await p.$$eval('.oline .w', (x) => x.map((e) => e.textContent).filter(Boolean));
ok(lines.join() === '8:00,8:21,12:00', `予定は時刻の順に並ぶ（${lines.join()}）`);
// 直す
await p.click('.oline:has-text("テストおべんとう") [data-v=stepedit]');
ok(await p.inputValue('#sText') === 'テストおべんとう', '「直す」で予定の行を入力欄に戻す');
await p.fill('#sText', 'テストおべんとう（広場）'); await p.click('[data-v=stepadd]');
ok((await p.textContent('#outingPage')).includes('テストおべんとう（広場）') && await p.locator('.oline:has-text("テストおべんとう")').count() === 1, '予定の行を直せる（増えない）');
// 持ち物：定番と手入力
await p.click('[data-v=tpl][data-k=day]');
const n1 = await p.locator('[data-v=itemdel]').count();
await p.click('[data-v=tpl][data-k=day]');
ok(n1 === 15 && await p.locator('[data-v=itemdel]').count() === 15, `定番「日帰り」でみんな＋子ども3人分が入り、2回押しても増えない（${n1}）`);
ok(!(await p.textContent('#outingPage')).includes('保険'), '保険証は入らない');
await p.click('[data-v=who][data-k=husband]'); await p.fill('#iText', 'テストカメラ'); await p.keyboard.press('Enter');
ok((await p.textContent('#outingPage')).includes('テストカメラ'), '夫の持ち物を足せる（Enterでも）');
await p.click('.oline:has-text("ごみぶくろ") [data-v=itemdel]');
ok(!(await p.textContent('#outingPage')).includes('ごみぶくろ'), '持ち物を消せる');
await p.fill('#tRef', 'TEST-123'); await p.fill('#eMeet', 'テスト入口の時計');
ok(await noH(p), 'iPhone：作る画面で横にはみ出さない');
if (SHOTS) { const hh = await p.evaluate(() => document.getElementById('outingPage').scrollHeight); await p.setViewportSize({ width: 390, height: hh }); await p.screenshot({ path: `${SHOTS}/outing-edit.png` }); await p.setViewportSize({ width: 390, height: 664 }); }
await p.click('[data-v=save]'); await p.waitForTimeout(400);
let d = await DB(p);
const id = Object.keys(d.outings || {})[0], o = d.outings?.[id];
ok(o && o.title === 'テスト動物園の日' && o.date === '2026-11-29' && o.theme === 'auto' && o.hasPhoto === false && o.steps.length === 3 && o.items.length === 15 && o.ticket.ref === 'TEST-123' && o.emergency.meet === 'テスト入口の時計', '保存：しおりが1つの文書に入る');
ok(Object.keys(o).sort().join() === 'address,date,emergency,endDate,hasPhoto,items,place,steps,theme,ticket,title,updatedAt', 'ルールと同じ12項目');
ok(await p.isVisible('.ocover') && (await p.textContent('.ocover')).includes('あと7日') && (await p.textContent('.ocover')).includes('表紙：動物園'), '保存すると、しおりの画面（表紙・あと7日）');
const tl = await p.textContent('.otl');
ok(tl.includes('電車　テストA駅 → テストB駅') && tl.includes('テスト線・3番線　8:21 発 → 8:44 着'), '電車の行：駅・線・番線・発着');
ok((await p.getAttribute('.omap', 'href')).startsWith('https://www.google.com/maps/search/') && (await p.getAttribute('.otl .tr a', 'href')).includes('travelmode=transit'), '地図と乗りかえのリンク');
ok(await noH(p), 'iPhone：しおりの画面で横にはみ出さない');
if (SHOTS) await p.screenshot({ path: `${SHOTS}/outing-view.png` });
// チェック（家族みんなに同じ）
await p.click('.ochk:has-text("さいふ") input');
await p.waitForTimeout(300);
d = await DB(p);
const ck = Object.values(d.outingChecks || {});
ok(ck.length === 1 && ck[0].done === true && ck[0].outing === id && ck[0].by === 'p:ownerT1' && Object.keys(ck[0]).sort().join() === 'at,by,done,item,outing', 'チェックは outingChecks に保存（だれが付けたか）');
ok((await p.textContent('.ochk.on')).includes('ownerT1 ✓'), 'チェックした人が出る');
// 妻のスマホにも同じチェックが見える
const ctxW = await b.newContext(devices['iPhone SE']); await route(ctxW);
const w = await ctxW.newPage(); await w.clock.setFixedTime(NOW);
await w.goto(BASE + 'app.html'); await w.evaluate((dd) => { localStorage.setItem('ownerUid', 'ownerT1'); localStorage.setItem('fakeDB', JSON.stringify(dd)); }, d);
await login(w, 'wifeT2');
ok((await w.textContent('#outingCard')).includes('テスト動物園の日') && (await w.textContent('#outingCard')).includes('あと7日'), '妻のアプリにも、しおりが出る');
await w.click('#outingCard [data-o=open]');
ok(await w.isChecked('.ochk:has-text("さいふ") input'), '妻にも同じチェックが見える');
ok(await noH(w), 'iPhone SE：しおりの画面で横にはみ出さない');
await ctxW.close();
// 写真
await p.click('[data-v=edit]');
await p.setInputFiles('#oPhoto', photoPath); await p.waitForSelector('.ophoto img', { timeout: 10000 }).catch(() => {});
ok(await p.locator('.ophoto img').count() === 1, '写真を選ぶと表紙の写真が出る');
await p.click('[data-v=save]'); await p.waitForTimeout(500);
d = await DB(p);
const ph = d.outingPhotos?.[id]?.data || '';
ok(d.outings[id].hasPhoto === true && ph.startsWith('data:image/jpeg;base64,') && ph.length <= 600000, `写真は小さく縮めたJPEGで保存（${Math.round(ph.length / 1024)}KB・上限内）`);
ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ocover')).backgroundImage.startsWith('url(')) && (await p.textContent('.otag')).includes('写真'), '写真が表紙になる');
// 印刷
await p.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__printClass = document.body.classList.contains('oprinting'); }; });
await p.click('[data-v=print]');
ok(await p.evaluate(() => window.__printed === 1 && window.__printClass), '「印刷」で印刷の画面を開く');
const pr = await p.textContent('#outingPrintRoot');
ok(pr.includes('テスト動物園の日') && pr.includes('予定の流れ') && pr.includes('持ち物チェック') && pr.includes('☑ さいふ') && pr.includes('□ すいとう') && pr.includes('テスト入口の時計'), '印刷用：表紙・流れ・持ち物（チェック）・もしも');
await p.evaluate(() => document.body.classList.add('oprinting')); await p.emulateMedia({ media: 'print' });
ok(await p.isVisible('#outingPrintRoot .oprint') && await p.isHidden('#outingPage .obody'), '印刷のときは、しおりの印刷用だけを出す');
if (SHOTS) { await p.setViewportSize({ width: 794, height: 1123 }); await p.screenshot({ path: `${SHOTS}/outing-print.png` }); await p.setViewportSize({ width: 390, height: 664 }); }
await p.emulateMedia({ media: 'screen' }); await p.evaluate(() => document.body.classList.remove('oprinting'));
// 送る（共有が無い端末はコピー）
await p.evaluate(() => { delete navigator.share; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
await p.click('[data-v=share]'); await p.waitForTimeout(300);
const clip = await p.evaluate(() => navigator.clipboard.readText());
ok(clip.startsWith('【おでかけのしおり】テスト動物園の日') && clip.includes('8:21　電車　テストA駅 → テストB駅') && clip.includes('テスト夫：□テストカメラ'), '「送る」：しおりの文章（LINEに貼れる）');
// もどる → 一覧
await p.click('[data-v=close]');
ok(await p.isHidden('#outingPage') && (await p.textContent('#outingCard')).includes('テスト動物園の日'), '「もどる」で今日の画面へ');
ok(errs.length === 0, `JSエラーなし ${errs.join(' | ')}`);

// ================= 子ども用タブレット：おでかけ =================
// 同じ家のデータ（同じブラウザの保存）を見るタブレット＝同じコンテキストの別ページ
const k = await ctx.newPage(); const kerrs = []; k.on('pageerror', (e) => kerrs.push(e.message));
await k.setViewportSize({ width: 1180, height: 820 });
await k.clock.setFixedTime(NOW);
await k.goto(BASE + 'kids.html');
await k.evaluate(() => sessionStorage.setItem('fakeUser', JSON.stringify({ uid: 'ownerT1', email: 'ownerT1@example.com', isAnonymous: false })));
await k.reload(); await k.waitForTimeout(600);
await k.click('.tabs button[data-tool=outing]'); await k.waitForTimeout(300);
const kt = await k.textContent('#toolOuting');
ok(kt.includes('テスト動物園の日') && kt.includes('11がつ29にち（にち）') && (await k.textContent('.kocd')).replace(/\s/g, '') === 'あと7にち', 'タブレット：表紙・日にち・あと 7 にち');
ok(await k.evaluate(() => getComputedStyle(document.querySelector('.kocover')).backgroundImage.startsWith('url(')), 'タブレット：写真の表紙');
ok(kt.includes('でんしゃ（テストB駅 まで）') && kt.includes('テストおべんとう（広場）'), 'タブレット：その日の流れ（電車は やさしい言い方）');
ok((await k.textContent('.kokid[data-child=child1]')).includes('テ一 の もちもの') && (await k.textContent('.kokid[data-child=child1]')).includes('すいとう'), 'タブレット：子どもごとの持ち物');
await k.click('.kokid[data-child=child2] .kobtn:has-text("ハンカチ")'); await k.waitForTimeout(300);
d = await DB(k);
const c2 = Object.values(d.outingChecks).find((x) => x.by === 'child2');
ok(c2 && c2.done === true && await k.getAttribute('.kokid[data-child=child2] .kobtn:has-text("ハンカチ")', 'aria-pressed') === 'true', 'タブレットでチェック → 家族に同じに見えるよう保存');
const sz = await k.$$eval('.kobtn', (x) => Math.min(...x.map((e) => e.getBoundingClientRect().height)));
ok(sz >= 48 && await noH(k), `タブレット：押しやすい（${Math.round(sz)}px）・はみ出さない`);
if (SHOTS) await k.screenshot({ path: `${SHOTS}/outing-kids.png` });
// 親の画面にタブレットのチェックが届く
await p.waitForTimeout(300);
await p.click('#outingCard [data-o=open]');
ok(await p.isChecked('.ochk:has-text("ハンカチ") >> nth=0 >> input') || (await p.$$eval('.ochk.on', (x) => x.map((e) => e.textContent).join())).includes('ハンカチ'), '親の画面にタブレットのチェックが届く（だれが付けたかも）');
ok((await p.$$eval('.ochk.on small', (x) => x.map((e) => e.textContent).join())).includes('テ二 ✓'), 'タブレットのチェックは子どもの呼び名で出る');
ok(kerrs.length === 0, `タブレット：JSエラーなし ${kerrs.join(' | ')}`);

// ================= 削除・ルールが古いまま・名簿外 =================
p.on('dialog', (dlg) => dlg.accept());
await p.click('[data-v=edit]'); await p.click('[data-v=delete]'); await p.waitForTimeout(400);
d = await DB(p);
ok(!Object.keys(d.outings || {}).length && !Object.keys(d.outingPhotos || {}).length && !Object.keys(d.outingChecks || {}).length, '削除：しおり・写真・チェックが消える');
ok(await p.isHidden('#outingPage') && (await p.textContent('#outingCard')).includes('これからのおでかけはありません'), '削除すると一覧から消える');
await k.waitForTimeout(300);
ok((await k.textContent('#toolOuting')).includes('おでかけの よていは まだ ないよ'), 'タブレット：しおりが無いときの案内');
await k.close();
await p.evaluate(() => localStorage.setItem('fakeNoOutingRules', '1'));
await p.reload(); await p.click('#login').catch(() => {}); await p.waitForTimeout(500);
ok((await p.textContent('#outingCard')).includes('ルールの更新が必要') && (await p.textContent('#todo')).length > 0, 'ルールが古いまま：しおりのカードに案内（ほかは使える）');
await ctx.close();
{
  const c = await b.newContext(); await route(c); const s = await c.newPage();
  await s.goto(BASE + 'app.html'); await s.evaluate((dd) => { localStorage.setItem('ownerUid', 'ownerT1'); localStorage.setItem('fakeDB', JSON.stringify({ ...dd, outings: { x: { title: 'テスト秘密', date: '2026-11-29' } } })); }, seed());
  await login(s, 'strangerT9');
  ok(!(await s.textContent('body')).includes('テスト秘密'), '名簿外のアカウントには、しおりを出さない');
  await c.close();
}
// ================= PC =================
{
  const c = await b.newContext({ viewport: { width: 1366, height: 860 } }); await route(c); const s = await c.newPage(); const e2 = []; s.on('pageerror', (e) => e2.push(e.message));
  await s.clock.setFixedTime(NOW);
  await s.goto(BASE + 'app.html'); await s.evaluate((dd) => { localStorage.clear(); localStorage.setItem('ownerUid', 'ownerT1'); localStorage.setItem('fakeDB', JSON.stringify({ ...dd, outings: { y: { title: 'テスト水族館', date: '2026-12-05', endDate: '2026-12-06', place: '', address: '', theme: 'auto', hasPhoto: false, steps: [], items: [], ticket: {}, emergency: {} } } })); }, seed());
  await login(s, 'ownerT1');
  ok((await s.textContent('#outingCard')).includes('12/5（土）〜12/6（日）') && (await s.textContent('#outingCard')).includes('あと13日'), 'PC：泊まりのしおり（日にち・あと13日）');
  await s.click('#outingCard [data-o=open]');
  ok((await s.textContent('.ocover')).includes('1泊2日') && (await s.textContent('.otag')).includes('海・水族館'), 'PC：表紙は「海・水族館」・1泊2日');
  const cw = await s.$eval('.owrap', (e) => e.getBoundingClientRect().width);
  ok(cw <= 760 && await noH(s), `PC：読みやすい幅（${Math.round(cw)}px）`);
  if (SHOTS) await s.screenshot({ path: `${SHOTS}/outing-pc.png` });
  ok(e2.length === 0, `PC：JSエラーなし ${e2.join(' | ')}`);
  await c.close();
}
await b.close();
