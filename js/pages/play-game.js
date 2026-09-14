import { db, doc, getDoc, onUserReady, getGamePurchaseDates } from '../common.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id');

const titleEl = document.getElementById('pgTitle');
const expiryEl = document.getElementById('pgExpiry');
const content = document.getElementById('pgContent');

// Some mobile browsers (Kiwi in particular) don't reliably recompute
// percentage/vh-based heights the instant fullscreen toggles, leaving a
// blank strip where the address bar used to be. Setting the actual pixel
// height directly sidesteps that — it's recalculated on every resize and
// fullscreenchange, which covers both entering/exiting fullscreen and the
// address bar showing/hiding on scroll.
function syncViewportHeight(){
  const h = window.innerHeight + 'px';
  document.documentElement.style.height = h;
  document.body.style.height = h;
  content.style.height = h;
}
syncViewportHeight();
window.addEventListener('resize', syncViewportHeight);
document.addEventListener('fullscreenchange', syncViewportHeight);

// Many pasted game pages assume they're the whole page and use height:100%
// on their own containers, but never actually reset html/body to fill the
// viewport (the exact same bug our own wrapper page had). We can't touch
// the game author's markup, so we inject that one reset rule into whatever
// <head> the game has (or add one) — this alone fixes most "not full
// screen" cases without touching the game's own layout/canvas.
function withFullscreenReset(html){
  const reset = '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;}</style>';
  if(/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m)=> m + reset);
  if(/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m)=> m + '<head>' + reset + '</head>');
  return reset + html;
}

function showGate(heading, message, showBuyBtn){
  content.innerHTML = `
    <div class="pg-gate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.2" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="17.8" cy="13.4" r="1" fill="currentColor" stroke="none"/></svg>
      <h2>${heading}</h2>
      <p>${message}</p>
      ${showBuyBtn ? `<a href="games.html" class="btn-primary" style="text-decoration:none; padding:11px 22px; border-radius:10px;">গেমস পেজে যান</a>` : ''}
    </div>
  `;
}

function fmtDate(d){
  return d.toLocaleDateString('bn-BD', { day:'numeric', month:'short', year:'numeric' });
}

async function boot(){
  if(!id){
    titleEl.textContent = 'পাওয়া যায়নি';
    showGate('গেম পাওয়া যায়নি', 'লিংকটি সঠিক নয়। গেমস পেজ থেকে আবার চেষ্টা করুন।', true);
    return;
  }

  let game;
  try{
    const snap = await getDoc(doc(db, 'games', id));
    if(!snap.exists()){
      titleEl.textContent = 'পাওয়া যায়নি';
      showGate('গেম পাওয়া যায়নি', 'এই গেমটি এখন আর নেই।', true);
      return;
    }
    game = { id: snap.id, ...snap.data() };
  }catch(err){
    console.error('play-game fetch error:', err);
    titleEl.textContent = 'লোড করা যায়নি';
    showGate('লোড করা যায়নি', 'Firestore রুলস/কানেকশন চেক করুন।', false);
    return;
  }

  titleEl.textContent = game.name || 'গেম';

  onUserReady(async (user)=>{
    if(!user){
      showGate('লগ ইন করুন', 'এই গেমটি খেলতে আগে লগ ইন করুন। কয়েক মুহূর্তের মধ্যে লগ ইন পেজে নিয়ে যাওয়া হচ্ছে...', false);
      setTimeout(()=>{ window.location.href = 'login.html'; }, 1200);
      return;
    }
    const dates = await getGamePurchaseDates(user.uid);
    const purchasedAt = dates.get(id);
    if(!purchasedAt){
      showGate('এখনো কেনা হয়নি', 'এই গেমটি খেলতে আগে কিনতে হবে।', true);
      return;
    }
    const planDays = Number(game.planDays || 0);
    const expiresAt = new Date(purchasedAt.getTime() + planDays * 24 * 60 * 60 * 1000);
    if(expiresAt.getTime() <= Date.now()){
      showGate('মেয়াদ শেষ হয়ে গেছে', 'এই গেমটির প্ল্যানের মেয়াদ শেষ হয়ে গেছে। আবার খেলতে হলে নতুন করে কিনুন।', true);
      return;
    }
    if(!game.gameHtml){
      showGate('গেম কোড পাওয়া যায়নি', 'অ্যাডমিন এখনো এই গেমের HTML কোড যোগ করেননি।', false);
      return;
    }
    expiryEl.textContent = 'মেয়াদ: ' + fmtDate(expiresAt);
    const wrap = document.createElement('div');
    wrap.className = 'pg-frame-wrap';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups');
    iframe.setAttribute('allow', 'fullscreen; autoplay; gamepad');
    iframe.setAttribute('allowfullscreen', '');
    // srcdoc is set as a property (not an HTML attribute string) so the
    // game's own markup/quotes can't break out of the iframe tag.
    iframe.srcdoc = withFullscreenReset(game.gameHtml);
    wrap.appendChild(iframe);
    content.innerHTML = '';
    content.appendChild(wrap);
  });
}

boot();

/* ---------- Fullscreen toggle — hides the browser's own address bar too,
   for a truly immersive edge-to-edge game. Requesting fullscreen must
   happen inside a direct user click (browsers block it otherwise), so
   this can't be done automatically on page load — the floating button
   is the reliable way to offer it. ---------- */
const fullscreenBtn = document.getElementById('pgFullscreenBtn');
const EXPAND_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const COLLAPSE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v3a2 2 0 0 1-2 2H4M21 9h-3a2 2 0 0 1-2-2V4M3 15h3a2 2 0 0 1 2 2v3M15 21v-3a2 2 0 0 1 2-2h3"/></svg>';

function updateFullscreenIcon(){
  const active = !!document.fullscreenElement;
  fullscreenBtn.innerHTML = active ? COLLAPSE_ICON : EXPAND_ICON;
  document.body.classList.toggle('is-fullscreen', active);
}

fullscreenBtn.addEventListener('click', async ()=>{
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }else{
      await document.exitFullscreen();
    }
  }catch(err){
    console.error('fullscreen toggle error:', err);
  }
});
document.getElementById('pgFullscreenExitBtn').addEventListener('click', async ()=>{
  try{
    if(document.fullscreenElement) await document.exitFullscreen();
  }catch(err){
    console.error('fullscreen exit error:', err);
  }
});
document.addEventListener('fullscreenchange', updateFullscreenIcon);
