// 「予定を画像で送る（1か月分）」のテスト（偽のFirebase。本物には接続しない）
// SHOTS=フォルダ を指定すると、作った画像とパネルのスクリーンショットを保存
import { chromium, devices } from 'playwright';
import fs from 'fs';
import { toYmd, monthRange, weekOf } from '../../lib/schedule-views.js';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const URL0 = 'http://localhost:8790/app.html';
const SHOTS = process.env.SHOTS || '';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();

// 今月のデータ（土日・平日・夫・妻・家族・旧データの「私」・来月）
const now = new Date(), Y = now.getFullYear(), M = now.getMonth() + 1;
const weekendDays = []; for (let d = new Date(Y, M - 1, 1); d.getMonth() === M - 1; d.setDate(d.getDate() + 1)) if (d.getDay() === 0 || d.getDay() === 6) weekendDays.push(toYmd(d));
const weekday = (() => { for (let d = new Date(Y, M - 1, 1); ; d.setDate(d.getDate() + 1)) if (d.getDay() === 3) return toYmd(d); })();
const next = monthRange(M === 12 ? Y + 1 : Y, M === 12 ? 1 : M + 1).start;
const ev = (date, who, name, departure = '', returnTime = '') => ({ date, who, name, departure, returnTime });
const SCHED = {
  a: ev(weekday, 'husband', 'テスト病院', '19:00', '20:30'),
  b: ev(weekendDays[0], 'family', 'テスト運動会'),
  c: ev(weekendDays[1], 'husband', 'テスト野球', '06:30', '15:00'),
  d: ev(weekendDays[1], 'wife', 'テスト美容院', '10:00', '12:00'),
  e: ev(weekendDays[2], 'me', 'テスト旧データ', '09:00'),
  f: ev(next, 'husband', 'テスト来月', '08:00'),
  g: ev(weekendDays[3], 'husband', 'とても長い名前の予定ですが画像の幅に収まるように省略されるかの確認用', '07:00', '21:00'),
};

