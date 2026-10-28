// 画面の「動き」（親の画面・子ども用タブレット共通）
// motion-prompt の中から、使いやすさを損なわないものだけを選んで実装：
//  #001 ポップイン / #002 スタガー / #003 バースト / #015 パーティクル / #004 ラインドロー
//  #010 オーバーシュート / #024 インパクトシェイク / #051 ボトムシート / #056 トースト / #057 タブ
//  #063 ステッパー / #071 バッジ / #072 エンプティステート / #080 マーカー / #081 ホバーで浮き上がる
//  #085 リップル / #096 ふわふわ / #123 バウンス / #125 パルス / #166 いいね
// 方針：データの保存や表示を遅らせない（動きは「上に重ねるだけ」）。端末の「視差効果を減らす」設定では動かさない。

export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const CSS = `
@keyframes m-pop{0%{opacity:0;transform:scale(.86)}60%{opacity:1;transform:scale(1.03)}100%{transform:none}}
@keyframes m-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes m-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes m-bump{0%{transform:scale(1)}35%{transform:scale(1.35)}65%{transform:scale(.92)}100%{transform:scale(1)}}
@keyframes m-shake{0%,100%{transform:none}15%{transform:translateX(-8px)}30%{transform:translateX(7px)}45%{transform:translateX(-5px)}60%{transform:translateX(4px)}75%{transform:translateX(-2px)}}
@keyframes m-sheet{from{transform:translateY(100%)}to{transform:none}}
@keyframes m-dim{from{opacity:0}to{opacity:1}}
@keyframes m-toast{0%{opacity:0;transform:translateY(16px) scale(.96)}70%{opacity:1;transform:translateY(-2px)}100%{transform:none}}
@keyframes m-ripple{from{transform:translate(-50%,-50%) scale(0);opacity:.35}to{transform:translate(-50%,-50%) scale(1);opacity:0}}
@keyframes m-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes m-pulse{0%{box-shadow:0 0 0 0 var(--m-pulse,rgba(46,139,87,.45))}100%{box-shadow:0 0 0 10px transparent}}
@keyframes m-bounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-10px)}50%{transform:translateY(0)}70%{transform:translateY(-4px)}}
@keyframes m-mark{from{background-size:0% 100%}to{background-size:100% 100%}}
@keyframes m-like{0%{transform:scale(1)}25%{transform:scale(.9)}55%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes m-draw{to{stroke-dashoffset:0}}
@keyframes m-away{0%{opacity:1;transform:none}60%{opacity:1;transform:none}100%{opacity:0;transform:translateX(24px)}}
.m-pop{animation:m-pop .38s cubic-bezier(.2,.9,.3,1.2) both}
.m-in{animation:m-rise .34s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*45ms)}
.m-bump{animation:m-bump .42s cubic-bezier(.3,1.4,.5,1)}
.m-shake{animation:m-shake .42s ease-out}
.m-like{animation:m-like .45s cubic-bezier(.3,1.5,.5,1)}
.m-bounce{animation:m-bounce .9s ease-out 2}
.m-mark{background-image:linear-gradient(transparent 55%,rgba(255,213,79,.75) 55%);background-repeat:no-repeat;background-size:100% 100%;animation:m-mark .5s ease-out both}
.m-rip{position:absolute;border-radius:50%;pointer-events:none;background:currentColor;animation:m-ripple .55s ease-out forwards}
.m-host{overflow:hidden!important}
.m-host-rel{position:relative}
.m-burst{position:fixed;left:0;top:0;width:10px;height:10px;border-radius:3px;pointer-events:none;z-index:9999}
.m-ghost{position:fixed;z-index:40;pointer-events:none;margin:0;animation:m-away .55s ease-in forwards}
.m-ghost .check i{background:#2E8B57;border-color:#2E8B57}
.m-ghost svg.m-tick{position:absolute;width:16px;height:16px}
.m-ghost svg.m-tick path{stroke-dasharray:24;stroke-dashoffset:24;animation:m-draw .28s ease-out forwards}
@media (prefers-reduced-motion:reduce){
  .m-pop,.m-in,.m-bump,.m-shake,.m-like,.m-bounce,.m-mark,.m-ghost{animation:none!important}
  .m-rip,.m-burst,.m-ghost{display:none!important}
}`;

