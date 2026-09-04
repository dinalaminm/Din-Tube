/* ==========================================================================
   common.js — shared across every real page of the multi-page site.
   Each page's own script (js/pages/*.js) imports what it needs from here.
   No client-side "router": all navigation is plain <a href="..."> links,
   so every browser back/forward/refresh/bookmark/share works normally.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail, deleteUser,
  EmailAuthProvider, reauthenticateWithCredential,
  GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxFnJP3DwWC31P0jP3E_30r38qtUol0iQ",
  authDomain: "creatorrivo.firebaseapp.com",
  projectId: "creatorrivo",
  storageBucket: "creatorrivo.firebasestorage.app",
  messagingSenderId: "862514355485",
  appId: "1:862514355485:web:d984df8a56e1fb1d51d5f4"
};
const fbApp = initializeApp(firebaseConfig);
export const db = getFirestore(fbApp);
export const auth = getAuth(fbApp);
export const googleProvider = new GoogleAuthProvider();

export {
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, increment, runTransaction,
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail, deleteUser,
  EmailAuthProvider, reauthenticateWithCredential,
  signInWithPopup
};

/* ---------- Google sign-in (used on login.html) ----------
   Creates the users/{uid} profile doc the first time someone signs in
   with Google, same shape as the email/password register flow. If the
   doc already exists this only touches name/email so nothing else
   (walletBalance, phone, etc.) gets overwritten. */
export async function signInWithGoogle(){
  const cred = await signInWithPopup(auth, googleProvider);
  const userRef = doc(db, 'users', cred.user.uid);
  const existing = await getDoc(userRef);
  if(!existing.exists()){
    await setDoc(userRef, {
      name: cred.user.displayName || '',
      email: cred.user.email || '',
      phone: '',
      role: 'user',
      createdAt: serverTimestamp()
    });
  } else {
    await setDoc(userRef, {
      name: cred.user.displayName || existing.data().name || '',
      email: cred.user.email || existing.data().email || ''
    }, { merge: true });
  }
  return cred.user;
}


export function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function extractYouTubeId(raw){
  if(!raw) return '';
  const s = String(raw).trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/
  ];
  for(const re of patterns){
    const m = s.match(re);
    if(m && m[1]) return m[1];
  }
  try{
    const u = new URL(s);
    const v = u.searchParams.get('v');
    if(v) return v;
  }catch(e){ /* not a URL, fall through */ }
  return s;
}

export const gradients = [
  "linear-gradient(160deg,#3a2440,#1f1420)",
  "linear-gradient(160deg,#402a24,#20140f)",
  "linear-gradient(160deg,#243a2e,#131f19)",
  "linear-gradient(160deg,#3a3324,#1a170f)",
  "linear-gradient(160deg,#242f3a,#10161f)",
];
export function itemLabel(type, item){ return (type === 'courses' || type === 'videos') ? (item.title || '') : (item.name || ''); }
export function itemBg(item, i){
  const grad = gradients[i % gradients.length];
  return item.imageUrl ? `url('${item.imageUrl}') center/cover` : grad;
}

let toastTimer;
export function showToast(text){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toast.classList.remove('show'), 2000);
}

