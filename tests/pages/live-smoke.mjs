// 公開サイト（GitHub Pages）の確認：本番のURLを実際に開く
// 1) 新しいファイルが公開されるまで待ち、リポジトリと同じ内容か確認
// 2) 従来版のページ（shared/schedule/setup/check）が変わっていないことを確認
// 3) iPhone相当の画面で app.html を開き、ログイン画面が出てエラーがないことを確認
//    （Googleログインは自動化できないため、ログイン後の操作は実機で確認する）
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BASE = 'https://6p5ts2kb5b-cyber.github.io/family-shopping-app/';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFile(path) {
  const r = await fetch(BASE + path + '?nocache=' + Date.now(), { cache: 'no-store' });
  return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
}

// 1) 公開待ち（最大10分）
const NEW = ['app.html', 'lib/quick-schedule.js', 'lib/schedule-views.js', 'app.webmanifest', 'icons/icon-180.png'];
let deployed = false;
for (let i = 0; i < 40 && !deployed; i++) {
  const results = await Promise.all(NEW.map(async (p) => { const f = await fetchFile(p); return f.status === 200 && sha(f.buf) === sha(readFileSync(p)); }));
  deployed = results.every(Boolean);
  if (!deployed) await sleep(15000);
}
ok(deployed, '新しいファイル（app.html と lib）が公開サイトに反映された');

// 2) 従来版のページは変わっていない
for (const p of ['shared.html', 'schedule.html', 'setup.html', 'check.html', 'firebase-config.js']) {
  const f = await fetchFile(p);
  ok(f.status === 200 && sha(f.buf) === sha(readFileSync(p)), `${p} は公開中で、リポジトリと同じ内容（変更なし）`);
}

// 3) iPhone相当の画面で開く
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => failed.push(r.url() + ' ' + (r.failure()?.errorText || '')));
page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) failed.push(r.url() + ' ' + r.status()); });
const res = await page.goto(BASE + 'app.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
ok(res.status() === 200, 'app.html が開ける（200）');
ok((await page.title()).includes('わが家のメモ'), 'タイトル「わが家のメモ」');
ok(await page.isVisible('#login'), 'Googleログインのボタンが表示される');
ok((await page.textContent('#signin')).includes('同じデータ'), '試用版の注意書き（同じデータを使う）が表示される');
ok(await page.locator('#signin a[href="./shared.html"]').count() === 1, '従来版へのリンクがある');
ok((await page.textContent('#sync')).includes('未ログイン'), 'Firebaseの読み込みが完了（未ログイン表示）');
ok(failed.length === 0, '読み込みに失敗したファイルなし ' + failed.join(' | '));
ok(errors.length === 0, 'JavaScriptのエラーなし ' + errors.join(' | '));
const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
ok(sw <= 0, '横スクロールなし');
await b.close();
