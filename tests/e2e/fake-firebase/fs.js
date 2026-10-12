// 偽のFirestore（テスト専用。本物のFirebaseには接続しない）
// - データは localStorage に保存。別タブへは storage イベントで即時反映＝リアルタイム同期の再現
// - ownerUid＝管理者、familyMembers＝名簿。名簿外は permission-denied、名簿の変更は管理者だけ
// - query(where(...)) の範囲指定に対応。familySchedules で一度に受け取った件数の最大値を fakeMaxSched に記録
// - トランザクションは本物と同じ「楽観的同時実行」：読んだ後に他の端末が書き換えていたら、やり直す
//   （同時操作を再現するため、読み取りと書き込みの間に fakeTxDelay ミリ秒の待ち時間を入れられる）
import {__user} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const load=()=>JSON.parse(localStorage.getItem('fakeDB')||'{}');
const save=d=>{localStorage.setItem('fakeDB',JSON.stringify(d));notify()};
const isOwner=u=>u&&u.uid===localStorage.getItem('ownerUid');
const check=()=>{const u=__user();if(!u)throw {code:'permission-denied'};const mem=Object.keys(load().familyMembers||{});if(!isOwner(u)&&!mem.includes(u.email.toLowerCase()))throw {code:'permission-denied'}};
const checkW=(col)=>{check();if(col==='familyMembers'&&!isOwner(__user()))throw {code:'permission-denied'}};
const listeners=[];function notify(){listeners.forEach(l=>l())}
window.addEventListener('storage',e=>{if(e.key==='fakeDB')notify()});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function getFirestore(){return {}}
export function collection(db,name){return {col:name,filters:[]}}
export function doc(a,b,c){return c!==undefined?{col:b,id:c}:{col:a.col,id:b}}
export function where(field,op,value){return {field,op,value}}
export function query(ref,...ws){return {col:ref.col,filters:[...(ref.filters||[]),...ws]}}
const OPS={'>=':(a,b)=>a>=b,'<=':(a,b)=>a<=b,'==':(a,b)=>a===b,'<':(a,b)=>a<b,'>':(a,b)=>a>b};
const matches=(v,filters)=>filters.every(f=>v[f.field]!==undefined&&OPS[f.op](v[f.field],f.value));

export function onSnapshot(ref,next,err){
  const run=()=>{
    try{check()}catch(e){err&&err(e);return}
    const d=load()[ref.col]||{};
    const docs=Object.entries(d).filter(([,v])=>matches(v,ref.filters||[])).map(([id,v])=>({id,data:()=>v}));
    if(ref.col==='familySchedules'){const m=+(localStorage.getItem('fakeMaxSched')||0);if(docs.length>m)localStorage.setItem('fakeMaxSched',String(docs.length))}
    next({docs});
  };
  listeners.push(run);setTimeout(run,0);
  return()=>{const i=listeners.indexOf(run);if(i>=0)listeners.splice(i,1)};
}
export async function getDocs(ref){check();const d=load()[ref.col]||{};const docs=Object.entries(d).filter(([,v])=>matches(v,ref.filters||[])).map(([id,v])=>({id,data:()=>v}));return {docs,size:docs.length}}
export async function setDoc(ref,data,opt){checkW(ref.col);await navigator.locks.request('fakeTxCommit',()=>{const d=load();d[ref.col]??={};d[ref.col][ref.id]=opt?.merge?{...d[ref.col][ref.id],...data}:data;save(d)})}
export async function deleteDoc(ref){checkW(ref.col);await navigator.locks.request('fakeTxCommit',()=>{const d=load();if(d[ref.col])delete d[ref.col][ref.id];save(d)})}

export async function runTransaction(db,fn){
  check();
  for(let attempt=0;attempt<5;attempt++){
    const snap=load(),reads=new Map(),writes=[];
    const tx={
      get:async r=>{const v=snap[r.col]?.[r.id];reads.set(r.col+'/'+r.id,JSON.stringify(v??null));return{exists:()=>!!v,data:()=>v}},
      set:(r,v)=>{checkW(r.col);writes.push(['set',r,v])},
      update:(r,v)=>{checkW(r.col);writes.push(['update',r,v])},
      delete:(r)=>{checkW(r.col);writes.push(['delete',r])},
    };
    const res=await fn(tx);
    const delay=+(localStorage.getItem('fakeTxDelay')||0);if(delay)await sleep(delay);
    // 確認と書き込みは端末をまたいで1つずつ（本物のFirestoreのサーバー側の確認に相当）
    const committed=await navigator.locks.request('fakeTxCommit',async()=>{
      // 読んだ後に他の端末が書き換えていたら、やり直し（本物のFirestoreと同じ）
      const now=load();
      const changed=[...reads].some(([k,v])=>{const [c,i]=k.split('/');return JSON.stringify(now[c]?.[i]??null)!==v});
      if(changed){localStorage.setItem('fakeTxRetries',String(+(localStorage.getItem('fakeTxRetries')||0)+1));return false}
      for(const [op,r,v] of writes){now[r.col]??={};if(op==='set')now[r.col][r.id]=v;else if(op==='update')now[r.col][r.id]={...now[r.col][r.id],...v};else delete now[r.col][r.id]}
      save(now);return true;
    });
    if(committed)return res;
  }
  throw {code:'aborted'};
}
