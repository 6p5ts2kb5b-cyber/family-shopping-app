import test from 'node:test';import assert from 'node:assert/strict';
import {noticeApplies,noticesFor,completionKey,isValidNoticeDraft} from '../lib/kid-notices.js';
const n={id:'notice-1',text:'水筒を持ってね',targets:['child1','child3'],period:'morning',repeat:'daily',onDate:'',active:true,updatedAt:{seconds:100,nanoseconds:3}};
test('3人のうち指定対象のみ、朝だけ表示',()=>{
 assert.equal(noticeApplies(n,'2026-10-15','morning','child1'),true);
 assert.equal(noticeApplies(n,'2026-10-15','morning','child2'),false);
 assert.equal(noticeApplies(n,'2026-10-15','evening','child1'),false);
 assert.equal(noticeApplies(n,'2026-10-15','morning','child1',true),false);
 assert.equal(noticeApplies({...n,active:false},'2026-10-15','morning','child1'),false);
});
test('平日は土日を除外し祝日は手動停止',()=>{
 const w={...n,repeat:'weekdays'};
 assert.equal(noticeApplies(w,'2026-10-16','morning','child1'),true);
 assert.equal(noticeApplies(w,'2026-10-17','morning','child1'),false);
 assert.equal(noticeApplies(w,'2026-10-18','morning','child1'),false);
 assert.equal(noticeApplies(w,'2026-10-19','morning','child1',true),false);
});
test('今日だけ明日だけを同じonceで扱う',()=>{
 const once={...n,repeat:'once',onDate:'2026-10-16'};
 assert.equal(noticeApplies(once,'2026-10-15','morning','child1'),false);
 assert.equal(noticeApplies(once,'2026-10-16','morning','child1'),true);
 assert.equal(noticesFor([n,once],'2026-10-16','morning','child1').length,2);
});
test('伝言更新と日付変更で完了チェックが別になる',()=>{
 const key=completionKey('2026-10-15','child1','morning',n);
 assert.notEqual(key,completionKey('2026-10-16','child1','morning',n));
 assert.notEqual(key,completionKey('2026-10-15','child1','morning',{...n,updatedAt:{seconds:101}}));
 assert.notEqual(key,completionKey('2026-10-15','child2','morning',n));
});
test('本文・子どもID・日時などの入力検証',()=>{
 assert.equal(isValidNoticeDraft(n),true);
 assert.equal(isValidNoticeDraft({...n,targets:['child1','child1']}),false);
 assert.equal(isValidNoticeDraft({...n,targets:['child4']}),false);
 assert.equal(isValidNoticeDraft({...n,text:'x'.repeat(121)}),false);
 assert.equal(isValidNoticeDraft({...n,repeat:'once',onDate:'2026-02-30'}),false);
 assert.equal(isValidNoticeDraft({...n,repeat:'once',onDate:'2026-10-16'}),true);
});
