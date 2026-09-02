import {
  db, doc, getDoc, collection, getDocs,
  extractYouTubeId, loadCollectionGrid, renderCard
} from '../common.js';

/* ---------- Homepage promo video + ticker + about (Firestore: settings/homepage) ---------- */
function setupPromoVideo(rawVideoId){
  const videoId = extractYouTubeId(rawVideoId);
  if(!videoId) return;
  const card = document.getElementById('promoCard');
  if(!card || card.dataset.videoLoaded === videoId) return;
  card.dataset.videoLoaded = videoId;
  card.innerHTML = `
    <iframe id="promoIframe" src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1"
      style="position:absolute; inset:0; width:100%; height:100%; border:0;"
      allow="autoplay; encrypted-media" allowfullscreen></iframe>
    <div class="promo-unmute" id="promoUnmute" title="সাউন্ড অন করুন">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg>
    </div>
  `;
  let muted = true;
  document.getElementById('promoUnmute').addEventListener('click', ()=>{
    const iframe = document.getElementById('promoIframe');
    if(!iframe) return;
    const cmd = muted ? 'unMute' : 'mute';
    iframe.contentWindow.postMessage(JSON.stringify({event:'command', func:cmd, args:[]}), '*');
    muted = !muted;
  });
}
function setTickerText(text){
  if(!text) return;
  const el = document.getElementById('noticeTickerText');
  if(el) el.textContent = text;
}
async function loadHomepageSettings(){
  try{
    const cachedVideo = localStorage.getItem('promoVideoId');
    if(cachedVideo) setupPromoVideo(cachedVideo);
    const cachedTicker = localStorage.getItem('tickerText');
    if(cachedTicker) setTickerText(cachedTicker);
  }catch(e){ /* localStorage unavailable */ }
  try{
    const snap = await getDoc(doc(db, 'settings', 'homepage'));
    if(snap.exists()){
      const data = snap.data();
      if(data.promoVideoId){
        setupPromoVideo(data.promoVideoId);
        try{ localStorage.setItem('promoVideoId', data.promoVideoId); }catch(e){}
      }
      if(data.tickerText){
        setTickerText(data.tickerText);
        try{ localStorage.setItem('tickerText', data.tickerText); }catch(e){}
      }
    }
  }catch(err){ console.error('loadHomepageSettings error:', err); }
}
loadHomepageSettings();

/* ---------- Courses + products (home preview grids, 1 page's worth) ---------- */
let coursesData = [];
let productsData = [];
async function boot(){
  coursesData = await loadCollectionGrid('courses', 'courseGrid', { type:'courses', emptyText:'এখনো কোনো কোর্স যোগ করা হয়নি।' });
  productsData = await loadCollectionGrid('products', 'productGrid', { type:'products', emptyText:'এখনো কোনো প্রোডাক্ট যোগ করা হয়নি।' });
  renderCategoryChips();
}
boot();

/* ---------- Search + category filter ---------- */
let activeCategory = null;
function getCategories(){
  const set = new Set();
  coursesData.forEach(c => { if(c.category) set.add(c.category); });
  return Array.from(set);
}
function renderCategoryChips(){
  const wrap = document.getElementById('categoryChips');
  if(!wrap) return;
  const cats = getCategories();
  wrap.innerHTML = `<button type="button" class="chip ${!activeCategory ? 'active' : ''}" data-cat="">সব</button>` +
    cats.map(c => `<button type="button" class="chip ${activeCategory === c ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeCategory = btn.dataset.cat || null;
      renderCategoryChips();
      applyFilters();
    });
  });
}
function applyFilters(){
  const searchInput = document.getElementById('globalSearchInput');
  const courseGrid = document.getElementById('courseGrid');
  const productGrid = document.getElementById('productGrid');
  if(!searchInput || !courseGrid || !productGrid) return;
  const term = (searchInput.value || '').trim().toLowerCase();
  const filteredCourses = coursesData.filter(c=>{
    const matchesTerm = !term || (c.title || '').toLowerCase().includes(term) || (c.category || '').toLowerCase().includes(term);
    const matchesCat = !activeCategory || c.category === activeCategory;
    return matchesTerm && matchesCat;
  });
  const filteredProducts = productsData.filter(p=> !term || (p.name || '').toLowerCase().includes(term));
  courseGrid.innerHTML = '';
  if(filteredCourses.length === 0) courseGrid.innerHTML = '<p style="color:var(--muted);">কিছু পাওয়া যায়নি।</p>';
  filteredCourses.forEach((c, i)=> courseGrid.appendChild(renderCard('courses', c, i)));
  productGrid.innerHTML = '';
  if(filteredProducts.length === 0) productGrid.innerHTML = '<p style="color:var(--muted);">কিছু পাওয়া যায়নি।</p>';
  filteredProducts.forEach((p, i)=> productGrid.appendChild(renderCard('products', p, i)));
}
document.getElementById('globalSearchInput')?.addEventListener('input', applyFilters);

/* ---------- Testimonials (Firestore: collection "testimonials") ---------- */
async function loadTestimonials(){
  const marquee = document.getElementById('marquee');
  const reviewsSection = document.getElementById('reviews');
  if(!marquee) return;
  try{
    const snap = await getDocs(collection(db, 'testimonials'));
    if(snap.empty){
      if(reviewsSection) reviewsSection.style.display = 'none';
      return;
    }
    const items = [];
    snap.forEach(d=> items.push(d.data()));
    [...items, ...items].forEach(t=>{
      const q = document.createElement('div');
      q.className = 'quote';
      q.innerHTML = `
        <p>"${(t.text || '').replace(/</g,'&lt;')}"</p>
        <div class="who">
          <div class="avatar"></div>
          <div><b>${(t.name || '').replace(/</g,'&lt;')}</b><span>${(t.location || '').replace(/</g,'&lt;')}</span></div>
        </div>
      `;
      marquee.appendChild(q);
    });
  }catch(err){
    if(reviewsSection) reviewsSection.style.display = 'none';
    console.error('loadTestimonials error:', err);
  }
}
loadTestimonials();
