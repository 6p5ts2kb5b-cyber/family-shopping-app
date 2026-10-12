// Firestore ルールの許可・拒否テスト（Firebase Emulator = 本番と同じルールエンジン）
// setup.html が実際に生成するルールを取り出し、ダミーの管理者UIDで検証する。
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const html = readFileSync(new URL('../setup.html', import.meta.url), 'utf8');
const m = html.match(/return `(rules_version[\s\S]*?)`;\n\}/);
assert.ok(m, 'setup.html から buildRules のテンプレートを取り出せない');
const OWNER = 'ownerUid0001';
const rules = m[1].replace('${owner}', OWNER);
assert.ok(!rules.includes('${'), 'テンプレートに未置換の変数が残っている');

const WIFE = 'wife@example.com';
let env;
const owner = () => env.authenticatedContext(OWNER, { email: 'owner@example.com', email_verified: true }).firestore();
const wife = (verified = true, email = WIFE) => env.authenticatedContext('wifeUid0002', { email, email_verified: verified }).firestore();
const stranger = () => env.authenticatedContext('strangerUid3', { email: 'stranger@example.com', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (path, data) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));
const item = (o = {}) => ({ name: '牛乳', quantity: 2, done: false, createdAt: 1760000000000, doneAt: null, ...o });
const sched = (o = {}) => ({ date: '2026-10-12', name: 'パート', who: 'wife', departure: '08:40', returnTime: '15:00', ...o });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-family-shopping', firestore: { rules, host: '127.0.0.1', port: 8080 } });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(`familyMembers/${WIFE}`, { addedAt: 1760000000000 });
});

test('管理者：全コレクションを読み書きできる', async () => {
  const db = owner();
  await assertSucceeds(setDoc(doc(db, 'shoppingItems/a'), item()));
  await assertSucceeds(setDoc(doc(db, 'shoppingFavorites/b'), { name: '卵' }));
  await assertSucceeds(setDoc(doc(db, 'familySchedules/c'), sched({ who: 'husband' })));
  await assertSucceeds(getDocs(collection(db, 'familyMembers')));
  await assertSucceeds(setDoc(doc(db, 'familyMembers/other@example.com'), { addedAt: 1 }));
  await assertSucceeds(deleteDoc(doc(db, 'familyMembers/other@example.com')));
});

test('名簿の妻：買い物・よく買うもの・予定を読み書きできる', async () => {
  const db = wife();
  await assertSucceeds(setDoc(doc(db, 'shoppingItems/a'), item()));
  await assertSucceeds(updateDoc(doc(db, 'shoppingItems/a'), { quantity: 3 }));
  await assertSucceeds(setDoc(doc(db, 'shoppingItems/a'), { done: true, doneAt: 1760000001000 }, { merge: true }));
  await assertSucceeds(getDocs(collection(db, 'shoppingItems')));
  await assertSucceeds(setDoc(doc(db, 'shoppingFavorites/b'), { name: '卵' }));
  await assertSucceeds(setDoc(doc(db, 'familySchedules/c'), sched()));
  await assertSucceeds(getDocs(collection(db, 'familySchedules')));
  await assertSucceeds(getDocs(collection(db, 'familyMembers')));
  await assertSucceeds(deleteDoc(doc(db, 'shoppingItems/a')));
});

test('名簿の妻：メールの大文字小文字が違っても入れる', async () => {
  await assertSucceeds(getDocs(collection(wife(true, 'Wife@Example.com'), 'shoppingItems')));
});

test('名簿の妻：名簿は変更できない', async () => {
  const db = wife();
  await assertFails(setDoc(doc(db, 'familyMembers/friend@example.com'), { addedAt: 1 }));
  await assertFails(deleteDoc(doc(db, `familyMembers/${WIFE}`)));
});

