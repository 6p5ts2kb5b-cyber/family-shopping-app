// 偽のFirestore（テスト専用。本物のFirebaseには接続しない）
// - データは localStorage に保存。別タブへは storage イベントで即時反映＝リアルタイム同期の再現
// - ownerUid＝管理者、familyMembers＝名簿。名簿外は permission-denied、名簿の変更は管理者だけ
// - query(where(...)) の範囲指定に対応。familySchedules で一度に受け取った件数の最大値を fakeMaxSched に記録
// - トランザクションは本物と同じ「楽観的同時実行」：読んだ後に他の端末が書き換えていたら、やり直す
//   （同時操作を再現するため、読み取りと書き込みの間に fakeTxDelay ミリ秒の待ち時間を入れられる）
// - オフライン（navigator.onLine=false）：書き込みは端末内に保留し、画面には即反映（hasPendingWrites=true）。
//   書き込みの Promise はサーバーに届くまで完了しない（本物と同じ）。online に戻ると順に送る。
//   オフラインのトランザクションは unavailable で失敗する。
import {__user} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const load=()=>JSON.parse(localStorage.getItem('fakeDB')||'{}');
const saveRaw=d=>localStorage.setItem('fakeDB',JSON.stringify(d));
const isOwner=u=>u&&u.uid===localStorage.getItem('ownerUid');
const check=()=>{const u=__user();if(!u)throw {code:'permission-denied'};const mem=Object.keys(load().familyMembers||{});if(!isOwner(u)&&!mem.includes(u.email.toLowerCase()))throw {code:'permission-denied'}};
const checkW=(col)=>{check();if(col==='familyMembers'&&!isOwner(__user()))throw {code:'permission-denied'}};
const listeners=[];function notify(){listeners.forEach(l=>l())}
window.addEventListener('storage',e=>{if(e.key==='fakeDB')notify()});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const lock=fn=>navigator.locks.request('fakeTxCommit',fn);

// ---------- 値の適用（increment 対応） ----------
export function increment(n){return {__inc:n}}
const resolveVals=(base,data)=>{const out={};for(const [k,v] of Object.entries(data))out[k]=v&&typeof v==='object'&&'__inc' in v?(base?.[k]||0)+v.__inc:v;return out};
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
  for(const op of ops)checkW(op.col);
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
export function getFirestore(){return {}}
export function initializeFirestore(){return {}}
export function persistentLocalCache(){return {}}
export function persistentMultipleTabManager(){return {}}
export async function terminate(){}
export async function clearIndexedDbPersistence(){}
export function collection(db,name){return {col:name,filters:[]}}
export function doc(a,b,c){return c!==undefined?{col:b,id:c}:{col:a.col,id:b}}
export function where(field,op,value){return {field,op,value}}
export function query(ref,...ws){return {col:ref.col,filters:[...(ref.filters||[]),...ws]}}
const OPS={'>=':(a,b)=>a>=b,'<=':(a,b)=>a<=b,'==':(a,b)=>a===b,'<':(a,b)=>a<b,'>':(a,b)=>a>b};
const matches=(v,filters)=>filters.every(f=>v[f.field]!==undefined&&OPS[f.op](v[f.field],f.value));

export function onSnapshot(ref,a,b,c){
  const [next,err]=typeof a==='function'?[a,b]:[b,c];
  const run=()=>{
    try{check()}catch(e){err&&err(e);return}
    const d=localView()[ref.col]||{},pend=pendingIds(ref.col);
    const docs=Object.entries(d).filter(([,v])=>matches(v,ref.filters||[])).map(([id,v])=>({id,data:()=>v,metadata:{hasPendingWrites:pend.has(id)}}));
    if(ref.col==='familySchedules'){const m=+(localStorage.getItem('fakeMaxSched')||0);if(docs.length>m)localStorage.setItem('fakeMaxSched',String(docs.length))}
    next({docs,metadata:{hasPendingWrites:pend.size>0,fromCache:!navigator.onLine}});
  };
  listeners.push(run);setTimeout(run,0);
  return()=>{const i=listeners.indexOf(run);if(i>=0)listeners.splice(i,1)};
}
export async function getDocs(ref){check();const d=load()[ref.col]||{};const docs=Object.entries(d).filter(([,v])=>matches(v,ref.filters||[])).map(([id,v])=>({id,data:()=>v}));return {docs,size:docs.length}}
export function setDoc(ref,data,opt){return submit([{kind:'set',col:ref.col,id:ref.id,data,merge:!!opt?.merge}])}
export function updateDoc(ref,data){
  if(navigator.onLine&&!load()[ref.col]?.[ref.id])return Promise.reject({code:'not-found'});
  return submit([{kind:'update',col:ref.col,id:ref.id,data}]);
}
export function deleteDoc(ref){return submit([{kind:'delete',col:ref.col,id:ref.id}])}
export function writeBatch(){
  const ops=[];
  return {
    set(ref,data,opt){ops.push({kind:'set',col:ref.col,id:ref.id,data,merge:!!opt?.merge});return this},
    update(ref,data){ops.push({kind:'update',col:ref.col,id:ref.id,data});return this},
    delete(ref){ops.push({kind:'delete',col:ref.col,id:ref.id});return this},
    commit(){return submit(ops)},
  };
}
export async function runTransaction(db,fn){
  check();
  if(!navigator.onLine)throw {code:'unavailable'};
  for(let attempt=0;attempt<5;attempt++){
    const snap=load(),reads=new Map(),ops=[];
    const tx={
      get:async r=>{const v=snap[r.col]?.[r.id];reads.set(r.col+'/'+r.id,JSON.stringify(v??null));return{exists:()=>!!v,data:()=>v}},
      set:(r,v)=>{checkW(r.col);ops.push({kind:'set',col:r.col,id:r.id,data:v})},
      update:(r,v)=>{checkW(r.col);ops.push({kind:'update',col:r.col,id:r.id,data:v})},
      delete:(r)=>{checkW(r.col);ops.push({kind:'delete',col:r.col,id:r.id})},
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
