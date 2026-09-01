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
  const db = getFirestore(fbApp);
  const auth = getAuth(fbApp);
  let currentUser = null; // {uid, name, email, phone, createdAt}

  /* ---------- Load user-panel pages (login, cart, wallet, profile, etc.) ----------
     Each of these now lives in its own file under pages/ so the project stays
     easy to navigate on GitHub. They're fetched up front (in parallel) and
     injected into #pagesRoot before anything else in this script runs, so
     every getElementById/addEventListener call below finds its element in the
     DOM exactly like before — same SPA behavior, no page reloads, just the
     markup is now split across files instead of one giant index.html. */
  const PAGE_FRAGMENTS = [
    'login','settings','cart','download','all-courses','all-products','software',
    'videos','wallet','orders','mydownloads','profile','support','notice','live',
    'premium','about','detail','more'
  ];
  async function loadPageFragments(){
    const root = document.getElementById('pagesRoot');
    if(!root) return;
    const htmlParts = await Promise.all(PAGE_FRAGMENTS.map(async (id)=>{
      try{
        const res = await fetch(`pages/${id}.html`);
        if(!res.ok) throw new Error('HTTP '+res.status);
        return await res.text();
      }catch(err){
        console.error('page fragment load failed:', id, err);
        return '';
      }
    }));
    root.innerHTML = htmlParts.join('\n');
  }
  await loadPageFragments();

  /* Escapes text pulled from Firestore before inserting via innerHTML.
     Anything a user typed (ticket text, deposit notes, names) must go
     through this — otherwise a malicious user could inject a <script>
     or event-handler payload that runs in the admin's browser when
     they view it (stored XSS). */
  function escapeHtml(str){
    if(str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const gradients = [
    "linear-gradient(160deg,#3a2440,#1f1420)",
    "linear-gradient(160deg,#402a24,#20140f)",
    "linear-gradient(160deg,#243a2e,#131f19)",
    "linear-gradient(160deg,#3a3324,#1a170f)",
    "linear-gradient(160deg,#242f3a,#10161f)",
  ];

  /* Accepts a raw YouTube video ID or any common YouTube URL format
     (watch?v=, youtu.be/, embed/, shorts/) and returns just the ID.
     Defensive: normalizes data even if it was saved before the admin
     panel started cleaning it, or edited directly in Firestore. */
  function extractYouTubeId(raw){
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

  /* ---------- Homepage promo video (Firestore: settings/homepage) ---------- */
  /* Optional document at settings/homepage with fields:
     promoVideoId (YouTube video id), tickerText (scrolling notice-bar text), aboutText */
  let promoVideoId = null;
  function setTickerText(text){
    if(!text) return;
    document.getElementById('noticeTickerText').textContent = text;
  }
  function setAboutText(text){
    if(!text) return;
    const el = document.getElementById('aboutTextContent');
    if(el) el.textContent = text;
  }
  async function loadHomepageSettings(){
    // Paint instantly from the last known values (cached locally) while the
    // Firestore round-trip is still in flight, so slow connections don't
    // sit on stale/default content for several seconds.
    try{
      const cachedVideo = localStorage.getItem('promoVideoId');
      if(cachedVideo) setupPromoVideo(cachedVideo);
      const cachedTicker = localStorage.getItem('tickerText');
      if(cachedTicker) setTickerText(cachedTicker);
      const cachedAbout = localStorage.getItem('aboutText');
      if(cachedAbout) setAboutText(cachedAbout);
    }catch(e){ /* localStorage unavailable, ignore */ }

    try{
      const snap = await getDoc(doc(db, 'settings', 'homepage'));
      if(snap.exists()){
        const data = snap.data();
        if(data.promoVideoId){
          promoVideoId = data.promoVideoId;
          setupPromoVideo(promoVideoId);
          try{ localStorage.setItem('promoVideoId', promoVideoId); }catch(e){}
        }
        if(data.tickerText){
          setTickerText(data.tickerText);
          try{ localStorage.setItem('tickerText', data.tickerText); }catch(e){}
        }
        if(data.aboutText){
          setAboutText(data.aboutText);
          try{ localStorage.setItem('aboutText', data.aboutText); }catch(e){}
        }
      }
    }catch(err){
      console.error('loadHomepageSettings error:', err);
    }
  }

  /* ---------- Broadcast announcement (Firestore: settings/announcement) ---------- */
  /* Fields: title, message, active (boolean), updatedAt */
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
      document.getElementById('annBannerTitle').textContent = a.title || '';
      document.getElementById('annBannerMessage').textContent = a.message || '';
      document.getElementById('announcementBanner').style.display = 'flex';
      document.getElementById('announcementDismiss').onclick = ()=>{
        document.getElementById('announcementBanner').style.display = 'none';
        try{ localStorage.setItem('dismissedAnnouncement', annId); }catch(e){}
      };
    }catch(err){
      console.error('loadAnnouncement error:', err);
    }
  }
  function setupPromoVideo(rawVideoId){
    const videoId = extractYouTubeId(rawVideoId);
    if(!videoId) return;
    const card = document.getElementById('promoCard');
    if(card.dataset.videoLoaded === videoId) return; // avoid re-embedding on repeat calls (cache + Firestore)
    card.dataset.videoLoaded = videoId;

    // Embed the real player immediately — muted autoplay, since mobile
    // browsers/webviews block unmuted autoplay. Tapping the card unmutes.
    // No click-to-load thumbnail step.
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
  loadHomepageSettings();

  /* ---------- Router ---------- */
  const state = { isLoggedIn:false, userName:'', cart:[] };

  function setActiveTab(tabKey){
    document.querySelectorAll('.tabbar a').forEach(a=>{
      a.classList.toggle('active', a.dataset.tab === tabKey);
    });
  }

  function goTo(pageId, scrollId){
    if((pageId === 'settings' || pageId === 'orders' || pageId === 'mydownloads' || pageId === 'wallet') && !state.isLoggedIn){ pageId = 'login'; }
    const target = document.getElementById('page-'+pageId);
    if(!target) return;
    const wasDetail = document.querySelector('.page.active')?.id === 'page-detail';
    if(wasDetail && pageId !== 'detail'){
      const frame = document.getElementById('detailVideoFrame');
      if(frame) frame.src = '';
    }
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    target.classList.add('active');
    window.scrollTo({top:0, behavior:'auto'});
    if(scrollId){
      requestAnimationFrame(()=>{
        const el = document.getElementById(scrollId);
        if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
      });
    }
    const tabMap = {home:'content', download:'download', profile:'profile'};
    if(scrollId === 'courses') setActiveTab('course');
    else if(scrollId === 'shop') setActiveTab('product');
    else if(tabMap[pageId]) setActiveTab(tabMap[pageId]);
    else setActiveTab(null);
    history.replaceState(null, '', '#'+pageId);
  }

  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.preventDefault();
      const page = el.dataset.nav;
      if(page === 'profile'){
        goTo(state.isLoggedIn ? 'profile' : 'login');
      } else {
        goTo(page, el.dataset.scroll);
      }
      if(mobileMenu.classList.contains('open')) closeMobileMenu();
    });
  });

  window.addEventListener('load', ()=>{
    const hash = location.hash.replace('#','');
    if(hash && document.getElementById('page-'+hash)) goTo(hash);
  });

  /* ---------- Mobile menu ---------- */
  const burgerBtn = document.getElementById('burgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  function closeMobileMenu(){
    mobileMenu.classList.remove('open');
    burgerBtn.textContent = '☰';
    burgerBtn.setAttribute('aria-expanded','false');
  }
  burgerBtn.addEventListener('click', ()=>{
    const isOpen = mobileMenu.classList.toggle('open');
    burgerBtn.textContent = isOpen ? '✕' : '☰';
    burgerBtn.setAttribute('aria-expanded', isOpen);
  });

  /* ---------- Cart ---------- */
  function addToCart(item){
    const existing = state.cart.find(c => (item.id && c.id) ? (c.id === item.id && c.type === item.type) : c.name === item.name);
    if(existing) existing.qty += 1;
    else state.cart.push({...item, qty:1});
    renderCart();
    updateCartBadge();
  }
  function renderCart(){
    const wrap = document.getElementById('cartItemsWrap');
    const emptyMsg = document.getElementById('cartEmptyMsg');
    const totalRow = document.getElementById('cartTotalRow');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const walletPayBtn = document.getElementById('walletPayBtn');
    wrap.innerHTML = '';
    if(state.cart.length === 0){
      emptyMsg.style.display = 'block';
      totalRow.style.display = 'none';
      checkoutBtn.style.display = 'none';
      walletPayBtn.style.display = 'none';
      return;
    }
    emptyMsg.style.display = 'none';
    let total = 0;
    state.cart.forEach((item, idx)=>{
      total += item.price * item.qty;
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <div class="thumb" style="background:${item.grad}"></div>
        <div class="info">
          <h4>${item.name}</h4>
          <span style="color:var(--coral); font-weight:800;">৳${item.price.toLocaleString('en-US')}</span>
          <div class="qty">
            <button data-act="dec" data-idx="${idx}" type="button">−</button>
            <span>${item.qty}</span>
            <button data-act="inc" data-idx="${idx}" type="button">+</button>
          </div>
        </div>
        <button class="remove" data-act="remove" data-idx="${idx}" type="button">মুছুন</button>
      `;
      wrap.appendChild(row);
    });
    document.getElementById('cartTotal').textContent = '৳' + total.toLocaleString('en-US');
    totalRow.style.display = 'flex';
    checkoutBtn.style.display = 'block';
    walletPayBtn.style.display = 'block';
    walletPayBtn.textContent = '👛 ওয়ালেট দিয়ে পরিশোধ করুন (ব্যালেন্স: ৳' + Number(currentUser?.walletBalance || 0).toLocaleString('en-US') + ')';
    wrap.querySelectorAll('button[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = +btn.dataset.idx;
        const act = btn.dataset.act;
        if(act === 'inc') state.cart[idx].qty += 1;
        if(act === 'dec'){ state.cart[idx].qty -= 1; if(state.cart[idx].qty <= 0) state.cart.splice(idx,1); }
        if(act === 'remove') state.cart.splice(idx,1);
        renderCart();
        updateCartBadge();
      });
    });
  }
  function updateCartBadge(){
    const count = state.cart.reduce((s,c)=>s+c.qty, 0);
    const badge = document.getElementById('cartBadge');
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
  document.getElementById('checkoutBtn').addEventListener('click', async ()=>{
    if(state.cart.length === 0) return;
    const msg = document.getElementById('checkoutMsg');
    if(!currentUser){
      msg.className = 'form-msg err';
      msg.textContent = 'অর্ডার করতে আগে লগ ইন করুন।';
      setTimeout(()=> goTo('login'), 900);
      return;
    }
    const total = state.cart.reduce((s,c)=> s + c.price * c.qty, 0);
    msg.className = 'form-msg';
    msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
    try{
      await addDoc(collection(db, 'orders'), {
        uid: currentUser.uid,
        name: currentUser.name || '',
        email: currentUser.email || '',
        items: state.cart.map(c => ({ id: c.id || null, type: c.type || null, name: c.name, price: c.price, qty: c.qty })),
        total,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      state.cart = [];
      renderCart();
      updateCartBadge();
      msg.className = 'form-msg ok';
      msg.textContent = 'অর্ডার সফলভাবে সম্পন্ন হয়েছে, ধন্যবাদ! পেমেন্ট নিশ্চিত হলে অ্যাক্সেস আনলক হবে।';
      loadMyOrders();
      setTimeout(()=>{ msg.textContent=''; }, 5000);
    }catch(err){
      msg.className = 'form-msg err';
      msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
      console.error('order create error:', err);
    }
  });

  document.getElementById('walletPayBtn').addEventListener('click', async ()=>{
    if(state.cart.length === 0) return;
    const msg = document.getElementById('checkoutMsg');
    if(!currentUser){
      msg.className = 'form-msg err';
      msg.textContent = 'অর্ডার করতে আগে লগ ইন করুন।';
      setTimeout(()=> goTo('login'), 900);
      return;
    }
    const total = state.cart.reduce((s,c)=> s + c.price * c.qty, 0);
    if(total > Number(currentUser.walletBalance || 0)){
      msg.className = 'form-msg err';
      msg.textContent = 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। আগে ডিপোজিট করুন।';
      return;
    }
    msg.className = 'form-msg';
    msg.textContent = 'পেমেন্ট প্রসেস হচ্ছে...';
    const items = state.cart.map(c => ({ id: c.id || null, type: c.type || null, name: c.name, price: c.price, qty: c.qty }));
    const userRef = doc(db, 'users', currentUser.uid);
    const orderRef = doc(collection(db, 'orders'));
    const txnRef = doc(collection(db, 'walletTransactions'));
    try{
      await runTransaction(db, async (tx)=>{
        const uSnap = await tx.get(userRef);
        const bal = Number((uSnap.exists() ? uSnap.data().walletBalance : 0) || 0);
        if(bal < total) throw new Error('insufficient-balance');
        tx.update(userRef, { walletBalance: increment(-total) });
        tx.set(orderRef, {
          uid: currentUser.uid, name: currentUser.name || '', email: currentUser.email || '',
          items, total, status: 'completed', paymentMethod: 'wallet', createdAt: serverTimestamp()
        });
        tx.set(txnRef, {
          uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
          orderId: orderRef.id, note: 'ওয়ালেট দিয়ে অর্ডার পরিশোধ', createdAt: serverTimestamp()
        });
      });
      currentUser.walletBalance = Number(currentUser.walletBalance || 0) - total;
      renderWalletBalance();
      state.cart = [];
      renderCart();
      updateCartBadge();
      msg.className = 'form-msg ok';
      msg.textContent = 'পেমেন্ট সফল হয়েছে! অ্যাক্সেস এখনই আনলক হয়ে গেছে।';
      loadMyOrders();
      loadWalletTransactions();
      setTimeout(()=>{ msg.textContent=''; }, 5000);
    }catch(err){
      msg.className = 'form-msg err';
      msg.textContent = err.message === 'insufficient-balance' ? 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।' : 'পেমেন্ট ব্যর্থ হয়েছে, আবার চেষ্টা করুন।';
      console.error('wallet payment error:', err);
    }
  });

  /* ---------- Wallet (Firestore: users/{uid}.walletBalance + collection "walletTransactions") ---------- */
  /* Transaction fields: uid, type ('deposit'|'purchase'|'refund'), status ('pending'|'approved'|'rejected'|'completed'),
     amount, method, transactionId, note, orderId, createdAt */
  function renderWalletBalance(){
    const bal = Number(currentUser?.walletBalance || 0);
    const dashEl = document.getElementById('dashWalletBalance');
    const pageEl = document.getElementById('walletBalanceDisplay');
    if(dashEl) dashEl.textContent = '৳' + bal.toLocaleString('en-US');
    if(pageEl) pageEl.textContent = '৳' + bal.toLocaleString('en-US');
  }

  document.getElementById('depositForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const msg = document.getElementById('depositMsg');
    if(!currentUser){ msg.textContent = 'আগে লগ ইন করুন।'; msg.className = 'form-msg err'; return; }
    const amount = Number(document.getElementById('depAmount').value);
    const method = document.getElementById('depMethod').value;
    const txnId = document.getElementById('depTxnId').value.trim();
    const note = document.getElementById('depNote').value.trim();
    if(!amount || amount <= 0 || !txnId){
      msg.textContent = 'পরিমাণ ও ট্রানজেকশন আইডি সঠিকভাবে দিন।';
      msg.className = 'form-msg err';
      return;
    }
    msg.textContent = 'পাঠানো হচ্ছে...';
    msg.className = 'form-msg';
    try{
      await addDoc(collection(db, 'walletTransactions'), {
        uid: currentUser.uid, type: 'deposit', status: 'pending',
        amount, method, transactionId: txnId, note, createdAt: serverTimestamp()
      });
      msg.textContent = 'ডিপোজিট রিকোয়েস্ট পাঠানো হয়েছে। অ্যাডমিন যাচাই করার পর ব্যালেন্স যোগ হবে।';
      msg.className = 'form-msg ok';
      e.target.reset();
      loadWalletTransactions();
    }catch(err){
      msg.textContent = 'পাঠানো যায়নি, আবার চেষ্টা করুন।';
      msg.className = 'form-msg err';
      console.error('deposit request error:', err);
    }
  });

  let walletTxns = [];
  async function loadWalletTransactions(){
    if(!currentUser) return;
    const wrap = document.getElementById('walletTxnList');
    if(!wrap) return;
    wrap.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
    try{
      const q = query(collection(db, 'walletTransactions'), where('uid', '==', currentUser.uid));
      const snap = await getDocs(q);
      walletTxns = [];
      snap.forEach(d => walletTxns.push({ id: d.id, ...d.data() }));
      walletTxns.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderWalletTransactions();
    }catch(err){
      wrap.innerHTML = '<p style="color:var(--coral);">লেনদেন লোড করা যায়নি।</p>';
      console.error('loadWalletTransactions error:', err);
    }
  }
  const txnTypeLabel = { deposit:'ডিপোজিট', purchase:'কেনাকাটা', refund:'রিফান্ড' };
  const txnStatusLabel = { pending:'পেন্ডিং', approved:'অনুমোদিত', rejected:'বাতিল', completed:'সম্পন্ন' };
  function renderWalletTransactions(){
    const wrap = document.getElementById('walletTxnList');
    if(!wrap) return;
    if(walletTxns.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো লেনদেন নেই।</p>';
      return;
    }
    wrap.innerHTML = walletTxns.map(t=>{
      const isCredit = t.type === 'deposit' || t.type === 'refund';
      const sign = isCredit ? '+' : '−';
      const dateStr = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('bn-BD') : '';
      return `
        <div class="txn-row">
          <div>
            <strong>${txnTypeLabel[t.type] || t.type}</strong>
            <div style="color:var(--muted); font-size:0.78rem; margin-top:2px;">${dateStr} · ${txnStatusLabel[t.status] || t.status}${t.method ? ' · ' + escapeHtml(t.method) : ''}</div>
          </div>
          <span class="txn-amt ${isCredit ? 'credit' : 'debit'}">${sign}৳${Number(t.amount || 0).toLocaleString('en-US')}</span>
        </div>
      `;
    }).join('');
  }

  /* ---------- Orders & ownership (Firestore: collection "orders") ---------- */
  /* Fields: uid, name, email, items:[{id,type,name,price,qty}], total, status, createdAt */
  let myOrders = [];
  let ownedItemIds = new Set();
  function isOwned(item){
    return Number(item.price || 0) <= 0 || ownedItemIds.has(item.id);
  }
  async function loadMyOrders(){
    if(!currentUser) return;
    try{
      const q = query(collection(db, 'orders'), where('uid', '==', currentUser.uid));
      const snap = await getDocs(q);
      myOrders = [];
      snap.forEach(d => myOrders.push({ id: d.id, ...d.data() }));
      myOrders.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      ownedItemIds = new Set();
      myOrders.filter(o => o.status === 'completed').forEach(o=>{
        (o.items || []).forEach(it => { if(it.id) ownedItemIds.add(it.id); });
      });
      renderOrdersPage();
      renderMyDownloads();
    }catch(err){
      console.error('loadMyOrders error:', err);
    }
  }

  const orderStatusLabelUser = { pending:'পেন্ডিং', paid:'পেইড', completed:'সম্পন্ন', cancelled:'বাতিল', refunded:'রিফান্ড হয়েছে' };
  const orderStatusColorUser = { pending:'#F59E0B', paid:'#2563EB', completed:'#16A34A', cancelled:'#6B7280', refunded:'#7C3AED' };
  function renderOrdersPage(){
    const wrap = document.getElementById('myOrdersList');
    if(!wrap) return;
    if(myOrders.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো অর্ডার নেই।</p>';
      return;
    }
    wrap.innerHTML = myOrders.map(o => `
      <div class="ticket-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="font-size:0.95rem;">৳${Number(o.total || 0).toLocaleString('en-US')}</strong>
          <span class="ticket-status" style="background:${orderStatusColorUser[o.status] || '#999'};">${orderStatusLabelUser[o.status] || o.status}</span>
        </div>
        <ul style="margin-top:8px; padding-left:18px; font-size:0.85rem; color:var(--muted);">
          ${(o.items || []).map(it => `<li>${escapeHtml(it.name)} × ${Number(it.qty || 0)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  function renderMyDownloads(){
    const wrap = document.getElementById('myDownloadsList');
    if(!wrap) return;
    const downloadable = [];
    myOrders.filter(o => o.status === 'completed').forEach(o=>{
      (o.items || []).forEach(it=>{
        if(!it.id || !it.type) return;
        const pool = { products: productsData, software: softwareData }[it.type];
        if(!pool) return;
        const full = pool.find(x => x.id === it.id);
        if(full && full.downloadUrl) downloadable.push(full);
      });
    });
    if(downloadable.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো ডাউনলোডযোগ্য প্রোডাক্ট নেই — অর্ডার সম্পন্ন হলে এখানে দেখা যাবে।</p>';
      return;
    }
    wrap.innerHTML = downloadable.map(item => `
      <div class="ticket-card" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <span style="font-weight:700;">${item.name}</span>
        <a href="${item.downloadUrl}" target="_blank" class="btn-primary" style="padding:8px 16px; font-size:0.85rem; border-radius:8px; text-decoration:none; white-space:nowrap;">ডাউনলোড</a>
      </div>
    `).join('');
  }

  /* ---------- Course & product grids ---------- */
  /* ---------- Courses (Firestore: collection "courses") ---------- */
  /* Expected fields per document: title (string), category (string),
     price (number), oldPrice (number), discount (string, optional),
     imageUrl (string, optional), description (string, optional),
     features (array of strings, optional), videoId (YouTube video id, optional) */
  const courseGrid = document.getElementById('courseGrid');
  let coursesData = [];
  async function loadCourses(){
    courseGrid.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
    try{
      const snap = await getDocs(collection(db, 'courses'));
      if(snap.empty){
        courseGrid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো কোর্স যোগ করা হয়নি।</p>';
        coursesData = [];
        renderAllCoursesPage();
        return;
      }
      coursesData = [];
      snap.forEach(docSnap => coursesData.push({ id: docSnap.id, ...docSnap.data() }));
      courseGrid.innerHTML = '';
      coursesData.forEach((c, i)=>{
        courseGrid.appendChild(renderCard('courses', c, i));
      });
      renderCategoryChips();
      renderAllCoursesPage();
    }catch(err){
      courseGrid.innerHTML = '<p style="color:var(--coral);">কোর্স লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
      console.error('loadCourses error:', err);
    }
  }
  function renderAllCoursesPage(){
    const wrap = document.getElementById('allCoursesGrid');
    if(!wrap) return;
    if(coursesData.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো কোর্স যোগ করা হয়নি।</p>';
      return;
    }
    wrap.innerHTML = '';
    coursesData.forEach((c, i)=> wrap.appendChild(renderCard('courses', c, i)));
  }

  /* ---------- Products (Firestore: collection "products") ---------- */
  /* Expected fields per document: name (string), price (number),
     oldPrice (number, optional), imageUrl (string, optional),
     description (string, optional), features (array of strings, optional) */
  const productGrid = document.getElementById('productGrid');
  let productsData = [];
  async function loadProducts(){
    productGrid.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
    try{
      const snap = await getDocs(collection(db, 'products'));
      if(snap.empty){
        productGrid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো প্রোডাক্ট যোগ করা হয়নি।</p>';
        productsData = [];
        renderAllProductsPage();
        return;
      }
      productsData = [];
      snap.forEach(docSnap => productsData.push({ id: docSnap.id, ...docSnap.data() }));
      productGrid.innerHTML = '';
      productsData.forEach((p, i)=>{
        productGrid.appendChild(renderCard('products', p, i));
      });
      renderAllProductsPage();
    }catch(err){
      productGrid.innerHTML = '<p style="color:var(--coral);">প্রোডাক্ট লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
      console.error('loadProducts error:', err);
    }
  }
  function renderAllProductsPage(){
    const wrap = document.getElementById('allProductsGrid');
    if(!wrap) return;
    if(productsData.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো প্রোডাক্ট যোগ করা হয়নি।</p>';
      return;
    }
    wrap.innerHTML = '';
    productsData.forEach((p, i)=> wrap.appendChild(renderCard('products', p, i)));
  }

  /* ---------- Software (Firestore: collection "software") ---------- */
  /* Expected fields: name, category, price, oldPrice, version, platform,
     imageUrl, downloadUrl (required for digital delivery), description, features */
  const softwareGrid = document.getElementById('softwareGrid');
  let softwareData = [];
  async function loadSoftware(){
    if(!softwareGrid) return;
    softwareGrid.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
    try{
      const snap = await getDocs(collection(db, 'software'));
      softwareData = [];
      snap.forEach(docSnap => softwareData.push({ id: docSnap.id, ...docSnap.data() }));
      if(softwareData.length === 0){
        softwareGrid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো সফটওয়্যার যোগ করা হয়নি।</p>';
        return;
      }
      softwareGrid.innerHTML = '';
      softwareData.forEach((s, i)=> softwareGrid.appendChild(renderCard('software', s, i)));
    }catch(err){
      softwareGrid.innerHTML = '<p style="color:var(--coral);">সফটওয়্যার লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
      console.error('loadSoftware error:', err);
    }
  }

  /* ---------- Video content (Firestore: collection "videos") ---------- */
  /* Expected fields: title, category, price (0 = free), videoId, imageUrl, description */
  const videoGrid = document.getElementById('videoGrid');
  let videosData = [];
  async function loadVideos(){
    if(!videoGrid) return;
    videoGrid.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
    try{
      const snap = await getDocs(collection(db, 'videos'));
      videosData = [];
      snap.forEach(docSnap => videosData.push({ id: docSnap.id, ...docSnap.data() }));
      if(videosData.length === 0){
        videoGrid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো ভিডিও যোগ করা হয়নি।</p>';
        return;
      }
      videoGrid.innerHTML = '';
      videosData.forEach((v, i)=> videoGrid.appendChild(renderCard('videos', v, i)));
    }catch(err){
      videoGrid.innerHTML = '<p style="color:var(--coral);">ভিডিও লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
      console.error('loadVideos error:', err);
    }
  }

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
    const term = (document.getElementById('globalSearchInput').value || '').trim().toLowerCase();
    const filteredCourses = coursesData.filter(c=>{
      const matchesTerm = !term || (c.title || '').toLowerCase().includes(term) || (c.category || '').toLowerCase().includes(term);
      const matchesCat = !activeCategory || c.category === activeCategory;
      return matchesTerm && matchesCat;
    });
    const filteredProducts = productsData.filter(p=>{
      return !term || (p.name || '').toLowerCase().includes(term);
    });
    courseGrid.innerHTML = '';
    if(filteredCourses.length === 0) courseGrid.innerHTML = '<p style="color:var(--muted);">কিছু পাওয়া যায়নি।</p>';
    filteredCourses.forEach((c, i)=> courseGrid.appendChild(renderCard('courses', c, i)));
    productGrid.innerHTML = '';
    if(filteredProducts.length === 0) productGrid.innerHTML = '<p style="color:var(--muted);">কিছু পাওয়া যায়নি।</p>';
    filteredProducts.forEach((p, i)=> productGrid.appendChild(renderCard('products', p, i)));
  }
  document.getElementById('globalSearchInput').addEventListener('input', applyFilters);

  /* ---------- Shared card renderer (used in grids + related items) ---------- */
  function itemLabel(type, item){ return (type === 'courses' || type === 'videos') ? (item.title || '') : (item.name || ''); }
  function itemBg(item, i){
    const grad = gradients[i % gradients.length];
    return item.imageUrl ? `url('${item.imageUrl}') center/cover` : grad;
  }
  function renderCard(type, item, i){
    const bg = itemBg(item, i);
    const badge = (type === 'courses' || type === 'videos') ? (item.discount || '') : (item.oldPrice ? 'সেল' : '');
    const el = document.createElement('div');
    el.className = 'product-card';
    el.innerHTML = `
      <div class="product-img" style="background:${bg}">
        ${badge ? `<div class="badge-sale">${badge}</div>` : ''}
        ${type === 'videos' && Number(item.price||0) <= 0 ? `<div class="badge-sale" style="background:#16A34A;">ফ্রি</div>` : ''}
      </div>
      <div class="product-body">
        <h4>${itemLabel(type, item)}</h4>
        ${(type === 'courses' || type === 'videos' || type === 'software') ? `<span style="color:var(--muted); font-size:0.75rem; font-weight:600;">${item.category || ''}</span>` : ''}
        <div class="price-row">
          <span class="price-now">৳${Number(item.price || 0).toLocaleString('en-US')}</span>
          ${item.oldPrice ? `<span class="price-old">৳${Number(item.oldPrice).toLocaleString('en-US')}</span>` : ''}
        </div>
      </div>
    `;
    el.addEventListener('click', ()=> openDetail(type, item));
    return el;
  }

  /* ---------- Detail page ---------- */
  let detailReturnTo = 'home';
  function renderFeatures(list){
    const wrap = document.getElementById('detailFeatures');
    if(!Array.isArray(list) || list.length === 0){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = list.map(f => `
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#16A34A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto; margin-top:2px;"><path d="M20 6 9 17l-5-5"/></svg>
        <span>${f}</span>
      </div>
    `).join('');
  }

  function openDetail(type, item){
    const currentActive = document.querySelector('.page.active');
    if(currentActive && currentActive.id !== 'page-detail'){
      detailReturnTo = currentActive.id.replace('page-', '');
    }
    const videoWrap = document.getElementById('detailVideoWrap');
    const videoFrame = document.getElementById('detailVideoFrame');
    const imageWrap = document.getElementById('detailImageWrap');
    const imageEl = document.getElementById('detailImage');
    const lockedWrap = document.getElementById('detailLockedWrap');

    const owned = isOwned(item);
    const hasVideo = (type === 'courses' || type === 'videos') && item.videoId;

    if(hasVideo && (type === 'courses' || owned)){
      videoFrame.src = 'https://www.youtube.com/embed/' + extractYouTubeId(item.videoId);
      videoWrap.style.display = 'block';
      imageWrap.style.display = 'none';
      lockedWrap.style.display = 'none';
    } else if(hasVideo && type === 'videos' && !owned){
      videoFrame.src = '';
      videoWrap.style.display = 'none';
      imageWrap.style.display = 'none';
      lockedWrap.style.display = 'block';
    } else {
      videoFrame.src = '';
      videoWrap.style.display = 'none';
      lockedWrap.style.display = 'none';
      if(item.imageUrl){
        imageEl.style.background = `url('${item.imageUrl}') center/cover`;
        imageWrap.style.display = 'block';
      } else {
        imageWrap.style.display = 'none';
      }
    }

    document.getElementById('detailTitle').textContent = itemLabel(type, item);

    const tags = document.getElementById('detailTags');
    tags.innerHTML = '';
    if(item.category){
      tags.innerHTML += `<span style="background:#E6F9EE; color:#16A34A; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">${item.category}</span>`;
    }
    if(type === 'courses'){
      tags.innerHTML += `<span style="background:#FFF1EF; color:var(--coral); font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">Instant Access</span>`;
    }
    if(type === 'software' && item.version){
      tags.innerHTML += `<span style="background:#EFF6FF; color:#2563EB; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">v${item.version}</span>`;
    }
    if(type === 'software' && item.platform){
      tags.innerHTML += `<span style="background:#F5F3FF; color:#7C3AED; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">${item.platform}</span>`;
    }

    document.getElementById('detailDesc').textContent = item.description || '';

    renderFeatures(item.features);

    document.getElementById('detailPriceNow').textContent = '৳' + Number(item.price || 0).toLocaleString('en-US');
    const oldPriceEl = document.getElementById('detailPriceOld');
    oldPriceEl.textContent = item.oldPrice ? '৳' + Number(item.oldPrice).toLocaleString('en-US') : '';
    const badgeEl = document.getElementById('detailDiscountBadge');
    if((type === 'courses' || type === 'videos') && item.discount){
      badgeEl.textContent = item.discount;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }

    const buyBtn = document.getElementById('detailBuyBtn');
    buyBtn.disabled = false;
    buyBtn.style.opacity = '1';
    if((type === 'products' || type === 'software') && item.downloadUrl && owned){
      buyBtn.textContent = 'ডাউনলোড করুন';
      buyBtn.onclick = ()=> window.open(item.downloadUrl, '_blank');
    } else if(type === 'videos' && owned){
      buyBtn.textContent = 'কেনা হয়ে গেছে ✓';
      buyBtn.onclick = null;
      buyBtn.disabled = true;
      buyBtn.style.opacity = '0.6';
    } else {
      buyBtn.textContent = type === 'courses' ? 'কোর্সে ভর্তি হন' : (type === 'videos' ? 'কিনুন' : 'কার্টে যোগ করুন');
      buyBtn.onclick = ()=>{
        addToCart({ id: item.id, type, name: itemLabel(type, item), price: Number(item.price || 0), grad: itemBg(item, 0) });
        showToast(itemLabel(type, item) + ' কার্টে যোগ হয়েছে');
      };
    }

    const labelMap = { courses:'কোর্স', products:'প্রোডাক্ট', software:'সফটওয়্যার', videos:'ভিডিও' };
    document.getElementById('detailMoreLabel').textContent = labelMap[type] || '';
    const relatedWrap = document.getElementById('detailRelated');
    relatedWrap.innerHTML = '';
    const poolMap = { courses:coursesData, products:productsData, software:softwareData, videos:videosData };
    const pool = poolMap[type] || [];
    pool.filter(x => x.id !== item.id).slice(0, 4).forEach((relItem, i)=>{
      relatedWrap.appendChild(renderCard(type, relItem, i));
    });

    goTo('detail');
  }

  let toastTimer;
  function showToast(text){
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> toast.classList.remove('show'), 2000);
  }

  /* ---------- Testimonials (Firestore: collection "testimonials") ---------- */
  /* Expected fields per document: text (string), name (string), location (string) */
  const marquee = document.getElementById('marquee');
  async function loadTestimonials(){
    try{
      const snap = await getDocs(collection(db, 'testimonials'));
      if(snap.empty){
        document.getElementById('reviews').style.display = 'none';
        return;
      }
      const items = [];
      snap.forEach(docSnap=> items.push(docSnap.data()));
      [...items, ...items].forEach(t=>{
        const q = document.createElement('div');
        q.className = 'quote';
        q.innerHTML = `
          <p>"${t.text || ''}"</p>
          <div class="who">
            <div class="avatar"></div>
            <div><b>${t.name || ''}</b><span>${t.location || ''}</span></div>
          </div>
        `;
        marquee.appendChild(q);
      });
    }catch(err){
      document.getElementById('reviews').style.display = 'none';
      console.error('loadTestimonials error:', err);
    }
  }

  /* ---------- Auth ---------- */
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.addEventListener('click', ()=> goTo(state.isLoggedIn ? 'profile' : 'login'));

  function authErrorMessage(err){
    const map = {
      'auth/email-already-in-use': 'এই ইমেইল দিয়ে আগে থেকেই অ্যাকাউন্ট আছে।',
      'auth/invalid-email': 'সঠিক ইমেইল দিন।',
      'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে।',
      'auth/user-not-found': 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।',
      'auth/wrong-password': 'পাসওয়ার্ড ভুল হয়েছে।',
      'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল।',
      'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, একটু পরে আবার চেষ্টা করুন।',
    };
    return map[err.code] || 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।';
  }

  /* Login/Register tab toggle */
  document.querySelectorAll('.auth-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.auth-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.authtab;
      document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
      document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
      document.getElementById('authTitle').textContent = tab === 'login' ? 'লগ ইন করুন' : 'নতুন অ্যাকাউন্ট তৈরি করুন';
      document.getElementById('authSubtitle').textContent = tab === 'login'
        ? 'আপনার একাউন্টে প্রবেশ করে অর্ডার ট্র্যাক করুন ও এক্সক্লুসিভ অফার পান।'
        : 'একটা ফ্রি অ্যাকাউন্ট তৈরি করুন কোর্স-প্রোডাক্ট কিনতে ও সাপোর্ট টিকিট পাঠাতে।';
    });
  });

  document.getElementById('registerForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const msg = document.getElementById('registerMsg');
    if(!name || !phone || !email || pass.length < 6){
      msg.textContent = 'সব ফিল্ড সঠিকভাবে পূরণ করুন (পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার)।';
      msg.className = 'form-msg err';
      return;
    }
    msg.textContent = 'অ্যাকাউন্ট তৈরি হচ্ছে...';
    msg.className = 'form-msg';
    try{
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, phone, email, role: 'user', createdAt: serverTimestamp()
      });
      msg.textContent = 'অ্যাকাউন্ট তৈরি হয়েছে! স্বাগতম।';
      msg.className = 'form-msg ok';
      e.target.reset();
    }catch(err){
      msg.textContent = authErrorMessage(err);
      msg.className = 'form-msg err';
      console.error(err);
    }
  });

  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('loginId').value.trim();
    const pass = document.getElementById('loginPass').value;
    const msg = document.getElementById('loginMsg');
    if(!email || !pass){
      msg.textContent = 'সব ফিল্ড পূরণ করুন।';
      msg.className = 'form-msg err';
      return;
    }
    msg.textContent = 'লগ ইন হচ্ছে...';
    msg.className = 'form-msg';
    try{
      await signInWithEmailAndPassword(auth, email, pass);
      msg.textContent = 'সফলভাবে লগ ইন হয়েছে!';
      msg.className = 'form-msg ok';
      setTimeout(()=> goTo('profile'), 500);
    }catch(err){
      msg.textContent = authErrorMessage(err);
      msg.className = 'form-msg err';
      console.error(err);
    }
  });

  document.getElementById('forgotPassLink').addEventListener('click', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('loginId').value.trim();
    const msg = document.getElementById('loginMsg');
    if(!email){
      msg.textContent = 'পাসওয়ার্ড রিসেট করতে আগে ইমেইল লিখুন।';
      msg.className = 'form-msg err';
      return;
    }
    try{
      await sendPasswordResetEmail(auth, email);
      msg.textContent = 'পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে।';
      msg.className = 'form-msg ok';
    }catch(err){
      msg.textContent = authErrorMessage(err);
      msg.className = 'form-msg err';
    }
  });

  document.getElementById('goLoginBtn').addEventListener('click', ()=> goTo('login'));
  document.getElementById('supportLoginBtn').addEventListener('click', ()=> goTo('login'));
  document.getElementById('logoutBtn').addEventListener('click', ()=> signOut(auth));

  document.querySelectorAll('[data-nav="notice"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      try{ localStorage.setItem('seenNoticeCount', String(noticesData.length)); }catch(e){}
      checkUnreadNotices();
    });
  });

  onAuthStateChanged(auth, async (user)=>{
    if(user){
      state.isLoggedIn = true;
      const displayName = user.displayName || user.email;
      currentUser = { uid: user.uid, email: user.email, name: displayName, phone:'' };
      loginBtn.textContent = displayName.length > 10 ? displayName.slice(0,10)+'…' : displayName;
      document.getElementById('profileName').textContent = displayName;
      document.getElementById('profileHandle').textContent = user.email;
      document.getElementById('profileAvatar').textContent = displayName.charAt(0).toUpperCase();
      document.getElementById('profileLoggedOut').style.display = 'none';
      document.getElementById('profileLoggedIn').style.display = 'block';
      document.getElementById('supportLoggedOut').style.display = 'none';
      document.getElementById('supportLoggedIn').style.display = 'block';

      try{
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        if(uSnap.exists()){
          const d = uSnap.data();
          currentUser.phone = d.phone || '';
          currentUser.walletBalance = Number(d.walletBalance || 0);
          if(d.createdAt && d.createdAt.toDate){
            document.getElementById('profileJoined').textContent = d.createdAt.toDate().toLocaleDateString('bn-BD');
          }
        } else {
          currentUser.walletBalance = 0;
        }
        renderWalletBalance();
      }catch(err){ console.error('user profile fetch error:', err); }

      const setName = document.getElementById('setName');
      if(setName){
        setName.value = currentUser.name || '';
        document.getElementById('setPhone').value = currentUser.phone || '';
        document.getElementById('setEmail').value = currentUser.email || '';
      }

      loadMyTickets();
      checkUnreadNotices();
      loadMyOrders();
      loadWalletTransactions();
    } else {
      state.isLoggedIn = false;
      currentUser = null;
      myOrders = [];
      ownedItemIds = new Set();
      walletTxns = [];
      renderWalletBalance();
      loginBtn.textContent = 'লগ ইন';
      document.getElementById('profileLoggedOut').style.display = 'block';
      document.getElementById('profileLoggedIn').style.display = 'none';
      document.getElementById('supportLoggedOut').style.display = 'block';
      document.getElementById('supportLoggedIn').style.display = 'none';
    }
  });

  /* ---------- Profile settings ---------- */
  document.getElementById('settingsProfileForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const msg = document.getElementById('settingsProfileMsg');
    if(!currentUser){ msg.textContent = 'আগে লগ ইন করুন।'; msg.className = 'form-msg err'; return; }
    const name = document.getElementById('setName').value.trim();
    const phone = document.getElementById('setPhone').value.trim();
    if(!name){ msg.textContent = 'নাম লিখুন।'; msg.className = 'form-msg err'; return; }
    msg.textContent = 'সংরক্ষণ হচ্ছে...';
    msg.className = 'form-msg';
    try{
      await updateProfile(auth.currentUser, { displayName: name });
      await setDoc(doc(db, 'users', currentUser.uid), { name, phone }, { merge: true });
      currentUser.name = name;
      currentUser.phone = phone;
      document.getElementById('profileName').textContent = name;
      document.getElementById('profileAvatar').textContent = name.charAt(0).toUpperCase();
      loginBtn.textContent = name.length > 10 ? name.slice(0,10)+'…' : name;
      msg.textContent = 'সংরক্ষণ করা হয়েছে!';
      msg.className = 'form-msg ok';
    }catch(err){
      msg.textContent = 'সংরক্ষণ ব্যর্থ হয়েছে, আবার চেষ্টা করুন।';
      msg.className = 'form-msg err';
      console.error(err);
    }
  });

  document.getElementById('resetPassBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('settingsPassMsg');
    if(!currentUser) return;
    try{
      await sendPasswordResetEmail(auth, currentUser.email);
      msg.textContent = 'পাসওয়ার্ড রিসেট লিংক ' + currentUser.email + '-এ পাঠানো হয়েছে।';
      msg.className = 'form-msg ok';
    }catch(err){
      msg.textContent = 'পাঠানো যায়নি, আবার চেষ্টা করুন।';
      msg.className = 'form-msg err';
      console.error(err);
    }
  });

  /* ---------- Account & Data Management ---------- */
  document.getElementById('exportDataBtn').addEventListener('click', async ()=>{
    const btn = document.getElementById('exportDataBtn');
    if(!currentUser) return;
    btn.disabled = true;
    btn.textContent = 'তৈরি হচ্ছে...';
    try{
      const [ticketsSnap, ordersSnap, walletSnap] = await Promise.all([
        getDocs(query(collection(db, 'supportTickets'), where('uid', '==', currentUser.uid))),
        getDocs(query(collection(db, 'orders'), where('uid', '==', currentUser.uid))),
        getDocs(query(collection(db, 'walletTransactions'), where('uid', '==', currentUser.uid))),
      ]);
      const toPlain = (snap)=> { const arr = []; snap.forEach(d=>{
        const data = d.data();
        if(data.createdAt && data.createdAt.toDate) data.createdAt = data.createdAt.toDate().toISOString();
        arr.push({ id: d.id, ...data });
      }); return arr; };
      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: { uid: currentUser.uid, name: currentUser.name, email: currentUser.email, phone: currentUser.phone, walletBalance: currentUser.walletBalance || 0 },
        supportTickets: toPlain(ticketsSnap),
        orders: toPlain(ordersSnap),
        walletTransactions: toPlain(walletSnap),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'creator-rivo-data-' + currentUser.uid.slice(0,8) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(err){
      console.error('data export error:', err);
      showToast('ডেটা এক্সপোর্ট করা যায়নি');
    }finally{
      btn.disabled = false;
      btn.textContent = '📥 আমার ডেটা এক্সপোর্ট করুন (JSON)';
    }
  });

  document.getElementById('showDeleteAccountBtn').addEventListener('click', ()=>{
    const form = document.getElementById('deleteAccountForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('deleteAccountForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const msg = document.getElementById('deleteAccountMsg');
    if(!currentUser){ return; }
    const pass = document.getElementById('deleteConfirmPass').value;
    if(!pass){
      msg.textContent = 'পাসওয়ার্ড দিন।';
      msg.className = 'form-msg err';
      return;
    }
    if(!confirm('আপনি কি নিশ্চিত? এই কাজটি ফেরানো যাবে না।')) return;
    msg.textContent = 'ডিলিট হচ্ছে...';
    msg.className = 'form-msg';
    try{
      const cred = EmailAuthProvider.credential(currentUser.email, pass);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await deleteDoc(doc(db, 'users', currentUser.uid));
      await deleteUser(auth.currentUser);
      showToast('অ্যাকাউন্ট ডিলিট করা হয়েছে');
      goTo('home');
    }catch(err){
      console.error('account delete error:', err);
      if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'){
        msg.textContent = 'পাসওয়ার্ড ভুল হয়েছে।';
      } else {
        msg.textContent = 'ডিলিট করা যায়নি, আবার চেষ্টা করুন।';
      }
      msg.className = 'form-msg err';
    }
  });

  /* ---------- Support tickets (Firestore: collection "supportTickets") ---------- */
  /* Fields: uid, name, email, subject, message, status ('open'|'replied'|'closed'), adminReply, createdAt */
  document.getElementById('supportForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const subject = document.getElementById('supSubject').value.trim();
    const text = document.getElementById('supMsg').value.trim();
    const msg = document.getElementById('supportMsg');
    if(!subject || !text){
      msg.textContent = 'বিষয় ও বার্তা দুটোই লিখুন।';
      msg.className = 'form-msg err';
      return;
    }
    if(!currentUser){
      msg.textContent = 'আগে লগ ইন করুন।';
      msg.className = 'form-msg err';
      return;
    }
    msg.textContent = 'পাঠানো হচ্ছে...';
    msg.className = 'form-msg';
    try{
      await addDoc(collection(db, 'supportTickets'), {
        uid: currentUser.uid,
        name: currentUser.name || '',
        email: currentUser.email || '',
        subject, message: text,
        status: 'open',
        adminReply: '',
        createdAt: serverTimestamp()
      });
      msg.textContent = 'টিকিট পাঠানো হয়েছে! আমরা দ্রুত যোগাযোগ করব।';
      msg.className = 'form-msg ok';
      e.target.reset();
      loadMyTickets();
    }catch(err){
      msg.textContent = 'পাঠানো যায়নি, আবার চেষ্টা করুন।';
      msg.className = 'form-msg err';
      console.error('ticket submit error:', err);
    }
  });

  async function loadMyTickets(){
    const list = document.getElementById('ticketList');
    if(!currentUser || !list) return;
    list.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
    try{
      const q = query(collection(db, 'supportTickets'), where('uid', '==', currentUser.uid));
      const snap = await getDocs(q);
      if(snap.empty){
        list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো টিকিট নেই।</p>';
        return;
      }
      const tickets = [];
      snap.forEach(d => tickets.push({ id: d.id, ...d.data() }));
      tickets.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const statusLabel = { open:'ওপেন', replied:'রিপ্লাই দেওয়া হয়েছে', closed:'বন্ধ' };
      const statusColor = { open:'#F59E0B', replied:'#16A34A', closed:'#6B7280' };
      list.innerHTML = tickets.map(t => `
        <div class="ticket-card">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <strong style="font-size:0.95rem;">${escapeHtml(t.subject)}</strong>
            <span class="ticket-status" style="background:${statusColor[t.status] || '#999'};">${statusLabel[t.status] || t.status}</span>
          </div>
          <p style="color:var(--muted); font-size:0.85rem; margin-top:6px;">${escapeHtml(t.message)}</p>
          ${t.adminReply ? `<div style="margin-top:8px; padding:10px; background:#F6F6F8; border-radius:8px; font-size:0.85rem;"><strong>রিপ্লাই:</strong> ${escapeHtml(t.adminReply)}</div>` : ''}
        </div>
      `).join('');
    }catch(err){
      list.innerHTML = '<p style="color:var(--coral);">টিকিট লোড করা যায়নি।</p>';
      console.error('loadMyTickets error:', err);
    }
  }
  document.getElementById('notifyLiveForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const email = document.getElementById('notifyLiveEmail').value.trim();
    const msg = document.getElementById('notifyLiveMsg');
    if(!email){
      msg.textContent = 'ইমেইল দিন।';
      msg.className = 'form-msg err';
      return;
    }
    msg.textContent = 'ধন্যবাদ! লাইভ স্ট্রিম চালু হলে জানিয়ে দেওয়া হবে।';
    msg.className = 'form-msg ok';
    e.target.reset();
  });

  /* ---------- Premium subscribe ---------- */
  document.getElementById('subscribeBtn').addEventListener('click', ()=>{
    const msg = document.getElementById('subscribeMsg');
    msg.textContent = 'স্বাগতম! প্রিমিয়াম মেম্বারশিপ একটিভ হয়েছে।';
  });

  /* ---------- Download buttons ---------- */
  document.getElementById('playStoreBtn').addEventListener('click', ()=>{
    document.getElementById('downloadMsg').textContent = 'অ্যাপ শীঘ্রই Google Play-তে লঞ্চ হচ্ছে।';
  });
  document.getElementById('appStoreBtn').addEventListener('click', ()=>{
    document.getElementById('downloadMsg').textContent = 'অ্যাপ শীঘ্রই App Store-এ লঞ্চ হচ্ছে।';
  });

  /* ---------- Notices (Firestore: collection "notices") ---------- */
  /* Expected fields per document: date (string), text (string) */
  let noticesData = [];
  async function loadNotices(){
    const list = document.getElementById('noticeList');
    try{
      const snap = await getDocs(collection(db, 'notices'));
      if(snap.empty){
        list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো নোটিশ নেই।</p>';
        noticesData = [];
        checkUnreadNotices();
        return;
      }
      list.innerHTML = '';
      noticesData = [];
      snap.forEach(docSnap=>{
        const n = docSnap.data();
        noticesData.push(n);
        const el = document.createElement('div');
        el.className = 'notice-item';
        el.innerHTML = `<span class="date">${n.date || ''}</span>${n.text || ''}`;
        list.appendChild(el);
      });
      checkUnreadNotices();
    }catch(err){
      list.innerHTML = '<p style="color:var(--coral);">নোটিশ লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
      console.error('loadNotices error:', err);
    }
  }

  function checkUnreadNotices(){
    let seenCount = 0;
    try{ seenCount = Number(localStorage.getItem('seenNoticeCount') || 0); }catch(e){}
    const diff = Math.max(0, noticesData.length - seenCount);
    const tileBadge = document.getElementById('noticeTileBadge');
    const dashBadge = document.getElementById('dashNoticeBadge');
    [tileBadge, dashBadge].forEach(badge=>{
      if(!badge) return;
      if(diff > 0){
        badge.textContent = diff;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });
  }

  /* ---------- Kick off Firestore data loads ---------- */
  loadCourses();
  loadProducts();
  loadSoftware();
  loadVideos();
  loadTestimonials();
  loadNotices();
  loadAnnouncement();
