import {
  db, collection, getDocs, doc, getDoc, addDoc, serverTimestamp, increment, runTransaction,
  onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache,
  getGamePurchaseDates, itemBg, escapeHtml, showToast, renderSkeletonCards
} from '../common.js';

const grid = document.getElementById('gamesGrid');
let games = [];
let purchaseDates = new Map();

function msToDays(ms){ return ms / (1000 * 60 * 60 * 24); }

function accessInfoFor(game){
  const purchasedAt = purchaseDates.get(game.id);
  if(!purchasedAt) return { active:false, purchasedAt:null, expiresAt:null };
  const planDays = Number(game.planDays || 0);
  const expiresAt = new Date(purchasedAt.getTime() + planDays * 24 * 60 * 60 * 1000);
  return { active: expiresAt.getTime() > Date.now(), purchasedAt, expiresAt };
}

function fmtDate(d){
  return d.toLocaleDateString('bn-BD', { day:'numeric', month:'short', year:'numeric' });
}

async function boot(){
  renderSkeletonCards('gamesGrid', 6);
  try{
    const snap = await getDocs(collection(db, 'games'));
    games = [];
    snap.forEach(d => games.push({ id: d.id, ...d.data() }));
  }catch(err){
    grid.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error('games load error:', err);
    return;
  }

  onUserReady(async (user)=>{
    purchaseDates = user ? await getGamePurchaseDates(user.uid) : new Map();
    render();
  });

  // Render once immediately (without access info) so the page isn't blank
  // while we wait on auth state / purchase history.
  if(games.length) render();
}

function render(){
  if(games.length === 0){
    grid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো গেম যোগ করা হয়নি।</p>';
    return;
  }
  grid.innerHTML = '';
  games.forEach((game, i)=>{
    const info = accessInfoFor(game);
    const el = document.createElement('div');
    el.className = 'product-card';
    el.style.cursor = 'default';
    const bg = itemBg(game, i);
    el.innerHTML = `
      <div class="product-img" style="background:${game.imageUrl ? `url('${game.imageUrl}') center/cover` : bg};">
        ${info.active ? `<div class="badge-sale" style="background:#16A34A;">অ্যাক্টিভ</div>` : ''}
      </div>
      <div class="product-body">
        <h4>${escapeHtml(game.name || '')}</h4>
        <span style="color:var(--muted); font-size:0.75rem; font-weight:600;">মেয়াদ: ${Number(game.planDays || 0)} দিন</span>
        ${info.active
          ? `<p style="color:#16A34A; font-size:0.78rem; margin:4px 0 0;">মেয়াদ আছে — ${fmtDate(info.expiresAt)} পর্যন্ত</p>`
          : `<div class="price-row"><span class="price-now">৳${Number(game.price || 0).toLocaleString('en-US')}</span>${game.oldPrice ? `<span class="price-old">৳${Number(game.oldPrice).toLocaleString('en-US')}</span>` : ''}</div>`
        }
        <button type="button" class="btn-primary" style="width:100%; margin-top:10px; border:none; cursor:pointer;" data-action="${info.active ? 'play' : 'buy'}" data-id="${game.id}">
          ${info.active ? 'প্লে করুন' : (purchaseDates.has(game.id) ? 'মেয়াদ শেষ — আবার কিনুন' : 'কিনুন')}
        </button>
      </div>
    `;
    grid.appendChild(el);
  });

  grid.querySelectorAll('[data-action="play"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      window.location.href = `play-game.html?id=${encodeURIComponent(btn.dataset.id)}`;
    });
  });
  grid.querySelectorAll('[data-action="buy"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const game = games.find(g => g.id === btn.dataset.id);
      if(game) openCheckout(game);
    });
  });
}

boot();

/* ---------- Checkout modal (same pattern as detail.html's buy-now flow) ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
const continueBtn = document.getElementById('checkoutContinueBtn');
const termsCheckbox = document.getElementById('checkoutTerms');
let selectedMethod = null;
let checkoutItem = null;

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
  document.getElementById('checkoutStepMsg').textContent = '';
  document.getElementById('manualPayMsg').textContent = '';
  document.getElementById('manualTxnId').value = '';
}

function updateContinueState(){
  const enabled = !!selectedMethod && termsCheckbox.checked;
  continueBtn.disabled = !enabled;
  continueBtn.style.opacity = enabled ? '1' : '0.5';
}

function openCheckout(game){
  const currentUser = getCurrentUser();
  if(!currentUser){
    window.location.href = 'login.html';
    return;
  }
  checkoutItem = game;
  const total = Number(game.price || 0);
  document.getElementById('checkoutItemsLabel').textContent = game.name || '';
  document.getElementById('checkoutTotalLabel').textContent = '৳' + total.toLocaleString('en-US');
  const profile = getCurrentProfile();
  document.getElementById('pmWalletBalance').textContent = 'ব্যালেন্স: ৳' + Number(profile?.walletBalance || 0).toLocaleString('en-US');
  resetCheckoutModal();
  overlay.style.display = 'flex';
}

document.getElementById('checkoutCloseBtn').addEventListener('click', ()=>{ overlay.style.display = 'none'; });
overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.style.display = 'none'; });

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

function currentOrderItems(){
  return [{ id: checkoutItem.id || null, type: 'games', name: checkoutItem.name || '', price: Number(checkoutItem.price || 0), qty: 1 }];
}

async function payWithWallet(){
  const msg = document.getElementById('checkoutStepMsg');
  const currentUser = getCurrentUser();
  const profile = getCurrentProfile();
  const total = Number(checkoutItem.price || 0);
  if(total > Number(profile?.walletBalance || 0)){
    msg.className = 'form-msg err';
    msg.textContent = 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। আগে ডিপোজিট করুন।';
    return;
  }
  msg.className = 'form-msg';
  msg.textContent = 'পেমেন্ট প্রসেস হচ্ছে...';
  continueBtn.disabled = true;
  const items = currentOrderItems();
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
        uid: currentUser.uid, name: currentUser.displayName || '', email: currentUser.email || '',
        items, total, status: 'completed', paymentMethod: 'Wallet', createdAt: serverTimestamp()
      });
      tx.set(txnRef, {
        uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে গেম কেনা', createdAt: serverTimestamp()
      });
    });
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    overlay.style.display = 'none';
    showToast('পেমেন্ট সফল হয়েছে! গেম এখনই খেলা যাবে।');
    // The order's createdAt is a serverTimestamp, so it isn't populated in
    // our local write yet — use "now" as the purchase date, which is close
    // enough (server clock skew is negligible for a day-granularity plan).
    purchaseDates.set(checkoutItem.id, new Date());
    render();
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
  const total = Number(checkoutItem.price || 0);
  const btn = document.getElementById('manualSubmitBtn');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
  try{
    await addDoc(collection(db, 'orders'), {
      uid: currentUser.uid,
      name: currentUser.displayName || '',
      email: currentUser.email || '',
      items: currentOrderItems(),
      total,
      status: 'pending',
      paymentMethod: selectedMethod,
      transactionId: txnId,
      createdAt: serverTimestamp()
    });
    overlay.style.display = 'none';
    showToast('অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে গেম আনলক হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।');
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});
