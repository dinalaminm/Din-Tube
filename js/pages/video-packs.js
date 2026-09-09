import {
  db, collection, getDocs, doc, getDoc, addDoc, serverTimestamp, increment, runTransaction,
  onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache,
  itemBg, escapeHtml, showToast, renderSkeletonCards
} from '../common.js';

const grid = document.getElementById('videoPacksGrid');
let packs = [];

const TIERS = [
  { qty:1, key:'price1', label:'১টি' },
  { qty:5, key:'price5', label:'৫টি', popular:true },
  { qty:10, key:'price10', label:'১০টি' },
];

function remainingOf(pack){
  const total = Array.isArray(pack.links) ? pack.links.length : 0;
  return Math.max(0, total - Number(pack.assignedCount || 0));
}

async function boot(){
  renderSkeletonCards('videoPacksGrid', 6);
  try{
    const snap = await getDocs(collection(db, 'videopacks'));
    packs = [];
    snap.forEach(d => packs.push({ id: d.id, ...d.data() }));
  }catch(err){
    grid.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error('videopacks load error:', err);
    return;
  }
  render();
}

function render(){
  if(packs.length === 0){
    grid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো ভিডিও প্যাক যোগ করা হয়নি।</p>';
    return;
  }
  grid.innerHTML = packs.map((pack, i)=>{
    const remaining = remainingOf(pack);
    const bg = itemBg(pack, i);
    const tierCards = TIERS.map(t=>{
      const price = Number(pack[t.key] || 0);
      const unitPrice = Number(pack.price1 || 0);
      const compareAt = unitPrice * t.qty;
      const discount = t.qty > 1 && compareAt > price ? Math.round((1 - price / compareAt) * 100) : null;
      const outOfStock = remaining < t.qty;
      return `
        <div class="plan-card${t.popular ? ' popular' : ''}${outOfStock ? ' out-of-stock' : ''}">
          ${t.popular ? `<div class="plan-ribbon">সেরা অফার</div>` : ''}
          <div class="plan-body">
            <div class="plan-eyebrow">ভিডিও প্যাক</div>
            <div class="plan-title-row">
              <h3>${t.label}</h3>
              ${discount ? `<span class="plan-discount">-${discount}%</span>` : ''}
            </div>
            <div class="plan-price-row">
              <span class="plan-price">৳${price.toLocaleString('en-US')}</span>
              ${discount ? `<span class="plan-old-price">৳${compareAt.toLocaleString('en-US')}</span>` : ''}
            </div>
            <div class="plan-tags">
              <span class="plan-tag access">${t.qty} টি ভিডিও</span>
              <span class="plan-tag">${outOfStock ? 'স্টক নেই' : `স্টকে আছে ${remaining} টি`}</span>
            </div>
            <ul class="plan-features">
              <li>${t.qty} টি সম্পূর্ণ গুগল ড্রাইভ লিংক পাবেন</li>
              <li>পেমেন্টের সাথে সাথেই লিংক পেয়ে যাবেন</li>
              <li>কোনো মেয়াদ নেই — সারাজীবন ব্যবহার করুন</li>
            </ul>
            <button type="button" class="plan-subscribe-btn" data-action="buy" data-id="${pack.id}" data-qty="${t.qty}" ${outOfStock ? 'disabled' : ''}>
              ${outOfStock ? 'স্টক নেই' : 'কিনুন'}
            </button>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="vp-pack-block">
        <div class="vp-pack-header">
          <div class="vp-pack-thumb" style="background:${pack.imageUrl ? `url('${pack.imageUrl}') center/cover` : bg};"></div>
          <div>
            <div class="vp-pack-title">${escapeHtml(pack.title || '')}</div>
            <div class="vp-pack-sub">${remaining === 0 ? 'স্টক শেষ' : `স্টকে আছে: ${remaining} টি ভিডিও`}</div>
          </div>
        </div>
        <div class="vp-tier-cards">${tierCards}</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-action="buy"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pack = packs.find(p => p.id === btn.dataset.id);
      if(pack) openCheckout(pack, Number(btn.dataset.qty));
    });
  });
}

boot();

/* ---------- Checkout modal (same pattern as games.html's buy-now flow) ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
const stepSuccess = document.getElementById('checkoutStepSuccess');
const continueBtn = document.getElementById('checkoutContinueBtn');
const termsCheckbox = document.getElementById('checkoutTerms');
let selectedMethod = null;
let checkoutItem = null; // { pack, qty, tierKey, price }

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

function openCheckout(pack, qty){
  const currentUser = getCurrentUser();
  if(!currentUser){
    window.location.href = 'login.html';
    return;
  }
  const tier = TIERS.find(t => t.qty === qty) || TIERS[0];
  const price = Number(pack[tier.key] || 0);
  checkoutItem = { pack, qty: tier.qty, price };
  document.getElementById('checkoutItemsLabel').textContent = `${pack.title || ''} (${tier.label})`;
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

function currentOrderItem(deliveredLinks){
  const item = {
    id: checkoutItem.pack.id || null,
    type: 'videopacks',
    name: `${checkoutItem.pack.title || ''} (${checkoutItem.qty}টি)`,
    price: checkoutItem.price,
    qty: checkoutItem.qty
  };
  if(deliveredLinks) item.deliveredLinks = deliveredLinks;
  return item;
}

function showDeliveredLinks(links){
  const list = document.getElementById('deliveredLinksList');
  list.innerHTML = links.map((link, idx)=> `
    <div class="delivered-link-row">
      <span>ভিডিও ${idx + 1}</span>
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener">লিংক খুলুন →</a>
    </div>
  `).join('');
  stepMethod.style.display = 'none';
  stepManual.style.display = 'none';
  stepSuccess.style.display = 'block';
}

async function payWithWallet(){
  const msg = document.getElementById('checkoutStepMsg');
  const currentUser = getCurrentUser();
  const profile = getCurrentProfile();
  const total = checkoutItem.price;
  const qty = checkoutItem.qty;
  if(total > Number(profile?.walletBalance || 0)){
    msg.className = 'form-msg err';
    msg.textContent = 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। আগে ডিপোজিট করুন।';
    return;
  }
  msg.className = 'form-msg';
  msg.textContent = 'পেমেন্ট প্রসেস হচ্ছে...';
  continueBtn.disabled = true;
  const userRef = doc(db, 'users', currentUser.uid);
  const packRef = doc(db, 'videopacks', checkoutItem.pack.id);
  const orderRef = doc(collection(db, 'orders'));
  const txnRef = doc(collection(db, 'walletTransactions'));
  try{
    let deliveredLinks;
    await runTransaction(db, async (tx)=>{
      const uSnap = await tx.get(userRef);
      const packSnap = await tx.get(packRef);
      if(!packSnap.exists()) throw new Error('pack-missing');
      const bal = Number((uSnap.exists() ? uSnap.data().walletBalance : 0) || 0);
      if(bal < total) throw new Error('insufficient-balance');
      const pack = packSnap.data();
      const links = Array.isArray(pack.links) ? pack.links : [];
      const assigned = Number(pack.assignedCount || 0);
      if(links.length - assigned < qty) throw new Error('out-of-stock');
      deliveredLinks = links.slice(assigned, assigned + qty);
      tx.update(userRef, { walletBalance: increment(-total) });
      tx.update(packRef, { assignedCount: assigned + qty });
      tx.set(orderRef, {
        uid: currentUser.uid, name: currentUser.displayName || '', email: currentUser.email || '',
        items: [currentOrderItem(deliveredLinks)], total, status: 'completed', paymentMethod: 'Wallet', createdAt: serverTimestamp()
      });
      tx.set(txnRef, {
        uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে ভিডিও প্যাক কেনা', createdAt: serverTimestamp()
      });
    });
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    // Reflect the new stock locally so the card updates without a refetch.
    checkoutItem.pack.assignedCount = Number(checkoutItem.pack.assignedCount || 0) + qty;
    showDeliveredLinks(deliveredLinks);
    render();
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = err.message === 'insufficient-balance' ? 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।'
      : err.message === 'out-of-stock' ? 'দুঃখিত, এই মুহূর্তে পর্যাপ্ত স্টক নেই।'
      : 'পেমেন্ট ব্যর্থ হয়েছে, আবার চেষ্টা করুন।';
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
  const total = checkoutItem.price;
  const btn = document.getElementById('manualSubmitBtn');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
  try{
    // No links are handed out yet for manual payments — admin allocates them
    // from the admin panel once the payment is verified and marked completed.
    await addDoc(collection(db, 'orders'), {
      uid: currentUser.uid,
      name: currentUser.displayName || '',
      email: currentUser.email || '',
      items: [currentOrderItem(null)],
      total,
      status: 'pending',
      paymentMethod: selectedMethod,
      transactionId: txnId,
      createdAt: serverTimestamp()
    });
    overlay.style.display = 'none';
    showToast('অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে লিংক পাঠানো হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।');
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});
