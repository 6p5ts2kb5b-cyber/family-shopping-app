// Firestore ルールの許可・拒否テスト（Firebase Emulator = 本番と同じルールエンジン）
// setup.html が実際に生成するルールを取り出し、ダミーの管理者UIDで検証する。
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { createHash } from 'node:crypto';

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

test('予定：夫・妻・子ども3人・家族と旧データの「me」を受け付け、それ以外は拒否', async () => {
  const db = wife();
  for (const who of ['husband', 'wife', 'family', 'me', 'child1', 'child2', 'child3']) await assertSucceeds(setDoc(doc(db, `familySchedules/${who}`), sched({ who })));
  await assertFails(setDoc(doc(db, 'familySchedules/x'), sched({ who: 'son' })));
  await assertFails(setDoc(doc(db, 'familySchedules/y'), sched({ who: 'child4' })));
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


// ==================== 子どもへの伝言板 ====================
const TAB = 'tabletUid01', TAB2 = 'tabletUid02';
const tablet = (uid = TAB) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const sha = (t) => createHash('sha256').update(t).digest('hex');
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv12';
const notice = (o = {}) => ({ text: '水筒を持ってね', targets: ['child1', 'child3'], period: 'morning', repeat: 'daily', onDate: '', active: true, updatedAt: serverTimestamp(), ...o });
const seedKids = async () => {
  await seed('kidNotices/n1', { ...notice(), updatedAt: Timestamp.now() });
  await seed('kidTemplates/t1', { text: '宿題をしよう', order: 0 });
  await seed('kidSettings/board', { pause: '', eveningFrom: '12:00' });
  await seed('familySettings/children', { child1: 'テスト1', child2: 'テスト2', child3: 'テスト3' });
  await seed('familySettings/parents', { husband: 'テスト夫', wife: 'テスト妻' });
  await seed('shoppingItems/a', item());
  await seed('familySchedules/s', sched());
};
const registerDevice = (uid = TAB) => seed(`kidDevices/${uid}`, { label: 'リビング', addedAt: Timestamp.now(), pairToken: TOKEN });
// タブレットが自分で申請を出す（本物と同じ手順）
const requestPair = (uid = TAB, token = TOKEN) => setDoc(doc(tablet(uid), `kidPairRequests/${uid}`), { tokenHash: sha(token), createdAt: serverTimestamp() });
// 管理者の承認＝端末の登録と申請の削除を1回の書き込みで
const approve = (db, uid = TAB, token = TOKEN, label = 'リビング') => {
  const b = writeBatch(db);
  b.set(doc(db, `kidDevices/${uid}`), { label, addedAt: serverTimestamp(), pairToken: token });
  b.delete(doc(db, `kidPairRequests/${uid}`));
  return b.commit();
};

test('伝言板：未登録の匿名端末は何も読めない', async () => {
  await seedKids();
  const db = tablet();
  await assertFails(getDocs(collection(db, 'kidNotices')));
  await assertFails(getDoc(doc(db, 'kidSettings/board')));
  await assertFails(getDoc(doc(db, 'familySettings/children')));
  await assertFails(getDocs(collection(db, 'kidTemplates')));
});

test('伝言板：登録済みの端末は伝言・設定・子どもの名前だけ読める（書けない）', async () => {
  await seedKids(); await registerDevice();
  const db = tablet();
  await assertSucceeds(getDocs(collection(db, 'kidNotices')));
  await assertSucceeds(getDoc(doc(db, 'kidSettings/board')));
  await assertSucceeds(getDoc(doc(db, 'familySettings/children')));
  await assertSucceeds(getDoc(doc(db, `kidDevices/${TAB}`)));
  await assertFails(setDoc(doc(db, 'kidNotices/x'), notice()));
  await assertFails(updateDoc(doc(db, 'kidNotices/n1'), { active: false }));
  await assertFails(deleteDoc(doc(db, 'kidNotices/n1')));
  await assertFails(setDoc(doc(db, 'kidSettings/board'), { pause: 'on', eveningFrom: '12:00' }));
  await assertFails(setDoc(doc(db, 'familySettings/children'), { child1: 'a', child2: 'b', child3: 'c' }));
  await assertFails(getDocs(collection(db, 'kidTemplates')));
  await assertFails(getDoc(doc(db, 'familySettings/parents')));
  await assertFails(getDocs(collection(db, 'kidDevices')));
  await assertFails(getDoc(doc(db, `kidDevices/${TAB2}`)));
  await assertFails(setDoc(doc(db, `kidDevices/${TAB2}`), { label: 'x', addedAt: serverTimestamp(), pairToken: TOKEN }));
  await assertFails(deleteDoc(doc(db, `kidDevices/${TAB}`)));
});

test('伝言板：匿名端末（登録済みでも）は買い物・予定・名簿に一切触れない', async () => {
  await seedKids(); await registerDevice();
  for (const db of [tablet(), tablet(TAB2)]) {
    await assertFails(getDoc(doc(db, 'shoppingItems/a')));
    await assertFails(getDocs(collection(db, 'shoppingItems')));
    await assertFails(getDocs(collection(db, 'shoppingFavorites')));
    await assertFails(getDocs(collection(db, 'familySchedules')));
    await assertFails(getDoc(doc(db, 'familySchedules/s')));
    await assertFails(getDocs(collection(db, 'familyMembers')));
    await assertFails(setDoc(doc(db, 'shoppingItems/b'), item()));
    await assertFails(setDoc(doc(db, 'familySchedules/c'), sched()));
    await assertFails(setDoc(doc(db, `familyMembers/${WIFE}`), { addedAt: 1 }));
    await assertFails(deleteDoc(doc(db, 'shoppingItems/a')));
  }
});

test('伝言板：家族は伝言・定型文・設定・表示名を読み書きできる', async () => {
  await seedKids();
  for (const db of [owner(), wife()]) {
    await assertSucceeds(setDoc(doc(db, 'kidNotices/x'), notice()));
    await assertSucceeds(setDoc(doc(db, 'kidNotices/y'), notice({ repeat: 'once', onDate: '2026-10-16', targets: ['child2'] })));
    await assertSucceeds(getDocs(collection(db, 'kidNotices')));
    await assertSucceeds(deleteDoc(doc(db, 'kidNotices/x')));
    await assertSucceeds(setDoc(doc(db, 'kidTemplates/t2'), { text: '音読をしよう', order: 3 }));
    await assertSucceeds(getDocs(collection(db, 'kidTemplates')));
    await assertSucceeds(deleteDoc(doc(db, 'kidTemplates/t2')));
    await assertSucceeds(setDoc(doc(db, 'kidSettings/board'), { pause: '2026-10-15', eveningFrom: '15:30' }));
    await assertSucceeds(setDoc(doc(db, 'kidSettings/board'), { pause: 'on', eveningFrom: '12:00' }));
    await assertSucceeds(setDoc(doc(db, 'familySettings/children'), { child1: 'テスト1', child2: 'テスト2', child3: 'テスト3' }));
    await assertSucceeds(setDoc(doc(db, 'familySettings/parents'), { husband: 'テスト夫', wife: 'テスト妻' }));
    await assertSucceeds(getDoc(doc(db, 'familySettings/parents')));
    await assertSucceeds(getDocs(collection(db, 'kidDevices')));
  }
});

test('伝言板：名簿外・メール未確認・未ログインは読めない', async () => {
  await seedKids(); await registerDevice();
  for (const db of [stranger(), wife(false), anon()]) {
    await assertFails(getDocs(collection(db, 'kidNotices')));
    await assertFails(getDoc(doc(db, 'familySettings/children')));
    await assertFails(getDoc(doc(db, 'kidSettings/board')));
    await assertFails(getDocs(collection(db, 'kidDevices')));
    await assertFails(setDoc(doc(db, 'kidNotices/x'), notice()));
  }
});

test('伝言板：不正な伝言・定型文・設定は拒否', async () => {
  const db = owner();
  await assertFails(setDoc(doc(db, 'kidNotices/a'), notice({ text: '' })));
  await assertFails(setDoc(doc(db, 'kidNotices/b'), notice({ text: 'あ'.repeat(121) })));
  await assertSucceeds(setDoc(doc(db, 'kidNotices/b2'), notice({ text: 'あ'.repeat(120) })));
  await assertFails(setDoc(doc(db, 'kidNotices/c'), notice({ targets: [] })));
  await assertFails(setDoc(doc(db, 'kidNotices/d'), notice({ targets: ['child4'] })));
  await assertFails(setDoc(doc(db, 'kidNotices/e'), notice({ targets: ['child1', 'child1'] })));
  await assertFails(setDoc(doc(db, 'kidNotices/f'), notice({ targets: 'child1' })));
  await assertFails(setDoc(doc(db, 'kidNotices/g'), notice({ period: 'noon' })));
  await assertFails(setDoc(doc(db, 'kidNotices/h'), notice({ repeat: 'weekly' })));
  await assertFails(setDoc(doc(db, 'kidNotices/i'), notice({ repeat: 'once', onDate: '' })));
  await assertFails(setDoc(doc(db, 'kidNotices/j'), notice({ repeat: 'once', onDate: '2026/10/16' })));
  await assertFails(setDoc(doc(db, 'kidNotices/k'), notice({ repeat: 'daily', onDate: '2026-10-16' })));
  await assertFails(setDoc(doc(db, 'kidNotices/l'), notice({ active: 'yes' })));
  await assertFails(setDoc(doc(db, 'kidNotices/m'), notice({ updatedAt: Timestamp.fromMillis(1) })));
  await assertFails(setDoc(doc(db, 'kidNotices/n'), { ...notice(), done: true }));
  await assertFails(setDoc(doc(db, 'kidTemplates/a'), { text: '', order: 0 }));
  await assertFails(setDoc(doc(db, 'kidTemplates/b'), { text: 'x', order: -1 }));
  await assertFails(setDoc(doc(db, 'kidTemplates/c'), { text: 'x', order: 1, targets: ['child1'] }));
  await assertFails(setDoc(doc(db, 'kidSettings/board'), { pause: 'yes', eveningFrom: '12:00' }));
  await assertFails(setDoc(doc(db, 'kidSettings/board'), { pause: '', eveningFrom: '25:00' }));
  await assertFails(setDoc(doc(db, 'kidSettings/other'), { pause: '', eveningFrom: '12:00' }));
  await assertFails(setDoc(doc(db, 'familySettings/children'), { child1: 'a', child2: 'b' }));
  await assertFails(setDoc(doc(db, 'familySettings/children'), { child1: 'a', child2: 'b', child3: 'あ'.repeat(13) }));
  await assertFails(setDoc(doc(db, 'familySettings/other'), { x: 'a' }));
});

test('QR登録：申請は自分のuidの分だけ。他人の申請は読めない・書けない・消せない', async () => {
  await assertSucceeds(requestPair(TAB));
  await assertSucceeds(requestPair(TAB)); // 作り直し（QRの更新）
  await assertSucceeds(getDoc(doc(tablet(TAB), `kidPairRequests/${TAB}`)));
  await assertFails(setDoc(doc(tablet(TAB2), `kidPairRequests/${TAB}`), { tokenHash: sha('x'.repeat(22)), createdAt: serverTimestamp() }));
  await assertFails(getDoc(doc(tablet(TAB2), `kidPairRequests/${TAB}`)));
  await assertFails(deleteDoc(doc(tablet(TAB2), `kidPairRequests/${TAB}`)));
  await assertFails(getDocs(collection(tablet(TAB), 'kidPairRequests')));
  await assertFails(getDocs(collection(owner(), 'kidPairRequests'))); // 管理者も一覧は見ない（QRで指定した1件だけ）
  await assertSucceeds(getDoc(doc(owner(), `kidPairRequests/${TAB}`)));
  await assertFails(getDoc(doc(wife(), `kidPairRequests/${TAB}`)));
  for (const db of [stranger(), wife(), anon()]) await assertFails(setDoc(doc(db, `kidPairRequests/${TAB2}`), { tokenHash: sha(TOKEN), createdAt: serverTimestamp() }));
  // 形式違い・端末の時刻・余計な項目
  await assertFails(setDoc(doc(tablet(TAB2), `kidPairRequests/${TAB2}`), { tokenHash: 'abc', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(tablet(TAB2), `kidPairRequests/${TAB2}`), { tokenHash: sha(TOKEN), createdAt: Timestamp.now() }));
  await assertFails(setDoc(doc(tablet(TAB2), `kidPairRequests/${TAB2}`), { tokenHash: sha(TOKEN), createdAt: serverTimestamp(), token: TOKEN }));
  await assertSucceeds(deleteDoc(doc(tablet(TAB), `kidPairRequests/${TAB}`)));
});

test('QR登録：管理者が正しいトークンで承認すると登録され、端末が伝言を読める', async () => {
  await seedKids();
  await assertFails(getDocs(collection(tablet(), 'kidNotices')));
  await assertSucceeds(requestPair());
  await assertSucceeds(approve(owner()));
  await assertSucceeds(getDoc(doc(tablet(), `kidDevices/${TAB}`)));
  await assertSucceeds(getDocs(collection(tablet(), 'kidNotices')));
});

test('QR登録：管理者以外は承認できない', async () => {
  await assertSucceeds(requestPair());
  for (const db of [wife(), stranger(), tablet(), tablet(TAB2), anon()]) await assertFails(approve(db));
});

test('QR登録：トークン違い・申請なし・申請を消さない・期限切れは拒否', async () => {
  await assertSucceeds(requestPair());
  await assertFails(approve(owner(), TAB, 'ZZZZZZZZZZZZZZZZZZZZZZ'));           // トークン違い
  await assertFails(approve(owner(), TAB2));                                     // 申請なし
  await assertFails(setDoc(doc(owner(), `kidDevices/${TAB}`), { label: 'x', addedAt: serverTimestamp(), pairToken: TOKEN })); // 申請を消さない
  await assertFails((() => { const db = owner(), b = writeBatch(db); b.set(doc(db, `kidDevices/${TAB}`), { label: 'x', addedAt: Timestamp.now(), pairToken: TOKEN }); b.delete(doc(db, `kidPairRequests/${TAB}`)); return b.commit(); })()); // 端末時刻
  await assertFails((() => { const db = owner(), b = writeBatch(db); b.set(doc(db, `kidDevices/${TAB}`), { label: '', addedAt: serverTimestamp(), pairToken: TOKEN }); b.delete(doc(db, `kidPairRequests/${TAB}`)); return b.commit(); })()); // 端末名なし
  // 期限切れ（11分前の申請）
  await seed(`kidPairRequests/${TAB2}`, { tokenHash: sha(TOKEN), createdAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000) });
  await assertFails(approve(owner(), TAB2));
  // 9分前ならまだ有効
  await seed(`kidPairRequests/${TAB2}`, { tokenHash: sha(TOKEN), createdAt: Timestamp.fromMillis(Date.now() - 9 * 60 * 1000) });
  await assertSucceeds(approve(owner(), TAB2));
});

test('QR登録：使用済みQRの再利用・二重承認・登録情報の書き換えは拒否', async () => {
  await assertSucceeds(requestPair());
  await assertSucceeds(approve(owner()));
  await assertFails(approve(owner()));                                           // 同じQRをもう一度
  await assertFails(setDoc(doc(owner(), `kidDevices/${TAB}`), { label: 'x', addedAt: serverTimestamp(), pairToken: TOKEN }));
  await assertFails(updateDoc(doc(owner(), `kidDevices/${TAB}`), { pairToken: 'YYYYYYYYYYYYYYYYYYYYYY' }));
  await assertSucceeds(updateDoc(doc(owner(), `kidDevices/${TAB}`), { label: '子ども部屋' }));  // 名前の変更だけは可
  await assertFails(updateDoc(doc(wife(), `kidDevices/${TAB}`), { label: 'x' }));
  // 別の端末が同じトークンで申請しても、そのトークンの承認は1回きり
  await assertSucceeds(requestPair(TAB2));
  await assertSucceeds(approve(owner(), TAB2));
  await assertFails(approve(owner(), TAB2));
});

test('QR登録：解除は管理者だけ。解除後は伝言を読めない', async () => {
  await seedKids(); await registerDevice();
  await assertSucceeds(getDocs(collection(tablet(), 'kidNotices')));
  for (const db of [wife(), tablet(), stranger()]) await assertFails(deleteDoc(doc(db, `kidDevices/${TAB}`)));
  await assertSucceeds(deleteDoc(doc(owner(), `kidDevices/${TAB}`)));
  await assertFails(getDocs(collection(tablet(), 'kidNotices')));
  await assertFails(getDoc(doc(tablet(), 'familySettings/children')));
});
