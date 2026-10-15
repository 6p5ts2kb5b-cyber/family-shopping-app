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
ok((await A.textContent('#todaySchedule')).includes('野球部')&&(await A.textContent('#todaySchedule .tag'))==='夫','旧me予定を「夫」で今日に表示（呼び名が未設定なら既定の呼び名）');
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
await B.click('.tabs button[data-tab=schedule]');await B.click('.seg4 button[data-view=tomorrow]');
ok((await B.textContent('#scheduleBody')).includes('病院')&&(await B.textContent('#scheduleBody .tag'))==='妻','夫が保存した明日の予定が妻の画面に反映');
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
// 編集シートから削除→元に戻す
await A.click('#todo button.namebtn:has-text("牛乳")');ok(await A.isVisible('#editSheet')&&await A.evaluate(()=>document.activeElement.id)==='editName','商品名タップで編集シート');
await A.click('#editDelete');await A.waitForTimeout(300);
ok(!(await db()).shoppingItems.old1&&await A.isVisible('#toastUndo')&&await A.isHidden('#editSheet'),'編集シートから削除→「元に戻す」表示');
await A.click('#toastUndo');await A.waitForTimeout(300);
ok(JSON.stringify((await db()).shoppingItems.old1)===JSON.stringify(before),'元に戻すで同じ内容に復元');
// 個数変更（シート）
await A.click('#todo button.namebtn:has-text("牛乳")');await A.click('#editPlus');await A.click('#editPlus');await A.click('#editSave');await A.waitForTimeout(300);
ok((await db()).shoppingItems.old1.quantity===4&&(await B.textContent('#todo li:has-text("牛乳") output'))==='4','シートで個数変更→相手に反映');
// 名前変更（新IDへ移動、個数・作成日時を引き継ぐ）
await A.click('#todo button.namebtn:has-text("牛乳")');await A.fill('#editName','低脂肪牛乳');await A.click('#editSave');await A.waitForTimeout(300);
const items1=(await db()).shoppingItems;const renamed=Object.values(items1).find(x=>x.name==='低脂肪牛乳');
ok(!items1.old1&&renamed&&renamed.quantity===4&&renamed.createdAt===1,'名前変更：古いものは消え、個数・作成日時を引き継ぐ');
ok((await B.textContent('#todo')).includes('低脂肪牛乳')&&!(await B.textContent('#todo')).includes('牛乳低')&&!(await B.$$eval('#todo .namebtn',x=>x.map(y=>y.textContent))).includes('牛乳'),'名前変更が相手に反映');
// 同名が未購入であれば中止
await A.fill('#product','バター');await A.press('#product','Enter');await A.waitForTimeout(300);
await A.click('#todo button.namebtn:has-text("バター")');await A.fill('#editName','低脂肪牛乳');await A.click('#editSave');await A.waitForTimeout(300);
ok(Object.values((await db()).shoppingItems).filter(x=>x.name==='低脂肪牛乳').length===1&&Object.values((await db()).shoppingItems).some(x=>x.name==='バター'),'同じ名前が既にあれば変更しない');
await A.click('#editClose');
// スワイプ削除
const swipe=async(p,sel,dx,dy)=>{const bx=await p.locator(sel).boundingBox();const x=bx.x+bx.width*0.45,y=bx.y+bx.height/2;await p.mouse.move(x,y);await p.mouse.down();for(let i=1;i<=8;i++)await p.mouse.move(x+dx*i/8,y+dy*i/8);await p.mouse.up();await p.waitForTimeout(400)};
await swipe(A,'#todo li:has-text("バター") .item',0,-60);
ok(Object.values((await db()).shoppingItems).some(x=>x.name==='バター'),'縦に動かしても消えない');
await swipe(A,'#todo li:has-text("バター") .item',-40,0);
ok(Object.values((await db()).shoppingItems).some(x=>x.name==='バター'),'少しだけ左にずらしても消えない');
await swipe(A,'#todo li:has-text("バター") .item',-150,0);
ok(!Object.values((await db()).shoppingItems).some(x=>x.name==='バター')&&await A.isVisible('#toastUndo'),'左スワイプで削除→元に戻す表示');
// 相手が同じ物を追加済みなら、元に戻すは上書きしない
await B.fill('#product','バター');await B.press('#product','Enter');await B.waitForTimeout(300);
await B.click('#todo li:has-text("バター") .stepper button >> nth=1');await B.waitForTimeout(300);
await A.click('#toastUndo');await A.waitForTimeout(300);
ok(Object.values((await db()).shoppingItems).find(x=>x.name==='バター').quantity===2,'相手が追加済みなら元に戻すで上書きしない');
ok((await A.textContent('#favorites')).includes('＋ 牛乳'),'リストにない「よく買うもの」は＋（名前変更後）');
await B.click('#favorites button:has-text("牛乳")');await A.waitForTimeout(300);ok((await A.textContent('#favorites')).includes('✓ 牛乳'),'リストにある「よく買うもの」は✓');
await A.click('#favorites button:has-text("卵")');await A.waitForTimeout(300);
ok((await B.textContent('#todo')).includes('卵'),'よく買うものを1タップ追加→相手に反映');
// 予定の編集（同じIDで更新）と削除→元に戻す（旧meの予定）
const legacyBefore=(await db()).familySchedules.legacy;
await A.click('.tabs button[data-tab=home]');await A.click('#todaySchedule button.ev:has-text("野球部")');
ok(await A.isVisible('#scheduleScreen')&&(await A.textContent('#hQuick'))==='予定を編集'&&await A.inputValue('#quickName')==='野球部'&&(await A.getAttribute('#quickWho button[data-v=husband]','aria-pressed'))==='true','予定タップで編集（旧meは夫）');
await A.fill('#quickReturn','18:00');await A.click('#quickSave');await A.waitForTimeout(300);
const leg=(await db()).familySchedules.legacy;
ok(leg&&leg.returnTime==='18:00'&&leg.who==='husband'&&Object.keys((await db()).familySchedules).length===Object.keys(await A.evaluate(()=>JSON.parse(localStorage.getItem('fakeDB')).familySchedules)).length,'同じ予定を更新（新しい予定は増えない）');
ok((await A.textContent('#hQuick'))==='文章で予定を追加'&&!(await A.isDisabled('#quickText')),'保存後は追加モードに戻る');
await B.click('.tabs button[data-tab=home]');ok((await B.textContent('#todaySchedule')).includes('〜18:00'),'予定の変更が相手に反映');
await A.click('#scheduleBody button.ev:has-text("野球部")').catch(async()=>{await A.click('.seg4 button[data-view=today]');await A.click('#scheduleBody button.ev:has-text("野球部")')});
await A.click('#quickDelete');await A.waitForTimeout(300);
ok(!(await db()).familySchedules.legacy,'予定を削除');
await A.click('#toastUndo');await A.waitForTimeout(300);
ok((await db()).familySchedules.legacy?.name==='野球部','予定の削除を元に戻す');
await A.click('#scheduleBody button.ev >> nth=0').catch(()=>{});await A.click('#quickCancel').catch(()=>{});
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