/* ---------- Cart (persisted in localStorage so it survives real page loads) ---------- */
const CART_KEY = 'cr_cart';
export function getCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }catch(e){ return []; }
}
export function saveCart(cart){
  try{ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }catch(e){ /* ignore */ }
  updateCartBadge();
}
export function addToCart(item){
  const cart = getCart();
  const existing = cart.find(c => (item.id && c.id) ? (c.id === item.id && c.type === item.type) : c.name === item.name);
  if(existing) existing.qty += 1;
  else cart.push({...item, qty:1});
  saveCart(cart);
  return cart;
}
export function updateCartBadge(){
  const cart = getCart();
  const count = cart.reduce((s,c)=>s+c.qty, 0);
  const badge = document.getElementById('cartBadge');
  if(!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

/* ---------- Favorites / wishlist (persisted in localStorage, same pattern as cart) ---------- */
const FAV_KEY = 'cr_favorites';
export function getFavorites(){
  try{ return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }catch(e){ return []; }
}
export function saveFavorites(list){
  try{ localStorage.setItem(FAV_KEY, JSON.stringify(list)); }catch(e){ /* ignore */ }
}
export function isFavorite(type, id){
  return getFavorites().some(f => f.type === type && f.id === id);
}
/* Adds/removes {..item, type} from the favorites list. Returns the new state (true = now favorited). */
export function toggleFavorite(type, item){
  const list = getFavorites();
  const idx = list.findIndex(f => f.type === type && f.id === item.id);
  if(idx > -1){
    list.splice(idx, 1);
    saveFavorites(list);
    return false;
  }
  list.push({ ...item, type });
  saveFavorites(list);
  return true;
}

/* ---------- Auth state (every page waits on this once) ---------- */
/* callback(user, profileDoc|null) — profileDoc includes walletBalance, phone, etc.
   Since this is a plain multi-page site, every navigation re-runs this whole
   module, which used to mean a fresh Firestore read of users/{uid} on every
   single page view. The profile doc is now cached in localStorage per uid for
   a short window (PROFILE_CACHE_TTL) so back-to-back page loads reuse it
   instead of re-fetching. Any code that mutates the live profile object
   in-place (wallet deduction on checkout, etc.) should call
   syncProfileCache() right after so the cached copy doesn't go stale. */
const PROFILE_CACHE_TTL = 2 * 60 * 1000;
function profileCacheKey(uid){ return 'crv_profile_cache_' + uid; }
function readProfileCache(uid){
  try{
    const raw = localStorage.getItem(profileCacheKey(uid));
    if(!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if(!data || (Date.now() - ts) > PROFILE_CACHE_TTL) return null;
    return data;
  }catch(e){ return null; }
}
function writeProfileCache(uid, data){
  try{ localStorage.setItem(profileCacheKey(uid), JSON.stringify({ ts: Date.now(), data })); }catch(e){ /* ignore */ }
}
function clearProfileCache(uid){
  try{ localStorage.removeItem(profileCacheKey(uid)); }catch(e){ /* ignore */ }
}

let cachedUser = null;
let cachedProfile = null;
const readyCallbacks = [];
let authResolved = false;

onAuthStateChanged(auth, async (user)=>{
  const prevUid = cachedUser && cachedUser.uid;
  cachedUser = user;
  cachedProfile = null;

  if(user){
    const cached = readProfileCache(user.uid);
    if(cached){
      cachedProfile = cached; // fresh enough — skip the Firestore read entirely
    } else {
      try{
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        cachedProfile = uSnap.exists() ? uSnap.data() : {};
        cachedProfile.walletBalance = Number(cachedProfile.walletBalance || 0);
        writeProfileCache(user.uid, cachedProfile);
      }catch(err){
        console.error('user profile fetch error:', err);
        cachedProfile = { walletBalance: 0 };
      }
    }
  } else if(prevUid){
    clearProfileCache(prevUid);
  }

  authResolved = true;
  applyHeaderAuthState(user, cachedProfile);
  loadPendingOrderBadge(user);
  readyCallbacks.forEach(cb => cb(user, cachedProfile));
  readyCallbacks.length = 0;
});

/* ---------- Header bag icon badge: count of this user's pending orders
   (the bag icon links to orders.html, not a shopping cart — see updateCartBadge
   below, which is legacy/unused now that nothing calls addToCart). ---------- */
async function loadPendingOrderBadge(user){
  const badge = document.getElementById('cartBadge');
  if(!badge) return;
  if(!user){ badge.style.display = 'none'; return; }
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    const count = snap.size;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }catch(err){
    console.error('loadPendingOrderBadge error:', err);
    badge.style.display = 'none';
  }
}

export function onUserReady(cb){
  if(authResolved) cb(cachedUser, cachedProfile);
  else readyCallbacks.push(cb);
}
export function getCurrentUser(){ return cachedUser; }
export function getCurrentProfile(){ return cachedProfile; }
/* Call after mutating the object returned by getCurrentProfile() in place
   (e.g. deducting walletBalance on checkout) so the localStorage cache
   reflects it immediately instead of serving a stale value on the next
   page load within the cache window. */
export function syncProfileCache(){
  if(cachedUser && cachedProfile) writeProfileCache(cachedUser.uid, cachedProfile);
}

/* Pages that require login redirect here if the visitor isn't signed in
   once the auth check has actually resolved (avoids a flash-redirect on
   a slow connection before Firebase has answered). */
export function requireAuth(){
  onUserReady((user)=>{
    if(!user) window.location.href = 'login.html';
  });
}

/* Builds a self-contained cartoon face avatar as inline SVG — no external
   network request, so it always renders even on slow/blocked connections.
   The look (male/female-styled hair, skin tone, hair color, background)
   is derived deterministically from the name's hash, so the same name
   always gets the same face. */
function nameHash(name){
  let hash = 0;
  const str = name || 'user';
  for(let i=0;i<str.length;i++){ hash = (hash*31 + str.charCodeAt(i)) >>> 0; }
  return hash;
}

export function cartoonAvatarSVG(name){
  const hash = nameHash(name);
  const isFemale = hash % 2 === 0;
  const bgColors = ['#FF7A59','#FFB020','#6C5CE7','#00B894','#0984E3','#E17055'];
  const skinTones = ['#FFDBAC','#F1C27D','#E0AC69','#C68642','#8D5524'];
  const hairColors = ['#2C2C2C','#4A2E1E','#6B4226','#1A1A1A','#3B2313'];
  const bg = bgColors[hash % bgColors.length];
  const skin = skinTones[(hash >> 3) % skinTones.length];
  const hairColor = hairColors[(hash >> 5) % hairColors.length];

  const hairShape = isFemale
    ? `<path d="M20 42c0-16 12-28 30-28s30 12 30 28v14c0 2-1 3-2 3-1-9-4-14-8-14 1 4 1 8 0 12-2-8-6-12-20-12s-18 4-20 12c-1-4-1-8 0-12-4 0-7 5-8 14-1 0-2-1-2-3V42Z" fill="${hairColor}"/>
       <path d="M18 40c-3 6-4 16-2 26 3 2 6-2 6-8-2-6-3-12-4-18Z" fill="${hairColor}"/>
       <path d="M82 40c3 6 4 16 2 26-3 2-6-2-6-8 2-6 3-12 4-18Z" fill="${hairColor}"/>`
    : `<path d="M22 40c0-17 13-29 28-29s28 12 28 29c0 3-1 6-2 8-2-10-6-16-26-16s-24 6-26 16c-1-2-2-5-2-8Z" fill="${hairColor}"/>`;

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="প্রোফাইল">
    <circle cx="50" cy="50" r="50" fill="${bg}"/>
    <circle cx="50" cy="56" r="26" fill="${skin}"/>
    <path d="M32 60c0 12 8 20 18 20s18-8 18-20" fill="none"/>
    <ellipse cx="41" cy="58" rx="3" ry="4" fill="#2C2C2C"/>
    <ellipse cx="59" cy="58" rx="3" ry="4" fill="#2C2C2C"/>
    <path d="M40 72c4 4 16 4 20 0" stroke="#8B4B3B" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    ${hairShape}
  </svg>`;
}

function applyHeaderAuthState(user, profile){
  const avatarBtn = document.getElementById('avatarBtn');
  if(avatarBtn){
    if(user){
      const displayName = (user.displayName || user.email || '').trim();
      avatarBtn.innerHTML = cartoonAvatarSVG(displayName);
      avatarBtn.href = 'profile.html';
      avatarBtn.classList.remove('guest');
      avatarBtn.setAttribute('aria-label', 'প্রোফাইল');
    } else {
      avatarBtn.innerHTML = '<svg class="guest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';
      avatarBtn.href = 'login.html';
      avatarBtn.classList.add('guest');
      avatarBtn.setAttribute('aria-label', 'লগ ইন');
    }
  }
  loadNoticeBadge();
}

/* ---------- Notice unread badge (shown on home page icon-grid + profile dash-grid) ---------- */
async function loadNoticeBadge(){
  const tileBadge = document.getElementById('noticeTileBadge');
  const dashBadge = document.getElementById('dashNoticeBadge');
  if(!tileBadge && !dashBadge) return;
  try{
    const snap = await getDocs(collection(db, 'notices'));
    let seenCount = 0;
    try{ seenCount = Number(localStorage.getItem('seenNoticeCount') || 0); }catch(e){}
    const diff = Math.max(0, snap.size - seenCount);
    [tileBadge, dashBadge].forEach(badge=>{
      if(!badge) return;
      if(diff > 0){ badge.textContent = diff; badge.style.display = 'flex'; }
      else badge.style.display = 'none';
    });
  }catch(err){ console.error('loadNoticeBadge error:', err); }
}

/* ---------- Announcement banner (Firestore: settings/announcement) ---------- */
async function loadAnnouncement(){
  try{
    const snap = await getDoc(doc(db, 'settings', 'announcement'));
    if(!snap.exists()) return;
    const a = snap.data();
    if(!a.active || !a.message) return;
    const annId = (a.title || '') + '|' + (a.message || '');
    let dismissed = '';
    try{ dismissed = localStorage.getItem('dismissedAnnouncement') || ''; }catch(e){}
    if(dismissed === annId) return;
    const banner = document.getElementById('announcementBanner');
    if(!banner) return;
    document.getElementById('annBannerTitle').textContent = a.title || '';
    document.getElementById('annBannerMessage').textContent = a.message || '';
    banner.style.display = 'flex';
    document.getElementById('announcementDismiss').onclick = ()=>{
      banner.style.display = 'none';
      try{ localStorage.setItem('dismissedAnnouncement', annId); }catch(e){}
    };
  }catch(err){
    console.error('loadAnnouncement error:', err);
  }
}

/* ---------- Shared card renderer — links to detail.html?type=..&id=.. (real URL) ---------- */
/* ---------- Skeleton loading placeholders ---------- */
export function renderSkeletonCards(gridId, count){
  const grid = document.getElementById(gridId);
  if(!grid) return;
  count = count || 6;
  grid.innerHTML = '';
  for(let i=0; i<count; i++){
    const el = document.createElement('div');
    el.className = 'product-card skel-card';
    el.innerHTML = `
      <div class="skeleton skel-img"></div>
      <div class="skeleton skel-line w-70"></div>
      <div class="skeleton skel-line w-40"></div>
    `;
    grid.appendChild(el);
  }
}
export function renderSkeletonList(containerId, count){
  const el = document.getElementById(containerId);
  if(!el) return;
  count = count || 3;
  el.innerHTML = '';
  for(let i=0; i<count; i++){
    const row = document.createElement('div');
    row.className = 'skel-list-row';
    row.innerHTML = `
      <div class="skeleton skel-line w-30"></div>
      <div class="skeleton skel-line w-90"></div>
      <div class="skeleton skel-line w-60"></div>
    `;
    el.appendChild(row);
  }
}

export function renderCard(type, item, i){
  const bg = itemBg(item, i);
  const badge = (type === 'courses' || type === 'videos') ? (item.discount || '') : (item.oldPrice ? 'সেল' : '');
  const el = document.createElement('a');
  el.className = 'product-card';
  el.href = `detail.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`;
  el.style.textDecoration = 'none';
  el.style.color = 'inherit';
  const favActive = isFavorite(type, item.id);
  el.innerHTML = `
    <div class="product-img" style="background:${bg}">
      ${badge ? `<div class="badge-sale">${escapeHtml(badge)}</div>` : ''}
      ${type === 'videos' && Number(item.price||0) <= 0 ? `<div class="badge-sale" style="background:#16A34A;">ফ্রি</div>` : ''}
      <button type="button" class="fav-btn${favActive ? ' active' : ''}" aria-label="ফেভারিটে যোগ করুন">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="${favActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6c0 4-6.4 8.8-8.8 10.6-2.4-1.8-8.8-6.6-8.8-10.6a5 5 0 0 1 9-3 5 5 0 0 1 8.6 3Z"/></svg>
      </button>
    </div>
    <div class="product-body">
      <h4>${escapeHtml(itemLabel(type, item))}</h4>
      ${(type === 'courses' || type === 'videos' || type === 'software') ? `<span style="color:var(--muted); font-size:0.75rem; font-weight:600;">${escapeHtml(item.category || '')}</span>` : ''}
      <div class="price-row">
        <span class="price-now">৳${Number(item.price || 0).toLocaleString('en-US')}</span>
        ${item.oldPrice ? `<span class="price-old">৳${Number(item.oldPrice).toLocaleString('en-US')}</span>` : ''}
      </div>
    </div>
  `;
  const favBtn = el.querySelector('.fav-btn');
  favBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    const nowFav = toggleFavorite(type, item);
    favBtn.classList.toggle('active', nowFav);
    favBtn.querySelector('svg').setAttribute('fill', nowFav ? 'currentColor' : 'none');
    showToast(nowFav ? 'ফেভারিটে যোগ করা হয়েছে' : 'ফেভারিট থেকে সরানো হয়েছে');
  });
  return el;
}

/* ---------- Generic collection loader (courses/products/software/videos) ---------- */
export async function loadCollectionGrid(collectionName, gridId, opts){
  const grid = document.getElementById(gridId);
  if(!grid) return [];
  renderSkeletonCards(gridId, (opts && opts.skeletonCount) || 6);
  try{
    const snap = await getDocs(collection(db, collectionName));
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    if(data.length === 0){
      grid.innerHTML = `<p style="color:var(--muted);">${(opts && opts.emptyText) || 'এখনো কিছু যোগ করা হয়নি।'}</p>`;
      return data;
    }
    grid.innerHTML = '';
    data.forEach((item, i)=> grid.appendChild(renderCard((opts && opts.type) || collectionName, item, i)));
    return data;
  }catch(err){
    grid.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error(`load ${collectionName} error:`, err);
    return [];
  }
}

/* ---------- Ownership helper (used on detail.html) ---------- */
export async function getOwnedItemIds(uid){
  const ids = new Set();
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', uid));
    const snap = await getDocs(q);
    snap.forEach(d=>{
      const o = d.data();
      if(o.status === 'completed'){
        (o.items || []).forEach(it => { if(it.id) ids.add(it.id); });
      }
    });
  }catch(err){ console.error('getOwnedItemIds error:', err); }
  return ids;
}

/* ---------- Shared page chrome: active tab + cart badge ---------- */
function initChrome(){
  updateCartBadge();
  loadAnnouncement();
  initFooterNewsletter();
}

/* ---------- Footer newsletter (client-side only, shown on every page) ---------- */
function initFooterNewsletter(){
  const form = document.getElementById('footerNewsletterForm');
  if(!form) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const emailInput = document.getElementById('footerNewsletterEmail');
    const msg = document.getElementById('footerNewsletterMsg');
    const email = emailInput.value.trim();
    if(!email){
      msg.textContent = 'ইমেইল দিন।';
      msg.className = 'foot-news-msg err';
      return;
    }
    msg.textContent = 'ধন্যবাদ! আপনি সাবস্ক্রাইব করেছেন।';
    msg.className = 'foot-news-msg';
    form.reset();
  });
}

initChrome();
