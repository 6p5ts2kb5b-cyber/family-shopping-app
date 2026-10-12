// 偽のFirestore（localStorageに保存。別タブへは storage イベントで即時反映＝リアルタイム同期の再現）
// ownerUid＝管理者、familyMembers＝名簿。名簿外は permission-denied、名簿の変更は管理者だけ。
// localStorage-backed fake Firestore; other tabs get 'storage' events (= realtime sync)
import {__user} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const load=()=>JSON.parse(localStorage.getItem('fakeDB')||'{}');const save=d=>{localStorage.setItem('fakeDB',JSON.stringify(d));notify()};
const isOwner=u=>u&&u.uid===localStorage.getItem('ownerUid');
const check=(col)=>{const u=__user();if(!u)throw {code:'permission-denied'};const mem=Object.keys(load().familyMembers||{});if(!isOwner(u)&&!mem.includes(u.email.toLowerCase()))throw {code:'permission-denied'}};
const checkW=(col)=>{check(col);if(col==='familyMembers'&&!isOwner(__user()))throw {code:'permission-denied'}};
const listeners=[];function notify(){listeners.forEach(l=>l())}
window.addEventListener('storage',e=>{if(e.key==='fakeDB')notify()});
export function getFirestore(){return {}}
export function collection(db,name){return {col:name}}
export function doc(a,b,c){return c!==undefined?{col:b,id:c}:{col:a.col,id:b}}
export function onSnapshot(ref,next,err){const run=()=>{try{check()}catch(e){err(e);return}const d=load()[ref.col]||{};next({docs:Object.entries(d).map(([id,v])=>({id,data:()=>v}))})};listeners.push(run);setTimeout(run,0);return()=>{listeners.splice(listeners.indexOf(run),1)}}
export async function setDoc(ref,data,opt){checkW(ref.col);const d=load();d[ref.col]??={};d[ref.col][ref.id]=opt?.merge?{...d[ref.col][ref.id],...data}:data;save(d)}
export async function deleteDoc(ref){checkW(ref.col);const d=load();if(d[ref.col])delete d[ref.col][ref.id];save(d)}
export async function runTransaction(db,fn){check();const d=load();const tx={get:async r=>{const v=d[r.col]?.[r.id];return{exists:()=>!!v,data:()=>v}},set:(r,v)=>{d[r.col]??={};d[r.col][r.id]=v},update:(r,v)=>{d[r.col][r.id]={...d[r.col][r.id],...v}},delete:(r)=>{if(d[r.col])delete d[r.col][r.id]}};const res=await fn(tx);save(d);return res}
export async function getDocs(ref){check();const d=load()[ref.col]||{};const docs=Object.entries(d).map(([id,v])=>({id,data:()=>v}));return {docs,size:docs.length}}
