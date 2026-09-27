import {
  db, collection, getDocs,
  onUserReady, getGamePurchaseDates, loadGameTiers, gameFromPrice,
  itemBg, escapeHtml, renderSkeletonList, startCountdownTicker
} from '../common.js';

const list = document.getElementById('gamesList');
let games = [];
let tiers = []; // admin-configured plan list
let accessMap = new Map(); // gameId -> { purchasedAt, expiresAt }
let countdownTimer = null;

async function boot(){
  renderSkeletonList('gamesList', 4);
  try{
    const [snap, loadedTiers] = await Promise.all([
      getDocs(collection(db, 'games')),
      loadGameTiers()
    ]);
    tiers = loadedTiers;
    games = [];
    snap.forEach(d => games.push({ id: d.id, ...d.data() }));
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">Could not load. Check Firestore rules/connection.</p>';
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
    list.innerHTML = '<p style="color:var(--muted);">No live streams added yet.</p>';
    return;
  }
  list.innerHTML = games.map((game, i)=>{
    const access = accessMap.get(game.id);
    const active = access && access.expiresAt.getTime() > Date.now();
    const bg = itemBg(game, i);
    const fromPrice = gameFromPrice(game, tiers);
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
            ? `<div class="gs-item-foot"><span class="gs-active-label" data-countdown-until="${access.expiresAt.getTime()}" data-countdown-label="Active — ">Active — …</span></div>`
            : `<div class="gs-item-foot"><span class="gs-from-price">From Tk${fromPrice.toLocaleString('en-US')}</span><span class="gs-subscribe-link">Subscribe →</span></div>`
          }
        </div>
      </a>
    `;
  }).join('');

  if(countdownTimer) clearInterval(countdownTimer);
  countdownTimer = startCountdownTicker(list, render); // when an item's timer hits 0, flip that card to "Subscribe" by re-rendering
}

boot();
