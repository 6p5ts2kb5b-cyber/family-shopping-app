// 偽のFirestore（テスト専用。本物のFirebaseには接続しない）
// - データは localStorage に保存。別タブへは storage イベントで即時反映＝リアルタイム同期の再現
// - ownerUid＝管理者、familyMembers＝名簿。名簿外は permission-denied、名簿の変更は管理者だけ
// - 子ども用：匿名ログインの端末は kidDevices に登録されていれば伝言・設定・子どもの名前だけ読める（下の allowed）
// - fakeLoadFail を入れると読み込み失敗（unavailable）を再現
// - query(where(...)) の範囲指定に対応。familySchedules で一度に受け取った件数の最大値を fakeMaxSched に記録
// - トランザクションは本物と同じ「楽観的同時実行」：読んだ後に他の端末が書き換えていたら、やり直す
//   （同時操作を再現するため、読み取りと書き込みの間に fakeTxDelay ミリ秒の待ち時間を入れられる）
// - オフライン（navigator.onLine=false）：書き込みは端末内に保留し、画面には即反映（hasPendingWrites=true）。
//   書き込みの Promise はサーバーに届くまで完了しない（本物と同じ）。online に戻ると順に送る。
//   オフラインのトランザクションは unavailable で失敗する。
import {__user} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const load=()=>JSON.parse(localStorage.getItem('fakeDB')||'{}');
const saveRaw=d=>localStorage.setItem('fakeDB',JSON.stringify(d));
const isOwner=u=>!!u&&!u.isAnonymous&&u.uid===localStorage.getItem('ownerUid');
// ルールの再現（本物のルールはエミュレーターの tests/rules.test.mjs で確認。ここは画面の流れを試すための近似）
function allowed(appName,kind,col,id){
  const u=__user(appName);if(!u)return false;
  const d=load();
  const fam=!u.isAnonymous&&(isOwner(u)||Object.keys(d.familyMembers||{}).includes(String(u.email).toLowerCase()));
  const own=isOwner(u),self=u.isAnonymous&&u.uid===id,dev=u.isAnonymous&&!!d.kidDevices?.[u.uid];
  const R=kind==='read';
  // fakeNoKidRules＝本番のルールがまだ古い（伝言板のルールが無い）状態
  if(localStorage.getItem('fakeNoKidRules')&&(col.startsWith('kid')||col==='familySettings'))return false;
  switch(col){
    case 'shoppingItems':case 'shoppingFavorites':case 'familySchedules':return fam;
    case 'familyMembers':return R?fam:own;
    case 'kidNotices':return R?fam||dev:fam;
    case 'kidTemplates':return fam;
    case 'kidSettings':return id==='board'&&(R?fam||dev:fam);
    case 'familySettings':return R?(id==='children'&&(fam||dev))||(id==='parents'&&fam):fam&&(id==='children'||id==='parents');
    case 'kidDevices':return R?fam||self:own;
    case 'kidPairRequests':return R?(own||self)&&id!==undefined:kind==='delete'?own||self:self;
    default:return false;
  }
}
const deny=()=>{throw {code:'permission-denied'}};
const check=(ref)=>{if(!allowed(ref?.app||'[DEFAULT]','read',ref?.col,ref?.id))deny()};
const checkW=(op)=>{if(!allowed(op.app||'[DEFAULT]',op.kind==='delete'?'delete':'write',op.col,op.id))deny()};
const listeners=[];function notify(){listeners.forEach(l=>l())}
window.addEventListener('storage',e=>{if(e.key==='fakeDB')notify()});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const lock=fn=>navigator.locks.request('fakeTxCommit',fn);

