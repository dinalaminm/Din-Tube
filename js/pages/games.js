import {
  db, collection, getDocs,
  onUserReady, getGamePurchaseDates, GAME_TIERS, gameFromPrice,
  itemBg, escapeHtml, renderSkeletonList
} from '../common.js';

const list = document.getElementById('gamesList');
let games = [];
let accessMap = new Map(); // gameId -> { purchasedAt, expiresAt }

function fmtDate(d){
  return d.toLocaleDateString('bn-BD', { day:'numeric', month:'short', year:'numeric' });
}

async function boot(){
  renderSkeletonList('gamesList', 4);
  try{
    const snap = await getDocs(collection(db, 'games'));
    games = [];
    snap.forEach(d => games.push({ id: d.id, ...d.data() }));
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error('games load error:', err);
    return;
  }

  onUserReady(async (user)=>{
    accessMap = user ? await getGamePurchaseDates(user.uid) : new Map();
    render();
  });

  // Render once immediately (without access info) so the page isn't blank
  // while we wait on auth state / purchase history.
  if(games.length) render();
}

function render(){
  if(games.length === 0){
    list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো লাইভ স্ট্রিম যোগ করা হয়নি।</p>';
    return;
  }
  list.innerHTML = games.map((game, i)=>{
    const access = accessMap.get(game.id);
    const active = access && access.expiresAt.getTime() > Date.now();
    const bg = itemBg(game, i);
    const fromPrice = gameFromPrice(game);
    return `
      <a class="gs-item" href="${active ? `play-game.html?id=${encodeURIComponent(game.id)}` : `game-detail.html?id=${encodeURIComponent(game.id)}`}">
        <div class="gs-item-thumb" style="background:${game.imageUrl ? `url('${escapeHtml(game.imageUrl)}') center/cover` : bg};">
          <span class="gs-live-badge"><i></i>LIVE</span>
          <span class="gs-play-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg></span>
        </div>
        <div class="gs-item-body">
          <h4>${escapeHtml(game.name || '')}</h4>
          <p>${escapeHtml(game.description || '')}</p>
          ${active
            ? `<div class="gs-item-foot"><span class="gs-active-label">চলছে — ${fmtDate(access.expiresAt)} পর্যন্ত</span></div>`
            : `<div class="gs-item-foot"><span class="gs-from-price">From ৳${fromPrice.toLocaleString('en-US')}</span><span class="gs-subscribe-link">Subscribe →</span></div>`
          }
        </div>
      </a>
    `;
  }).join('');
}

boot();
