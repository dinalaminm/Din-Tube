import {
  db, collection, getDocs, doc, getDoc, addDoc, serverTimestamp, increment, runTransaction,
  onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache, getGamePurchaseDates,
  itemBg, escapeHtml, showToast, extractYouTubeId, GAME_TIERS, gameFromPrice
} from '../common.js';

const params = new URLSearchParams(location.search);
const gameId = params.get('id');

let game = null;
let access = null; // { purchasedAt, expiresAt } | null
// Default selection mirrors the reference design: "1 Days" pre-selected.
let selectedTier = GAME_TIERS.find(t => t.label === '1 Days') || GAME_TIERS[0];

function fmtDate(d){
  return d.toLocaleDateString('bn-BD', { day:'numeric', month:'short', year:'numeric' });
}

function tierPrice(t){
  return Number(game[t.key] || 0);
}

function availableTiers(){
  const withPrice = GAME_TIERS.filter(t => tierPrice(t) > 0);
  return withPrice.length ? withPrice : GAME_TIERS; // legacy games with no tier prices set yet — show all, priced ৳0
}

function renderPeriodGrid(){
  const grid = document.getElementById('gdPeriodGrid');
  const tiers = availableTiers();
  grid.innerHTML = tiers.map(t=>{
    const active = t.key === selectedTier.key;
    return `<button type="button" class="gd-period-card${active ? ' active' : ''}" data-key="${t.key}">
      <span class="gd-period-name">${t.label}</span>
      <span class="gd-period-price">৳${tierPrice(t).toLocaleString('en-US')}</span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.gd-period-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = GAME_TIERS.find(x => x.key === btn.dataset.key);
      if(!t) return;
      selectedTier = t;
      renderPeriodGrid();
      renderPriceRow();
    });
  });
}

function renderPriceRow(){
  document.getElementById('gdPrice').textContent = '৳' + tierPrice(selectedTier).toLocaleString('en-US');
  document.getElementById('gdSelectedPeriod').textContent = selectedTier.label;
}

function renderAccessState(){
  const active = access && access.expiresAt.getTime() > Date.now();
  document.getElementById('gdActiveBox').style.display = active ? 'block' : 'none';
  document.getElementById('gdBuyBox').style.display = active ? 'none' : 'block';
  if(active){
    document.getElementById('gdActiveText').textContent = `চলছে — ${fmtDate(access.expiresAt)} পর্যন্ত`;
    document.getElementById('gdPlayBtn').href = `play-game.html?id=${encodeURIComponent(gameId)}`;
  }
}

function renderMoreGrid(others){
  const grid = document.getElementById('gdMoreGrid');
  if(others.length === 0){ grid.innerHTML = ''; return; }
  grid.innerHTML = others.map((g, i)=>{
    const bg = itemBg(g, i);
    const fromPrice = gameFromPrice(g);
    return `
      <a class="gs-item" href="game-detail.html?id=${encodeURIComponent(g.id)}">
        <div class="gs-item-thumb" style="background:${g.imageUrl ? `url('${g.imageUrl}') center/cover` : bg};">
          <span class="gs-live-badge"><i></i>LIVE</span>
          <span class="gs-play-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg></span>
        </div>
        <div class="gs-item-body">
          <h4>${escapeHtml(g.name || '')}</h4>
          <p>${escapeHtml(g.description || '')}</p>
          <div class="gs-item-foot"><span class="gs-from-price">From ৳${fromPrice.toLocaleString('en-US')}</span><span class="gs-subscribe-link">Subscribe →</span></div>
        </div>
      </a>`;
  }).join('');
}

async function boot(){
  if(!gameId){
    document.getElementById('gdCard').innerHTML = '<p style="padding:24px; color:var(--coral);">লাইভ স্ট্রিম পাওয়া যায়নি।</p>';
    return;
  }
  try{
    const [gameSnap, allSnap] = await Promise.all([
      getDoc(doc(db, 'games', gameId)),
      getDocs(collection(db, 'games'))
    ]);
    if(!gameSnap.exists()){
      document.getElementById('gdCard').innerHTML = '<p style="padding:24px; color:var(--coral);">এই লাইভ স্ট্রিমটি পাওয়া যায়নি — হয়তো মুছে ফেলা হয়েছে।</p>';
      return;
    }
    game = { id: gameSnap.id, ...gameSnap.data() };
    document.title = `${game.name || 'লাইভ স্ট্রিম'} | Creator Rivo`;

    const videoId = extractYouTubeId(game.videoId || '');
    if(videoId){
      document.getElementById('gdVideoFrame').src = `https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1`;
      document.getElementById('gdVideoWrap').style.display = 'block';
    } else {
      const bg = itemBg(game, 0);
      document.getElementById('gdImage').style.background = game.imageUrl ? `url('${game.imageUrl}') center/cover` : bg;
      document.getElementById('gdImageWrap').style.display = 'block';
    }
    document.getElementById('gdTitle').textContent = game.name || '';
    document.getElementById('gdDescription').textContent = game.description || '';
    if(!game.description) document.getElementById('gdDescription').style.display = 'none';

    const tiers = availableTiers();
    if(!tiers.some(t => t.key === selectedTier.key)) selectedTier = tiers[0];
    renderPeriodGrid();
    renderPriceRow();

    const others = [];
    allSnap.forEach(d=>{ if(d.id !== gameId) others.push({ id: d.id, ...d.data() }); });
    renderMoreGrid(others.slice(0, 6));

    onUserReady(async (user)=>{
      access = user ? (await getGamePurchaseDates(user.uid)).get(gameId) || null : null;
      renderAccessState();
    });
  }catch(err){
    console.error('game-detail load error:', err);
    document.getElementById('gdCard').innerHTML = '<p style="padding:24px; color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
  }
}
boot();

document.getElementById('gdShareBtn').addEventListener('click', async ()=>{
  const shareData = { title: game ? game.name : 'লাইভ স্ট্রিম', url: location.href };
  try{
    if(navigator.share){ await navigator.share(shareData); return; }
  }catch(e){ /* user cancelled or unsupported — fall through to copy */ }
  try{
    await navigator.clipboard.writeText(location.href);
    showToast('লিংক কপি হয়েছে');
  }catch(e){ /* clipboard unavailable */ }
});

document.getElementById('gdSubscribeBtn').addEventListener('click', ()=> openCheckout());

/* ---------- Checkout modal (same pattern as video-pack-detail.js) ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
const stepSuccess = document.getElementById('checkoutStepSuccess');
const continueBtn = document.getElementById('checkoutContinueBtn');
const termsCheckbox = document.getElementById('checkoutTerms');
let selectedMethod = null;

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

function openCheckout(){
  const currentUser = getCurrentUser();
  if(!currentUser){
    window.location.href = 'login.html';
    return;
  }
  const total = tierPrice(selectedTier);
  document.getElementById('checkoutItemsLabel').textContent = `${game.name || ''} (${selectedTier.label})`;
  document.getElementById('checkoutTotalLabel').textContent = '৳' + total.toLocaleString('en-US');
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
    id: game.id || null,
    type: 'games',
    name: `${game.name || ''} (${selectedTier.label})`,
    price: tierPrice(selectedTier),
    hours: selectedTier.hours,
    qty: 1
  };
}

function showSuccess(expiresAt){
  document.getElementById('checkoutSuccessExpiry').textContent = `${fmtDate(expiresAt)} পর্যন্ত সক্রিয়।`;
  document.getElementById('checkoutSuccessPlayBtn').href = `play-game.html?id=${encodeURIComponent(gameId)}`;
  stepMethod.style.display = 'none';
  stepManual.style.display = 'none';
  stepSuccess.style.display = 'block';
}

async function payWithWallet(){
  const msg = document.getElementById('checkoutStepMsg');
  const currentUser = getCurrentUser();
  const profile = getCurrentProfile();
  const total = tierPrice(selectedTier);
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
    await runTransaction(db, async (tx)=>{
      const uSnap = await tx.get(userRef);
      const bal = Number((uSnap.exists() ? uSnap.data().walletBalance : 0) || 0);
      if(bal < total) throw new Error('insufficient-balance');
      tx.update(userRef, { walletBalance: increment(-total) });
      tx.set(orderRef, {
        uid: currentUser.uid, name: currentUser.displayName || '', email: currentUser.email || '',
        items: [currentOrderItem()], total, status: 'completed', paymentMethod: 'Wallet', createdAt: serverTimestamp()
      });
      tx.set(txnRef, {
        uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে লাইভ স্ট্রিম সাবস্ক্রিপশন কেনা', createdAt: serverTimestamp()
      });
    });
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    // The order's createdAt is a serverTimestamp and isn't populated in our
    // local write yet — "now" is close enough for an hour-granularity plan.
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt.getTime() + selectedTier.hours * 60 * 60 * 1000);
    const existingExpiry = access ? access.expiresAt : null;
    access = (existingExpiry && existingExpiry > expiresAt) ? { purchasedAt: access.purchasedAt, expiresAt: existingExpiry } : { purchasedAt, expiresAt };
    showSuccess(access.expiresAt);
    renderAccessState();
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
  const total = tierPrice(selectedTier);
  const btn = document.getElementById('manualSubmitBtn');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
  try{
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
    showToast('অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে সাবস্ক্রিপশন চালু হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।');
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});
