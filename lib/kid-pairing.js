// 子ども用タブレットのQR登録で使う小さな関数（画面・Firebaseに依存しない）
// QRに入れるのは「匿名uid」と「使い捨てトークン」だけ。長期の秘密は入れない。
export const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const UID_RE = /^[A-Za-z0-9]{6,128}$/;
export const PAIR_TTL_MS = 10 * 60 * 1000;   // ルールと同じ10分
export const PAIR_REFRESH_MS = 5 * 60 * 1000; // タブレットは5分ごとに作り直す

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 128bitの乱数トークン（22文字） */
export function newToken(cryptoObj = globalThis.crypto) {
  const b = new Uint8Array(16);
  cryptoObj.getRandomValues(b);
  return b64url(b);
}

/** SHA-256（16進・小文字）。Firestoreルールの hashing.sha256(...).toHexString().lower() と同じ値 */
export async function sha256Hex(text, cryptoObj = globalThis.crypto) {
  const buf = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** QRのURL。# の後ろはWebサーバーに送られない */
export function pairUrl(appUrl, uid, token) {
  if (!UID_RE.test(uid) || !TOKEN_RE.test(token)) throw new Error('invalid pairing data');
  return `${appUrl}#pair=${uid}.${token}`;
}

/** app.html の location.hash から取り出す。形が違えば null */
export function parsePair(hash) {
  const m = /^#pair=([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m || !UID_RE.test(m[1]) || !TOKEN_RE.test(m[2])) return null;
  return { uid: m[1], token: m[2] };
}

/**
 * 確認の絵（タブレットと親のスマホで同じものが出る。QRのすり替えに気づくため）
 * uid も混ぜる：uid は Firebase が決めるので、同じ絵になるQRを作り直して用意するのは現実的でない
 */
export const CHECK_EMOJIS = ['🐶', '🐱', '🐰', '🐻', '🐼', '🐸', '🐧', '🐢', '🍎', '🍌', '🍇', '🍓', '🍉', '🌻', '🌈', '⭐', '🚗', '🚲', '🚀', '⛵', '⚽', '🎈', '🎵', '🍙', '🍩', '🌙', '☀️', '🔔', '🎁', '🦁', '🐳', '🦋'];
export async function checkEmojis(uid, token, cryptoObj = globalThis.crypto) {
  const h = await sha256Hex('check:' + uid + '.' + token, cryptoObj);
  return [0, 2, 4].map((i) => CHECK_EMOJIS[parseInt(h.slice(i, i + 2), 16) % CHECK_EMOJIS.length]);
}

/** 親のスマホでは「タブレットに出ている絵」を4つの中から選ぶ（「同じ？」に はい と答えるだけにしない） */
export function emojiChoices(correct, rand = Math.random) {
  const key = (set) => set.join('');
  const sets = [correct], seen = new Set([key(correct)]);
  while (sets.length < 4) {
    const s = [0, 1, 2].map(() => CHECK_EMOJIS[Math.floor(rand() * CHECK_EMOJIS.length)]);
    if (!seen.has(key(s))) { seen.add(key(s)); sets.push(s); }
  }
  for (let i = sets.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [sets[i], sets[j]] = [sets[j], sets[i]]; }
  return sets;
}
