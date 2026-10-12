// 新画面 app.html の画面テスト（偽のFirebaseで2台の同期を再現。本物のFirebaseには接続しない）
// 実行：python3 -m http.server 8790 &  →  node tests/e2e/app.e2e.mjs
import { chromium, devices } from 'playwright';
const F=new URL('./fake-firebase', import.meta.url).pathname;const fs=await import('fs');
const b=await chromium.launch();const ctx=await b.newContext({...devices['iPhone 13']});
await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/,r=>{const m=r.request().url().match(/firebase-(app|auth|firestore)\.js/)[1];r.fulfill({contentType:'text/javascript',body:fs.readFileSync(F+'/'+({app:'app.js',auth:'auth.js',firestore:'fs.js'}[m]))})});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};const errs=[];
const now=new Date();const ymd=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const T=ymd(now),TM=ymd(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
const db=()=>A.evaluate(()=>JSON.parse(localStorage.getItem('fakeDB')||'{}'));
const open=async uid=>{const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&errs.push(m.text()));await p.goto('http://localhost:8790/app.html');await p.evaluate(u=>{sessionStorage.setItem('nextUid',u)},uid);await p.goto('http://localhost:8790/app.html?x');await p.click('#login');await p.waitForTimeout(400);return p};
// seed: existing data incl. legacy me schedule, existing item, roster wife
const seed=await ctx.newPage();await seed.goto('http://localhost:8790/app.html');
await seed.evaluate(([T])=>{localStorage.setItem('ownerUid','husbandUID123');localStorage.setItem('fakeDB',JSON.stringify({shoppingItems:{old1:{name:'牛乳',quantity:2,done:false,createdAt:1,doneAt:null}},shoppingFavorites:{f1:{name:'卵'},f2:{name:'牛乳'}},familyMembers:{'wifeuid456789@example.com':{addedAt:1}},familySchedules:{legacy:{date:T,name:'野球部',who:'me',departure:'06:30',returnTime:'17:00'}}}))},[T]);await seed.close();
const A=await open('husbandUID123');const B=await open('wifeUID456789');
ok(await A.isVisible('#homeScreen')&&await B.isVisible('#homeScreen'),'夫・妻とも新画面に入れる');
ok((await A.textContent('#sync')).includes('同期済み'),'同期済み表示');
ok((await A.textContent('#todaySchedule')).includes('野球部')&&(await A.textContent('#todaySchedule .tag'))==='夫','旧me予定を「夫」で今日に表示');
ok((await A.textContent('#todo')).includes('牛乳'),'既存の買い物データが表示');
// tabs
await A.click('.tabs button[data-tab=schedule]');ok(await A.isVisible('#scheduleScreen')&&await A.isHidden('#homeScreen')&&await A.isHidden('#add'),'予定タブへ切替（追加欄は隠れる）');
await A.click('.tabs button[data-tab=family]');ok(await A.isVisible('#familyScreen')&&(await A.textContent('#roster')).includes('wifeuid456789'),'家族タブ：名簿表示');
await A.click('.tabs button[data-tab=home]');ok(await A.isVisible('#homeScreen')&&await A.isVisible('#add'),'今日タブへ戻る');
// home -> add schedule shortcut
await A.click('#goAddSchedule');await A.waitForTimeout(100);ok(await A.isVisible('#scheduleScreen')&&await A.evaluate(()=>document.activeElement.id)==='quickText','「＋予定を追加」で入力欄へ');
// quick entry
await A.fill('#quickText','11.3野球大会6:00から17:00');
ok(await A.isDisabled('#quickSave'),'誰の予定が未選択なら保存できない');
await A.click('#quickWho button[data-v=husband]');
await A.fill('#quickText','11.3野球大会6:00から17:30');
ok(await A.getAttribute('#quickWho button[data-v=husband]','aria-pressed')==='true','文章を打ち直しても選んだ「夫」が消えない');
ok(await A.inputValue('#quickReturn')==='17:30','文章の修正は反映される');
await A.fill('#quickName','野球大会（市民球場）');await A.fill('#quickText','11.3野球大会6:00から17:00');
ok(await A.inputValue('#quickName')==='野球大会（市民球場）','手で直した予定内容は上書きしない');
ok(!(await A.isDisabled('#quickSave')),'そろえば保存できる');
await A.click('#quickSave');await A.waitForTimeout(300);
const s1=Object.values((await db()).familySchedules).find(x=>x.name.startsWith('野球大会'));
ok(s1&&s1.date.endsWith('-11-03')&&s1.who==='husband'&&s1.departure==='06:00'&&s1.returnTime==='17:00'&&Object.keys(s1).sort().join()==='date,departure,name,returnTime,who','保存内容がルールの5項目どおり');
ok(await A.inputValue('#quickText')===''&&(await A.getAttribute('#quickWho button[data-v=husband]','aria-pressed'))==='false','保存後に入力欄がリセット');
// weekend pick
await A.fill('#quickText','週末 BBQ 10:00〜14:00');
ok(await A.isVisible('#quickAsk')&&(await A.$$eval('#quickAsk button',x=>x.length))===2,'「週末」は土日を選ぶボタン');
await A.click('#quickAsk button >> nth=1');
ok((await A.inputValue('#quickDate'))!==''&&new Date(await A.inputValue('#quickDate')).getUTCDay()===0,'日曜を選ぶと日付が入る');
const sunday=await A.inputValue('#quickDate');await A.fill('#quickText','週末 BBQ 10:00〜15:00');
ok(await A.inputValue('#quickDate')===sunday&&await A.isHidden('#quickAsk'),'同じ文の時刻を直しても選んだ日曜はそのまま');
// past date
await A.fill('#quickText','1/1 初詣');
ok((await A.textContent('#quickAsk')).includes('過ぎています')&&(await A.textContent('#quickAsk')).includes('来年'),'過去の日付は確認＋来年ボタン');
await A.click('#quickAsk button >> nth=0');ok((await A.inputValue('#quickDate')).startsWith(String(now.getFullYear()+1)),'来年にする');
// tomorrow quick save shows in B
await A.fill('#quickText','明日 病院 9:00〜11:00 妻');await A.click('#quickSave');await A.waitForTimeout(300);
await B.click('.tabs button[data-tab=schedule]');await B.click('#viewTomorrow');
ok((await B.textContent('#scheduleList')).includes('病院')&&(await B.textContent('#scheduleList .tag'))==='妻','夫が保存した明日の予定が妻の画面に反映');
// shopping: add, stepper, check, delete+undo, favorite
await A.click('.tabs button[data-tab=home]');
await A.fill('#product','豆腐');await A.press('#product','Enter');await A.waitForTimeout(300);
await B.click('.tabs button[data-tab=home]');
ok((await B.textContent('#todo')).includes('豆腐'),'追加が相手に反映');
await B.click('#todo li:has-text("豆腐") .stepper button >> nth=1');await A.waitForTimeout(300);
ok((await A.textContent('#todo li:has-text("豆腐") output'))==='2','＋が相手に反映');
ok(await A.isDisabled('#todo li:has-text("牛乳") .stepper button >> nth=0')===false,'個数2なら−が押せる');
await A.click('#todo li:has-text("豆腐") .check');await A.waitForTimeout(300);
ok((await B.textContent('#done')).includes('豆腐'),'購入済みが相手に反映');
const before=(await db()).shoppingItems.old1;
await A.click('#todo li:has-text("牛乳") .del');await A.waitForTimeout(300);
ok(!(await db()).shoppingItems.old1&&await A.isVisible('#toastUndo'),'削除と「元に戻す」表示');
await A.click('#toastUndo');await A.waitForTimeout(300);
ok(JSON.stringify((await db()).shoppingItems.old1)===JSON.stringify(before),'元に戻すで同じ内容に復元');
ok((await A.textContent('#favorites')).includes('✓ 牛乳'),'リストにある「よく買うもの」は✓');
await A.click('#favorites button:has-text("卵")');await A.waitForTimeout(300);
ok((await B.textContent('#todo')).includes('卵'),'よく買うものを1タップ追加→相手に反映');
// stranger
const C=await open('strangerUID000');ok(await C.isHidden('#content')&&(await C.textContent('#status')).includes('名簿にありません'),'名簿外は入れない');
// wife cannot change roster
await B.click('.tabs button[data-tab=family]');B.once('dialog',d=>d.accept());await B.fill('#memberEmail','x@example.com');await B.click('#rosterForm button');await B.waitForTimeout(300);
ok(!(await db()).familyMembers['x@example.com'],'妻は名簿を変更できない');
// layout
for(const [p,n] of [[A,'A']]){await p.click('.tabs button[data-tab=home]');const sw=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(sw<=0,'横スクロールなし');
const small=await p.$$eval('button:not(.chip)',bs=>bs.filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return [b.textContent.trim()||b.ariaLabel,Math.round(r.width),Math.round(r.height)]}).filter(([,w,h])=>w<44||h<40));ok(small.length===0,'押せる所は十分な大きさ '+JSON.stringify(small));}

await A.click('.tabs button[data-tab=schedule]');await A.fill('#quickText','11.3野球大会6:00から17:00');
ok(errs.length===0,'JSエラーなし '+errs.join('|'));await b.close();
