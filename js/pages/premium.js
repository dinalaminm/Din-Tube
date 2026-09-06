import {
  db, collection, getDocs, doc, getDoc, addDoc, serverTimestamp, increment, runTransaction,
  onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache, getPremiumStatus,
  escapeHtml, showToast, itemBg
} from '../common.js';

let plans = [];
let premium = { active:false, expiresAt:null };

function fmtDate(d){
  return d.toLocaleDateString('bn-BD', { day:'numeric', month:'short', year:'numeric' });
}

/* ---------- Hero ---------- */
document.getElementById('viewPlansBtn').addEventListener('click', ()=>{
  document.getElementById('plans').scrollIntoView({ behavior:'smooth' });
});

function renderHeroAndStatus(){
  const heroText = document.getElementById('premiumHeroText');
  const statusBox = document.getElementById('plansStatus');
  if(premium.active){
    heroText.textContent = 'আপনার প্রিমিয়াম মেম্বারশিপ সক্রিয় আছে — সব লক করা ভিডিও উপভোগ করুন';
    statusBox.style.display = 'block';
    statusBox.innerHTML = `<span style="color:#16A34A; font-weight:700;">আপনার প্রিমিয়াম মেয়াদ আছে — ${fmtDate(premium.expiresAt)} পর্যন্ত।</span> নিচে থেকে মেয়াদ বাড়াতে পারেন।`;
  }else{
    heroText.textContent = 'এই ভিডিওটি দেখতে সাবস্ক্রাইব করুন';
    statusBox.style.display = 'none';
  }
}

/* ---------- Playlists (grouped from the existing "videos" collection by
   its category field — so a "playlist" here is just a category) ---------- */
