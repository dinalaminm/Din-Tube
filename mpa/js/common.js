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
  EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUjV_tUlWb5S7A8HSoTcU3vjvbuPzjtvI",
  authDomain: "app-1-e0ede.firebaseapp.com",
  databaseURL: "https://app-1-e0ede-default-rtdb.firebaseio.com",
  projectId: "app-1-e0ede",
  storageBucket: "app-1-e0ede.firebasestorage.app",
  messagingSenderId: "679519684721",
  appId: "1:679519684721:web:3f7e84e8bc1deaa90c73d0",
  measurementId: "G-10D47MBM1B"
};
const fbApp = initializeApp(firebaseConfig);
export const db = getFirestore(fbApp);
export const auth = getAuth(fbApp);

export {
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, increment, runTransaction,
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail, deleteUser,
  EmailAuthProvider, reauthenticateWithCredential
};

/* ---------- Small shared helpers ---------- */
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

/* ---------- Auth state (every page waits on this once) ---------- */
/* callback(user, profileDoc|null) — profileDoc includes walletBalance, phone, etc. */
let cachedUser = null;
let cachedProfile = null;
const readyCallbacks = [];
let authResolved = false;

onAuthStateChanged(auth, async (user)=>{
  cachedUser = user;
  cachedProfile = null;
  if(user){
    try{
      const uSnap = await getDoc(doc(db, 'users', user.uid));
      cachedProfile = uSnap.exists() ? uSnap.data() : {};
      cachedProfile.walletBalance = Number(cachedProfile.walletBalance || 0);
    }catch(err){
      console.error('user profile fetch error:', err);
      cachedProfile = { walletBalance: 0 };
    }
  }
  authResolved = true;
  applyHeaderAuthState(user, cachedProfile);
  readyCallbacks.forEach(cb => cb(user, cachedProfile));
  readyCallbacks.length = 0;
});

export function onUserReady(cb){
  if(authResolved) cb(cachedUser, cachedProfile);
  else readyCallbacks.push(cb);
}
export function getCurrentUser(){ return cachedUser; }
export function getCurrentProfile(){ return cachedProfile; }

/* Pages that require login redirect here if the visitor isn't signed in
   once the auth check has actually resolved (avoids a flash-redirect on
   a slow connection before Firebase has answered). */
export function requireAuth(){
  onUserReady((user)=>{
    if(!user) window.location.href = 'login.html';
  });
}

function applyHeaderAuthState(user, profile){
  const loginBtn = document.getElementById('loginBtn');
  if(loginBtn){
    if(user){
      const displayName = user.displayName || user.email;
      loginBtn.textContent = displayName.length > 10 ? displayName.slice(0,10)+'…' : displayName;
      loginBtn.href = 'profile.html';
    } else {
      loginBtn.textContent = 'লগ ইন';
      loginBtn.href = 'login.html';
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
export function renderCard(type, item, i){
  const bg = itemBg(item, i);
  const badge = (type === 'courses' || type === 'videos') ? (item.discount || '') : (item.oldPrice ? 'সেল' : '');
  const el = document.createElement('a');
  el.className = 'product-card';
  el.href = `detail.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`;
  el.style.textDecoration = 'none';
  el.style.color = 'inherit';
  el.innerHTML = `
    <div class="product-img" style="background:${bg}">
      ${badge ? `<div class="badge-sale">${escapeHtml(badge)}</div>` : ''}
      ${type === 'videos' && Number(item.price||0) <= 0 ? `<div class="badge-sale" style="background:#16A34A;">ফ্রি</div>` : ''}
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
  return el;
}

/* ---------- Generic collection loader (courses/products/software/videos) ---------- */
export async function loadCollectionGrid(collectionName, gridId, opts){
  const grid = document.getElementById(gridId);
  if(!grid) return [];
  grid.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
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

/* ---------- Shared page chrome: mobile menu + burger + active tab + cart badge ---------- */
function initChrome(){
  const burgerBtn = document.getElementById('burgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if(burgerBtn && mobileMenu){
    burgerBtn.addEventListener('click', ()=>{
      const isOpen = mobileMenu.classList.toggle('open');
      burgerBtn.textContent = isOpen ? '✕' : '☰';
      burgerBtn.setAttribute('aria-expanded', isOpen);
    });
    mobileMenu.querySelectorAll('a').forEach(a=>{
      a.addEventListener('click', ()=>{
        mobileMenu.classList.remove('open');
        burgerBtn.textContent = '☰';
        burgerBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }
  updateCartBadge();
  loadAnnouncement();
}
initChrome();