// ---------- 値の適用（increment 対応） ----------
export function increment(n){return {__inc:n}}
export function serverTimestamp(){return {__ts:true}}
const nowTs=()=>{const ms=Date.now()+(+(localStorage.getItem('fakeClockSkew')||0));return {seconds:Math.floor(ms/1000),nanoseconds:(ms%1000)*1e6}};
const resolveVals=(base,data)=>{const out={};for(const [k,v] of Object.entries(data))out[k]=v&&typeof v==='object'&&'__inc' in v?(base?.[k]||0)+v.__inc:v&&typeof v==='object'&&v.__ts?nowTs():v;return out};
function applyOp(d,op){
  d[op.col]??={};
  const cur=d[op.col][op.id];
  if(op.kind==='set')d[op.col][op.id]=op.merge?{...cur,...resolveVals(cur,op.data)}:resolveVals({},op.data);
  else if(op.kind==='update'){if(!cur)throw {code:'not-found'};d[op.col][op.id]={...cur,...resolveVals(cur,op.data)}}
  else delete d[op.col][op.id];
}

// ---------- オフライン保留 ----------
const queue=[]; // {ops:[...], resolve, reject}
function localView(){const d=load();for(const q of queue)for(const op of q.ops){try{applyOp(d,op)}catch{}}return d}
const pendingIds=col=>new Set(queue.flatMap(q=>q.ops.filter(o=>o.col===col).map(o=>o.id)));
function submit(ops){
  for(const op of ops)checkW(op);
  if(!navigator.onLine){
    return new Promise((resolve,reject)=>{queue.push({ops,resolve,reject});notify()});
  }
  return lock(()=>{const d=load();for(const op of ops)applyOp(d,op);saveRaw(d)}).then(notify);
}
window.addEventListener('online',async()=>{
  while(queue.length){
    const q=queue.shift();
    try{await lock(()=>{const d=load();for(const op of q.ops)applyOp(d,op);saveRaw(d)});q.resolve()}catch(e){q.reject(e)}
  }
  notify();
});

// ---------- API ----------
export function getFirestore(app){return {app:app?.name||'[DEFAULT]'}}
export function initializeFirestore(app){return {app:app?.name||'[DEFAULT]'}}
export function persistentLocalCache(){return {}}
export function persistentMultipleTabManager(){return {}}
export async function terminate(){}
export async function clearIndexedDbPersistence(){}
export function collection(db,name){return {col:name,filters:[],app:db?.app||'[DEFAULT]'}}
export function doc(a,b,c){return c!==undefined?{col:b,id:c,app:a?.app||'[DEFAULT]'}:{col:a.col,id:b,app:a.app||'[DEFAULT]'}}
export function where(field,op,value){return {field,op,value}}
export function query(ref,...ws){return {col:ref.col,app:ref.app,filters:[...(ref.filters||[]),...ws.filter(w=>w&&w.field)]}}
export function orderBy(){return null}
const OPS={'>=':(a,b)=>a>=b,'<=':(a,b)=>a<=b,'==':(a,b)=>a===b,'<':(a,b)=>a<b,'>':(a,b)=>a>b};
const matches=(v,filters)=>filters.every(f=>v[f.field]!==undefined&&OPS[f.op](v[f.field],f.value));