export function installMotion(extraCss = '') {
  if (document.getElementById('motionCss')) return;
  const s = document.createElement('style'); s.id = 'motionCss'; s.textContent = CSS + extraCss; document.head.append(s);
}

/** クラスを付け直して動きを最初から再生（終わったら外す） */
export function play(el, cls) {
  if (!el || reduced()) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  const done = () => el.classList.remove(cls);
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 2000);
}
export function bump(el) {
  if (!el) return;
  // 文字だけの要素（span など）は、そのままだと大きさが変えられないので inline-block にする
  if (el.isConnected && getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
  else if (!el.isConnected && /^(SPAN|B|STRONG|OUTPUT|SMALL)$/.test(el.tagName) && !el.style.display) el.style.display = 'inline-block';
  play(el, 'm-bump');
}
export const shake = (el) => play(el, 'm-shake');

/**
 * 一覧を描き直したあとに呼ぶ：はじめての表示は順番にふわっと（スタガー）、
 * あとから増えたものだけポップイン。描き直しのたびに全部が動くことはない。
 * items: [ [key, element], ... ]、seen: 前回までのキーを覚えておく Set（呼び出し側で保持）
 */
export function enter(items, seen, state) {
  const first = !state.ready;
  if (!reduced()) {
    let i = 0;
    for (const [key, node] of items) {
      if (first) { if (i < 10) { node.style.setProperty('--i', i); node.classList.add('m-in'); } i++; }
      else if (!seen.has(key)) node.classList.add('m-pop');
    }
  }
  seen.clear(); for (const [key] of items) seen.add(key);
  if (items.length || first) state.ready = true;
}

/** タップした場所から広がる波紋（ボタンの押した感） */
export function enableRipple(selector) {
  document.addEventListener('pointerdown', (e) => {
    if (reduced() || e.button > 0) return;
    const host = e.target.closest?.(selector);
    if (!host || host.disabled) return;
    const r = host.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'm-rip'; dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`;
    if (getComputedStyle(host).position === 'static') host.classList.add('m-host-rel');
    host.classList.add('m-host'); host.append(dot);
    setTimeout(() => { dot.remove(); if (!host.querySelector('.m-rip')) host.classList.remove('m-host', 'm-host-rel'); }, 600);
  }, { passive: true });
}

/** 紙ふぶき（x,y は画面上の位置）。count が多いほど派手 */
export function burst(x, y, { colors = ['#F4B942', '#2E8B57', '#E86A92', '#4F8FE0', '#9B6BD3'], count = 18, spread = 120 } = {}) {
  if (reduced() || !document.body.animate) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'm-burst'; p.setAttribute('aria-hidden', 'true');
    p.style.background = colors[i % colors.length];
    if (i % 3 === 0) p.style.borderRadius = '50%';
    document.body.append(p);
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5, d = spread * (0.55 + Math.random() * 0.6);
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d - spread * 0.35, rot = (Math.random() - 0.5) * 720;
    const anim = p.animate([
      { transform: `translate(${x}px,${y}px) rotate(0) scale(1)`, opacity: 1 },
      { transform: `translate(${x + dx}px,${y + dy}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x + dx * 1.1}px,${y + dy + spread * 0.6}px) rotate(${rot}deg) scale(.6)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' });
    const rm = () => p.remove(); anim.onfinish = rm; setTimeout(rm, 1500);
  }
}
export function burstAt(el, opts) {
  if (!el) return; const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return; // 見えていないときは出さない
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/**
 * 「買った」行の残像：元の場所にチェックが描かれてから右へ消える（実際の一覧はすぐ更新される）
 * row は .item 要素。残像は読み上げ・操作の対象外。
 */
export function ghostDone(row) {
  if (reduced() || !row?.isConnected) return;
  const r = row.getBoundingClientRect();
  if (!r.width) return;
  const g = row.cloneNode(true);
  g.classList.add('m-ghost'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
  for (const b of g.querySelectorAll('button,[id]')) { b.removeAttribute('id'); b.tabIndex = -1; }
  g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:var(--card,#fff)`;
  const ck = g.querySelector('.check i');
  if (ck) {
    ck.style.position = 'relative';
    ck.innerHTML = '<svg class="m-tick" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';
  }
  document.body.append(g);
  setTimeout(() => g.remove(), 700);
}
