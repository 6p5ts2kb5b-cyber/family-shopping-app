// 「買うものを画像でLINEに送る」のテスト（偽のFirebase。本物には接続しない）
// 画像の中と共有の文章に「買い物よろしくお願いします。」が入ることを確認
// SHOTS=フォルダ を指定すると、作った画像を保存
import { chromium, devices } from 'playwright';
import fs from 'fs';

const F = new URL('./fake-firebase', import.meta.url).pathname;
const URL0 = 'http://localhost:8790/app.html';
const SHOTS = process.env.SHOTS || '';
const MSG = '買い物よろしくお願いします。';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();

for (const [label, opts, kind] of [['iPhone SE', devices['iPhone SE'], 'phone'], ['PC 1280', { viewport: { width: 1280, height: 800 } }, 'pc']]) {
  const ctx = await b.newContext({ ...opts, acceptDownloads: true });
  await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/, (r) => {
    const m = r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(F + '/' + { app: 'app.js', auth: 'auth.js', firestore: 'fs.js' }[m]) });
  });
  await ctx.addInitScript((phone) => {
    // 画像に書かれた文字を記録する
    window.__drawn = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__drawn.push(String(t)); return orig.call(this, t, ...a); };
    if (phone) {
      // iPhoneの共有シートの代わり：渡された内容を記録する
      navigator.canShare = () => true;
      navigator.share = async (d) => {
        const f = d.files[0];
        const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
        window.__shared = { name: f.name, type: f.type, size: f.size, text: d.text, title: d.title, b64: btoa(s) };
      };
    }
  }, kind === 'phone');
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL0);
  await p.evaluate(() => {
    localStorage.clear(); localStorage.setItem('ownerUid', 'u1');
    localStorage.setItem('fakeDB', JSON.stringify({ shoppingItems: {
      a: { name: 'テスト牛乳', quantity: 2, done: false, createdAt: 1, doneAt: null },
      b: { name: 'テスト豆腐', quantity: 1, done: false, createdAt: 2, doneAt: null },
      c: { name: 'テスト卵', quantity: 1, done: true, createdAt: 3, doneAt: 4 },
    }, shoppingFavorites: {}, familySchedules: {} }));
    sessionStorage.setItem('nextUid', 'u1');
  });
  await p.goto(URL0 + '?s'); await p.click('#login'); await p.waitForTimeout(400);

  if (kind === 'phone') {
    await p.click('#shopImageShare'); await p.waitForTimeout(500);
    const sh = await p.evaluate(() => window.__shared);
    ok(sh && sh.type === 'image/png' && sh.size > 5000, `${label}：共有シートに画像が渡る`);
    ok(sh && sh.text === MSG, `${label}：共有の文章が「${MSG}」`);
    const drawn = await p.evaluate(() => window.__drawn);
    ok(drawn.includes(MSG), `${label}：画像の中にも「${MSG}」が入る`);
    ok(drawn.some((t) => t.includes('テスト牛乳')) && drawn.some((t) => t.includes('テスト豆腐')) && !drawn.some((t) => t.includes('テスト卵')), `${label}：買うものが画像に入る（購入済みは入らない）`);
    if (SHOTS && sh) fs.writeFileSync(`${SHOTS}/shop-image.png`, Buffer.from(sh.b64, 'base64'));
  } else {
    await p.evaluate(() => { window.__drawn = []; });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#shopImageShare')]);
    ok(/^shopping-list-\d{4}-\d{2}-\d{2}\.png$/.test(dl.suggestedFilename()), `${label}：共有できない端末では画像を保存（${dl.suggestedFilename()}）`);
    ok((await p.evaluate(() => window.__drawn)).includes(MSG), `${label}：保存した画像の中にも「${MSG}」が入る`);
  }
  ok(errs.length === 0, `${label}：エラーなし ${errs.join(' / ')}`);
  await ctx.close();
}
await b.close();