export function onSnapshot(ref,a,b,c){
  const [next,err]=typeof a==='function'?[a,b]:[b,c];
  if(localStorage.getItem('fakeLoadFail')){setTimeout(()=>err&&err({code:'unavailable'}),0);return()=>{}}
  const run=()=>{
    try{check(ref)}catch(e){err&&err(e);return}
    const d=localView()[ref.col]||{},pend=pendingIds(ref.col);
    if(ref.id!==undefined){const v=d[ref.id];next({id:ref.id,exists:()=>!!v,data:()=>v,metadata:{hasPendingWrites:pend.has(ref.id),fromCache:!navigator.onLine}});return}
    const docs=Object.entries(d).filter(([,v])=>matches(v,ref.filters||[])).map(([id,v])=>({id,data:()=>v,metadata:{hasPendingWrites:pend.has(id)}}));
    if(ref.col==='familySchedules'){const m=+(localStorage.getItem('fakeMaxSched')||0);if(docs.length>m)localStorage.setItem('fakeMaxSched',String(docs.length))}
    next({docs,metadata:{hasPendingWrites:pend.size>0,fromCache:!navigator.onLine}});
  };
  listeners.push(run);setTimeout(run,0);
  return()=>{const i=listeners.indexOf(run);if(i>=0)listeners.splice(i,1)};
}
export async function getDoc(ref){check(ref);const v=load()[ref.col]?.[ref.id];return {id:ref.id,exists:()=>!!v,data:()=>v}}
export async function getDocs(ref){check(ref);const d=load()[ref.col]||{};const docs=Object.entries(d).filter(([,v])=>matches(v,ref.filters||[])).map(([id,v])=>({id,data:()=>v}));return {docs,size:docs.length}}
// fakeOldRules＝子どもを受け付けない古いルールのまま（サーバーが拒否するのを再現）
export function setDoc(ref,data,opt){if(ref.col==='familySchedules'&&localStorage.getItem('fakeOldRules')&&String(data?.who).startsWith('child'))return Promise.reject({code:'permission-denied'});return submit([{kind:'set',col:ref.col,id:ref.id,data,merge:!!opt?.merge,app:ref.app}])}
export function updateDoc(ref,data){
  if(navigator.onLine&&!load()[ref.col]?.[ref.id])return Promise.reject({code:'not-found'});
  return submit([{kind:'update',col:ref.col,id:ref.id,data,app:ref.app}]);
}
export function deleteDoc(ref){return submit([{kind:'delete',col:ref.col,id:ref.id,app:ref.app}])}
export function writeBatch(){
  const ops=[];
  return {
    set(ref,data,opt){ops.push({kind:'set',col:ref.col,id:ref.id,data,merge:!!opt?.merge,app:ref.app});return this},
    update(ref,data){ops.push({kind:'update',col:ref.col,id:ref.id,data,app:ref.app});return this},
    delete(ref){ops.push({kind:'delete',col:ref.col,id:ref.id,app:ref.app});return this},
    commit(){return ops.some(o=>o.col==='kidDevices'&&o.kind==='set')?verifyPairing(ops).then(()=>submit(ops)):submit(ops)},
  };
}
// QR登録の承認（本物はルールで確認）：10分以内の申請・トークンのハッシュ一致・同じ書き込みで申請を削除・新規のみ
async function verifyPairing(ops){
  for(const op of ops.filter(o=>o.col==='kidDevices'&&o.kind==='set')){
    checkW(op);
    const d=load(),req=d.kidPairRequests?.[op.id];
    if(d.kidDevices?.[op.id]||!req||!ops.some(o=>o.col==='kidPairRequests'&&o.kind==='delete'&&o.id===op.id))deny();
    const ageMs=Date.now()-req.createdAt.seconds*1000;
    if(ageMs>10*60*1000)deny();
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(op.data.pairToken)));
    const hex=[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hex!==req.tokenHash)deny();
  }
}
export async function runTransaction(db,fn){
  check({app:db?.app,col:'shoppingItems'});
  if(!navigator.onLine)throw {code:'unavailable'};
  for(let attempt=0;attempt<5;attempt++){
    const snap=load(),reads=new Map(),ops=[];
    const tx={
      get:async r=>{const v=snap[r.col]?.[r.id];reads.set(r.col+'/'+r.id,JSON.stringify(v??null));return{exists:()=>!!v,data:()=>v}},
      set:(r,v)=>{const op={kind:'set',col:r.col,id:r.id,data:v,app:r.app};checkW(op);ops.push(op)},
      update:(r,v)=>{const op={kind:'update',col:r.col,id:r.id,data:v,app:r.app};checkW(op);ops.push(op)},
      delete:(r)=>{const op={kind:'delete',col:r.col,id:r.id,app:r.app};checkW(op);ops.push(op)},
    };
    const res=await fn(tx);
    const delay=+(localStorage.getItem('fakeTxDelay')||0);if(delay)await sleep(delay);
    // 確認と書き込みは端末をまたいで1つずつ（本物のFirestoreのサーバー側の確認に相当）
    const committed=await lock(()=>{
      const now=load();
      const changed=[...reads].some(([k,v])=>{const [c,i]=k.split('/');return JSON.stringify(now[c]?.[i]??null)!==v});
      if(changed){localStorage.setItem('fakeTxRetries',String(+(localStorage.getItem('fakeTxRetries')||0)+1));return false}
      for(const op of ops)applyOp(now,op);
      saveRaw(now);return true;
    });
    if(committed){notify();return res}
  }
  throw {code:'aborted'};
}
