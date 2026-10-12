const subs=[];let cur=JSON.parse(sessionStorage.getItem('fakeUser')||'null');
export class GoogleAuthProvider{setCustomParameters(){}}
export const inMemoryPersistence={};export async function setPersistence(){}
export function getAuth(){return {}}
export function onAuthStateChanged(a,cb){subs.push(cb);setTimeout(()=>cb(cur),0);return()=>{}}
export async function signInWithPopup(){const uid=sessionStorage.getItem('nextUid');if(!uid)throw {code:'auth/popup-closed-by-user'};cur={uid,email:uid+'@example.com'};sessionStorage.setItem('fakeUser',JSON.stringify(cur));subs.forEach(f=>f(cur));return {user:cur}}
export async function signOut(){cur=null;sessionStorage.removeItem('fakeUser');subs.forEach(f=>f(null))}
export function __user(){return cur}