test('メール未確認・名簿外・未ログインは何もできない', async () => {
  await seed('shoppingItems/a', item());
  for (const db of [wife(false), stranger(), anon()]) {
    await assertFails(getDoc(doc(db, 'shoppingItems/a')));
    await assertFails(getDocs(collection(db, 'shoppingItems')));
    await assertFails(getDocs(collection(db, 'familySchedules')));
    await assertFails(getDocs(collection(db, 'shoppingFavorites')));
    await assertFails(getDocs(collection(db, 'familyMembers')));
    await assertFails(setDoc(doc(db, 'shoppingItems/b'), item()));
    await assertFails(setDoc(doc(db, 'familySchedules/c'), sched()));
    await assertFails(setDoc(doc(db, 'familyMembers/x@example.com'), { addedAt: 1 }));
    await assertFails(deleteDoc(doc(db, 'shoppingItems/a')));
  }
});

test('予定：夫・妻・家族と旧データの「me」を受け付け、それ以外は拒否', async () => {
  const db = wife();
  for (const who of ['husband', 'wife', 'family', 'me']) await assertSucceeds(setDoc(doc(db, `familySchedules/${who}`), sched({ who })));
  await assertFails(setDoc(doc(db, 'familySchedules/x'), sched({ who: 'son' })));
});

test('予定：形式チェック', async () => {
  const db = wife();
  await assertSucceeds(setDoc(doc(db, 'familySchedules/ok'), sched({ departure: '', returnTime: '' })));
  await assertSucceeds(setDoc(doc(db, 'familySchedules/ok2'), sched({ name: 'あ'.repeat(80) })));
  await assertFails(setDoc(doc(db, 'familySchedules/n1'), sched({ name: '' })));
  await assertFails(setDoc(doc(db, 'familySchedules/n2'), sched({ name: 'あ'.repeat(81) })));
  await assertFails(setDoc(doc(db, 'familySchedules/d1'), sched({ date: '2026/10/12' })));
  await assertFails(setDoc(doc(db, 'familySchedules/t1'), sched({ departure: '24:00' })));
  await assertFails(setDoc(doc(db, 'familySchedules/t2'), sched({ returnTime: '8:40' })));
  await assertFails(setDoc(doc(db, 'familySchedules/k1'), { ...sched(), memo: 'x' }));
  const { returnTime, ...missing } = sched();
  await assertFails(setDoc(doc(db, 'familySchedules/k2'), missing));
});

test('買い物：形式チェック', async () => {
  const db = owner();
  await assertSucceeds(setDoc(doc(db, 'shoppingItems/ok'), item({ name: 'あ'.repeat(60), quantity: 999 })));
  await assertFails(setDoc(doc(db, 'shoppingItems/q0'), item({ quantity: 0 })));
  await assertFails(setDoc(doc(db, 'shoppingItems/q1'), item({ quantity: 1000 })));
  await assertFails(setDoc(doc(db, 'shoppingItems/q2'), item({ quantity: '2' })));
  await assertFails(setDoc(doc(db, 'shoppingItems/q3'), item({ quantity: 1.5 })));
  await assertFails(setDoc(doc(db, 'shoppingItems/n1'), item({ name: 'あ'.repeat(61) })));
  await assertFails(setDoc(doc(db, 'shoppingItems/k1'), item({ addedBy: 'x' })));
  await assertFails(setDoc(doc(db, 'shoppingFavorites/f1'), { name: '' }));
  await assertFails(setDoc(doc(db, 'shoppingFavorites/f2'), { name: '卵', extra: 1 }));
});

test('名簿：管理者でも不正な形式は拒否', async () => {
  const db = owner();
  await assertFails(setDoc(doc(db, 'familyMembers/Upper@Example.com'), { addedAt: 1 }));
  await assertFails(setDoc(doc(db, 'familyMembers/not-an-email'), { addedAt: 1 }));
  await assertFails(setDoc(doc(db, 'familyMembers/a@example.com'), { addedAt: 1, role: 'admin' }));
});

test('ほかのコレクションは誰も使えない', async () => {
  await assertFails(setDoc(doc(owner(), 'other/x'), { a: 1 }));
  await assertFails(getDoc(doc(owner(), 'other/x')));
});