async function loadPlaylists(){
  const grid = document.getElementById('playlistsGrid');
  try{
    const snap = await getDocs(collection(db, 'videos'));
    const videos = [];
    snap.forEach(d => videos.push({ id: d.id, ...d.data() }));
    const groups = new Map();
    videos.forEach(v=>{
      const cat = v.category || 'সাধারণ';
      if(!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(v);
    });
    if(groups.size === 0){
      grid.innerHTML = '<p style="color:var(--muted); grid-column:1/-1;">এখনো কোনো প্লেলিস্ট নেই।</p>';
      return;
    }
    grid.innerHTML = '';
    let i = 0;
    groups.forEach((items, category)=>{
      const thumb = items[0];
      const bg = itemBg(thumb, i++);
      const a = document.createElement('a');
      a.className = 'playlist-card';
      a.href = `videos.html?category=${encodeURIComponent(category)}`;
      a.innerHTML = `
        <div class="playlist-thumb" style="background:${thumb.imageUrl ? `url('${thumb.imageUrl}') center/cover` : bg};">
          <span class="playlist-count-badge">${items.length} টি ভিডিও</span>
          <span class="playlist-lock-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
          </span>
          <span class="playlist-play">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>
          </span>
        </div>
        <div class="playlist-title">${escapeHtml(category)}</div>
      `;
      grid.appendChild(a);
    });
  }catch(err){
    grid.innerHTML = '<p style="color:var(--coral); grid-column:1/-1;">লোড করা যায়নি।</p>';
    console.error('premium playlists load error:', err);
  }
}

/* ---------- Plans ---------- */
async function loadPlans(){
  const list = document.getElementById('plansList');
  try{
    const snap = await getDocs(collection(db, 'premiumPlans'));
    plans = [];
    snap.forEach(d => plans.push({ id: d.id, ...d.data() }));
    renderPlans();
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি।</p>';
    console.error('premium plans load error:', err);
  }
}

function renderPlans(){
  const list = document.getElementById('plansList');
  if(plans.length === 0){
    list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো প্ল্যান যোগ করা হয়নি।</p>';
    return;
  }
  list.innerHTML = plans.map(plan=>{
    const isPopular = !!plan.badgeText;
    const price = Number(plan.price || 0);
    const oldPrice = plan.oldPrice ? Number(plan.oldPrice) : null;
    const discount = oldPrice && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : null;
    return `
      <div class="plan-card${isPopular ? ' popular' : ''}">
        ${isPopular ? `<div class="plan-ribbon">${escapeHtml(plan.badgeText)}</div>` : ''}
        <div class="plan-body">
          <div class="plan-eyebrow">PREMIUM</div>
          <div class="plan-title-row">
            <h3>${escapeHtml(plan.title || '')}</h3>
            ${discount ? `<span class="plan-discount">-${discount}%</span>` : ''}
          </div>
          <div class="plan-price-row">
            <span class="plan-price">৳${price.toLocaleString('en-US')}</span>
            ${oldPrice ? `<span class="plan-old-price">৳${oldPrice.toLocaleString('en-US')}</span>` : ''}
          </div>
          <div class="plan-tags">
            <span class="plan-tag access">${Number(plan.days || 0)} দিনের অ্যাক্সেস</span>
            <span class="plan-tag">সব প্লেলিস্ট</span>
          </div>
          <ul class="plan-features">
            <li>সব লক করা প্রিমিয়াম ভিডিও আনলক</li>
            <li>পুরো মেয়াদের জন্য সাইট-ওয়াইড মেম্বারশিপ</li>
            <li>মেয়াদ শেষ হওয়ার আগে যেকোনো সময় বাড়ানো যাবে</li>
          </ul>
          <button type="button" class="plan-subscribe-btn" data-plan-id="${plan.id}">
            ${premium.active ? 'মেয়াদ বাড়ান' : 'সাবস্ক্রাইব করুন'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-plan-id]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const plan = plans.find(p => p.id === btn.dataset.planId);
      if(plan) openCheckout(plan);
    });
  });
}

async function boot(){
  loadPlaylists();
  await loadPlans();
  onUserReady(async (user)=>{
    if(user){
      premium = await getPremiumStatus(user.uid);
    }
    renderHeroAndStatus();
    renderPlans();
  });
}
boot();

/* ---------- Checkout modal (same pattern as games.html/video-packs.html) ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
const stepSuccess = document.getElementById('checkoutStepSuccess');
const continueBtn = document.getElementById('checkoutContinueBtn');
const termsCheckbox = document.getElementById('checkoutTerms');
let selectedMethod = null;
let checkoutPlan = null;

const MERCHANT_NUMBER_FIELD = { bKash:'bkashNumber', Nagad:'nagadNumber', Rocket:'rocketNumber' };
let merchantNumbersCache = null;
async function getMerchantNumbers(){
  if(merchantNumbersCache) return merchantNumbersCache;
  try{
    const snap = await getDoc(doc(db, 'settings', 'payment'));
    merchantNumbersCache = snap.exists() ? snap.data() : {};
  }catch(err){
    console.error('payment settings fetch error:', err);
    merchantNumbersCache = {};
  }
  return merchantNumbersCache;
}

function resetCheckoutModal(){
  selectedMethod = null;
  termsCheckbox.checked = false;
  document.querySelectorAll('.pm-row').forEach(r => r.classList.remove('selected'));
  updateContinueState();
  stepMethod.style.display = 'block';
  stepManual.style.display = 'none';
  stepSuccess.style.display = 'none';
  document.getElementById('checkoutStepMsg').textContent = '';
  document.getElementById('manualPayMsg').textContent = '';
  document.getElementById('manualTxnId').value = '';
}

function updateContinueState(){
  const enabled = !!selectedMethod && termsCheckbox.checked;
  continueBtn.disabled = !enabled;
  continueBtn.style.opacity = enabled ? '1' : '0.5';
}

function openCheckout(plan){
  const currentUser = getCurrentUser();
  if(!currentUser){
    window.location.href = 'login.html';
    return;
  }
  checkoutPlan = plan;
  const price = Number(plan.price || 0);
  document.getElementById('checkoutItemsLabel').textContent = `${plan.title || ''} প্ল্যান (${Number(plan.days || 0)} দিন)`;
  document.getElementById('checkoutTotalLabel').textContent = '৳' + price.toLocaleString('en-US');
  const profile = getCurrentProfile();
  document.getElementById('pmWalletBalance').textContent = 'ব্যালেন্স: ৳' + Number(profile?.walletBalance || 0).toLocaleString('en-US');
  resetCheckoutModal();
  overlay.style.display = 'flex';
}

document.getElementById('checkoutCloseBtn').addEventListener('click', ()=>{ overlay.style.display = 'none'; });
overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.style.display = 'none'; });
document.getElementById('checkoutSuccessCloseBtn').addEventListener('click', ()=>{ overlay.style.display = 'none'; });

document.querySelectorAll('.pm-row').forEach(row=>{
  row.addEventListener('click', ()=>{
    document.querySelectorAll('.pm-row').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    selectedMethod = row.dataset.method;
    updateContinueState();
  });
});
termsCheckbox.addEventListener('change', updateContinueState);

continueBtn.addEventListener('click', async ()=>{
  if(!selectedMethod) return;
  if(selectedMethod === 'Wallet'){
    await payWithWallet();
  }else{
    const numbers = await getMerchantNumbers();
    const number = numbers[MERCHANT_NUMBER_FIELD[selectedMethod]];
    document.getElementById('manualPayInstruction').textContent = number
      ? `নিচের ${selectedMethod} নম্বরে "Send Money" করে টাকা পাঠান, তারপর ট্রানজেকশন আইডি বসান।`
      : `${selectedMethod} নম্বর এখনো যোগ করা হয়নি — অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।`;
    document.getElementById('manualPayNumber').textContent = number || '';
    stepMethod.style.display = 'none';
    stepManual.style.display = 'block';
  }
});

document.getElementById('checkoutBackBtn').addEventListener('click', ()=>{
  stepManual.style.display = 'none';
  stepMethod.style.display = 'block';
});

document.getElementById('manualPayCopyBtn').addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  const number = document.getElementById('manualPayNumber').textContent.trim();
  if(!number) return;
  try{
    await navigator.clipboard.writeText(number);
  }catch(err){
    const ta = document.createElement('textarea');
    ta.value = number;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  btn.classList.add('copied');
  showToast('নম্বর কপি হয়েছে');
  setTimeout(()=> btn.classList.remove('copied'), 1500);
});

function currentOrderItem(){
  return {
    id: checkoutPlan.id || null,
    type: 'premium',
    name: `${checkoutPlan.title || ''} প্ল্যান`,
    price: Number(checkoutPlan.price || 0),
    qty: 1,
    days: Number(checkoutPlan.days || 0)
  };
}

async function payWithWallet(){
  const msg = document.getElementById('checkoutStepMsg');
  const currentUser = getCurrentUser();
  const profile = getCurrentProfile();
  const total = Number(checkoutPlan.price || 0);
  const days = Number(checkoutPlan.days || 0);
  if(total > Number(profile?.walletBalance || 0)){
    msg.className = 'form-msg err';
    msg.textContent = 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। আগে ডিপোজিট করুন।';
    return;
  }
  msg.className = 'form-msg';
  msg.textContent = 'পেমেন্ট প্রসেস হচ্ছে...';
  continueBtn.disabled = true;
  const userRef = doc(db, 'users', currentUser.uid);
  const orderRef = doc(collection(db, 'orders'));
  const txnRef = doc(collection(db, 'walletTransactions'));
  try{
    let newExpiry;
    await runTransaction(db, async (tx)=>{
      const uSnap = await tx.get(userRef);
      const bal = Number((uSnap.exists() ? uSnap.data().walletBalance : 0) || 0);
      if(bal < total) throw new Error('insufficient-balance');
      const currentExpiry = uSnap.exists() && uSnap.data().premiumExpiresAt && uSnap.data().premiumExpiresAt.toDate
        ? uSnap.data().premiumExpiresAt.toDate() : null;
      const startFrom = currentExpiry && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
      newExpiry = new Date(startFrom.getTime() + days * 24 * 60 * 60 * 1000);
      tx.update(userRef, { walletBalance: increment(-total), premiumExpiresAt: newExpiry });
      tx.set(orderRef, {
        uid: currentUser.uid, name: currentUser.displayName || '', email: currentUser.email || '',
        items: [currentOrderItem()], total, status: 'completed', paymentMethod: 'Wallet', createdAt: serverTimestamp()
      });
      tx.set(txnRef, {
        uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে প্রিমিয়াম সাবস্ক্রিপশন', createdAt: serverTimestamp()
      });
    });
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    premium = { active:true, expiresAt:newExpiry };
    document.getElementById('successExpiryText').textContent = `আপনার প্রিমিয়াম মেয়াদ এখন ${fmtDate(newExpiry)} পর্যন্ত।`;
    stepMethod.style.display = 'none';
    stepSuccess.style.display = 'block';
    renderHeroAndStatus();
    renderPlans();
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = err.message === 'insufficient-balance' ? 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।' : 'পেমেন্ট ব্যর্থ হয়েছে, আবার চেষ্টা করুন।';
    console.error('wallet payment error:', err);
  }finally{
    continueBtn.disabled = false;
  }
}

document.getElementById('manualSubmitBtn').addEventListener('click', async ()=>{
  const msg = document.getElementById('manualPayMsg');
  const txnId = document.getElementById('manualTxnId').value.trim();
  const currentUser = getCurrentUser();
  if(!txnId){
    msg.className = 'form-msg err';
    msg.textContent = 'ট্রানজেকশন আইডি দিন।';
    return;
  }
  const total = Number(checkoutPlan.price || 0);
  const btn = document.getElementById('manualSubmitBtn');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
  try{
    // Premium activation happens when admin approves this order — see admin.html.
    await addDoc(collection(db, 'orders'), {
      uid: currentUser.uid,
      name: currentUser.displayName || '',
      email: currentUser.email || '',
      items: [currentOrderItem()],
      total,
      status: 'pending',
      paymentMethod: selectedMethod,
      transactionId: txnId,
      createdAt: serverTimestamp()
    });
    overlay.style.display = 'none';
    showToast('অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে প্রিমিয়াম সক্রিয় হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।');
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});