for (const [label, opts, kind] of [['iPhone SE', devices['iPhone SE'], 'phone'], ['PC 1280', { viewport: { width: 1280, height: 800 } }, 'pc']]) {
  const ctx = await b.newContext({ ...opts, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
    const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
  });
  if (kind === 'phone') {
    // iPhoneの共有シートの代わり：渡されたファイルを記録する
    await ctx.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async (d) => { window.__shared = d.files ? { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size } : { text: d.text }; };
    });
  }
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL0);
  await p.evaluate((sched) => { localStorage.clear(); localStorage.setItem('ownerUid', 'u1'); localStorage.setItem('fakeDB', JSON.stringify({ shoppingItems: {}, shoppingFavorites: {}, familySchedules: sched })); sessionStorage.setItem('nextUid', 'u1'); }, SCHED);
  await p.goto(URL0 + '?s'); await p.click('#login'); await p.waitForTimeout(400);
  await p.click('.tabs button[data-tab=schedule]');
  await p.click('#shareOpen'); await p.waitForTimeout(600);
  const info = () => p.textContent('#shareInfo');
  const imgW = () => p.evaluate(() => document.getElementById('sharePreview').naturalWidth);
  ok(await p.isVisible('#shareSheet') && (await p.textContent('#shareMonth')) === `${Y}年${M}月`, `${label}：パネルが開き、今月が選ばれている`);
  ok((await info()).startsWith('6件'), `${label}：すべて・毎日＝今月の6件（来月分は入らない）`);
  ok(await imgW() === 1080, `${label}：横1080pxの画像ができる`);
  await p.click('#shareWho button[data-v=husband]'); await p.waitForTimeout(300);
  ok((await info()).startsWith('4件'), `${label}：夫だけ＝夫と旧「私」の4件（妻・家族は入らない）`);
  await p.click('#shareSpan button[data-v=weekend]'); await p.waitForTimeout(300);
  ok((await info()).startsWith('3件') && (await info()).includes('予定のない土日も表示'), `${label}：夫・週末だけ＝3件（平日の病院は入らない）`);
  if (SHOTS && kind === 'phone') {
    const b64 = await p.evaluate(async () => { const r = await fetch(document.getElementById('sharePreview').src); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); });
    fs.writeFileSync(`${SHOTS}/share-husband-weekend.png`, Buffer.from(b64, 'base64'));
    await p.screenshot({ path: `${SHOTS}/share-panel-se.png` });
  }
  const text = await p.evaluate(() => document.getElementById('shareTextBtn') && true);
  ok(text, `${label}：文章で送るボタンがある`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}：パネルが画面からはみ出さない`);

  if (kind === 'phone') {
    await p.click('#shareImage'); await p.waitForTimeout(300);
    const sh = await p.evaluate(() => window.__shared);
    ok(sh && sh.type === 'image/png' && sh.size > 5000 && sh.name.includes('husband') && sh.name.includes('weekend'), `${label}：「画像を送る」で共有シートに画像（${sh?.name}）`);
    await p.click('#shareTextBtn'); await p.waitForTimeout(200);
    const st = await p.evaluate(() => window.__shared);
    ok(st.text?.includes('義の予定・週末だけ') && st.text.includes('テスト野球'), `${label}：「文章で送る」で共有シートに文章`);
  } else {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#shareSave')]);
    ok(dl.suggestedFilename().endsWith('.png') && dl.suggestedFilename().includes('husband'), `${label}：「画像を保存」でPNGを保存（${dl.suggestedFilename()}）`);
    await p.click('#shareTextBtn'); await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok(clip.startsWith(`【${Y}年${M}月の予定（義の予定・週末だけ）】`) && clip.includes('・予定なし'), `${label}：「文章で送る」で文章をコピー`);
    await p.click('#shareWho button[data-v=all]'); await p.click('#shareSpan button[data-v=all]'); await p.waitForTimeout(300);
    if (SHOTS) {
      const b64 = await p.evaluate(async () => { const r = await fetch(document.getElementById('sharePreview').src); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); });
      fs.writeFileSync(`${SHOTS}/share-all-month.png`, Buffer.from(b64, 'base64'));
    }
  }
  // 月の切り替え
  await p.click('#shareNext'); await p.waitForTimeout(500);
  ok((await p.textContent('#shareMonth')).endsWith(`${M === 12 ? 1 : M + 1}月`), `${label}：›で次の月へ`);
  await p.click('#shareWho button[data-v=all]'); await p.click('#shareSpan button[data-v=all]'); await p.waitForTimeout(300);
  ok((await info()).startsWith('1件'), `${label}：次の月の予定を読み込む（1件）`);
  await p.click('#sharePrev'); await p.click('#sharePrev'); await p.waitForTimeout(500);
  ok((await info()).startsWith('0件') && await imgW() === 1080, `${label}：予定のない月でも画像ができる`);
  // ---- 1週間分 ----
  await p.click('#shareNext'); await p.waitForTimeout(400); // 今月に戻す
  await p.click('#shareUnit button[data-v=week]'); await p.waitForTimeout(500);
  const wk = weekOf(new Date(), 0), md = (y) => { const [, m, d] = y.split('-').map(Number); return [m, d]; };
  const [m0, d0] = md(wk[0]), [m6, d6] = md(wk[6]);
  ok((await p.textContent('#shareMonth')) === (m0 === m6 ? `${m0}/${d0}〜${d6}` : `${m0}/${d0}〜${m6}/${d6}`), `${label}：「1週間」で今週（月〜日）になる`);
  const inWeek = Object.values(SCHED).filter((e) => e.date >= wk[0] && e.date <= wk[6]).length;
  ok((await info()).startsWith(`${inWeek}件`) && (await info()).includes('予定のない日も表示') && await imgW() === 1080, `${label}：今週の予定${inWeek}件と、予定のない日も入った画像`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}：1週間でもはみ出さない`);
  await p.click('#shareTextBtn'); await p.waitForTimeout(200);
  const wt = kind === 'phone' ? (await p.evaluate(() => window.__shared))?.text : await p.evaluate(() => navigator.clipboard.readText());
  ok(wt?.startsWith(`【${m0}/${d0}〜${m6}/${d6}の予定】`) && (wt.match(/^\d+\/\d+（/gm) || []).length === 7, `${label}：1週間の文章は7日分`);
  await p.click('#shareNext'); await p.waitForTimeout(400);
  const nx = weekOf(new Date(), 1); const [n0, e0] = md(nx[0]);
  ok((await p.textContent('#shareMonth')).startsWith(`${n0}/${e0}〜`), `${label}：›で次の週へ`);
  if (kind === 'pc') {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#shareSave')]);
    ok(dl.suggestedFilename() === `wagaya-memo_week-${nx[0]}.png`, `${label}：1週間の画像の名前（${dl.suggestedFilename()}）`);
  }
  await p.click('#shareClose'); await p.click('#shareOpen'); await p.waitForTimeout(500);
  ok(await p.getAttribute('#shareUnit button[data-v=week]', 'aria-pressed') === 'true', `${label}：次に開いたときも「1週間」のまま`);
  await p.click('#shareUnit button[data-v=month]'); await p.waitForTimeout(400);
  ok((await p.textContent('#shareMonth')).endsWith('月'), `${label}：「1か月」に戻せる`);
  await p.click('#shareClose');
  ok(await p.isHidden('#shareSheet'), `${label}：閉じる`);
  ok(errs.length === 0, `${label}：JSエラーなし ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
