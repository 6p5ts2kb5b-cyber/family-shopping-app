// 偽のFirebase Auth（テスト専用）。アプリ名ごとにログイン状態を分ける（本物と同じ）
// - 既定のアプリ（app.html）：Googleログイン。sessionStorage の nextUid で誰としてログインするか決める
// - 名前付きアプリ（kids.html の 'kids'）：匿名ログイン。端末に保存（localStorage）＝本物の IndexedDB 保存に相当
//   fakeAnonDisabled を入れると「匿名ログインが無効」のエラーを再現
const subs={};const key=n=>n==='[DEFAULT]'?'fakeUser':'fakeUser:'+n;
const store=n=>n==='[DEFAULT]'?sessionStorage:localStorage;
const read=n=>JSON.parse(store(n).getItem(key(n))||'null');
const set=(n,u)=>{if(u)store(n).setItem(key(n),JSON.stringify(u));else store(n).removeItem(key(n));(subs[n]||[]).forEach(f=>f(u))};
export class GoogleAuthProvider{setCustomParameters(){}}
export const inMemoryPersistence={};export async function setPersistence(){}
export function getAuth(app){return {name:app?.name||'[DEFAULT]',get currentUser(){return read(this.name)}}}
export function onAuthStateChanged(a,cb){const n=a?.name||'[DEFAULT]';(subs[n]??=[]).push(cb);setTimeout(()=>cb(read(n)),0);return()=>{}}
export async function signInWithPopup(a){const uid=sessionStorage.getItem('nextUid');if(!uid)throw {code:'auth/popup-closed-by-user'};const u={uid,email:uid+'@example.com',isAnonymous:false};set(a?.name||'[DEFAULT]',u);return {user:u}}
export async function signInAnonymously(a){if(localStorage.getItem('fakeAnonDisabled'))throw {code:'auth/admin-restricted-operation'};const u={uid:localStorage.getItem('nextAnonUid')||('anon'+Math.random().toString(36).slice(2,12)),isAnonymous:true};set(a?.name||'[DEFAULT]',u);return {user:u}}
export async function signOut(a){set(a?.name||'[DEFAULT]',null)}
export function __user(n='[DEFAULT]'){return read(n)}
