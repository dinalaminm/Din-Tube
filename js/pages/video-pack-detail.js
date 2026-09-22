import {
  db, collection, getDocs, doc, getDoc, addDoc, serverTimestamp, increment, runTransaction, query, where,
  onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache,
  itemBg, escapeHtml, showToast, extractYouTubeId, renderSkeletonCards
} from '../common.js';
import { limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const params = new URLSearchParams(location.search);
const packId = params.get('id');

const TIERS = [
  { qty:1, key:'price1', label:'১টি' },
  { qty:5, key:'price5', label:'৫টি', popular:true },
  { qty:10, key:'price10', label:'১০টি' },
];

function remainingOf(pack){
  const total = pack.system === 'v2' ? Number(pack.totalCount || 0) : (Array.isArray(pack.links) ? pack.links.length : 0);
  return Math.max(0, total - Number(pack.assignedCount || 0));
}

let pack = null;
let selectedTier = TIERS[1]; // ডিফল্ট: ৫টি (সেরা অফার)

function renderQtyRow(){
  const row = document.getElementById('vpdQtyRow');
  const remaining = remainingOf(pack);
  row.innerHTML = TIERS.map(t=>{
    const oos = remaining < t.qty;
    const active = t.qty === selectedTier.qty;
    return `<button type="button" class="vpd-qty-chip${active ? ' active' : ''}${oos ? ' oos' : ''}" data-qty="${t.qty}" ${oos ? 'disabled' : ''}>
      ${t.popular ? '<span class="vpd-qty-tag">সেরা অফার</span>' : ''}
      <span class="vpd-qty-num">${t.label}</span>
      <span class="vpd-qty-price">৳${Number(pack[t.key] || 0).toLocaleString('en-US')}</span>
    </button>`;
  }).join('');
  row.querySelectorAll('.vpd-qty-chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = TIERS.find(x => x.qty === Number(btn.dataset.qty));
      if(!t) return;
      selectedTier = t;
      renderQtyRow();
      renderPriceAndBuy();
    });
  });
}

function renderPriceAndBuy(){
  const remaining = remainingOf(pack);
  const price = Number(pack[selectedTier.key] || 0);
  const unitPrice = Number(pack.price1 || 0);
  const compareAt = unitPrice * selectedTier.qty;
  const discount = selectedTier.qty > 1 && compareAt > price ? Math.round((1 - price / compareAt) * 100) : null;

  document.getElementById('vpdPrice').textContent = '৳' + price.toLocaleString('en-US');
  const oldEl = document.getElementById('vpdOldPrice');
  const discEl = document.getElementById('vpdDiscount');
  if(discount){
    oldEl.textContent = '৳' + compareAt.toLocaleString('en-US');
    discEl.style.display = 'inline-block';
    discEl.textContent = `-${discount}% ছাড়`;
  } else {
    oldEl.textContent = '';
    discEl.style.display = 'none';
  }

  const stockEl = document.getElementById('vpdStock');
  stockEl.textContent = remaining === 0 ? 'স্টক শেষ' : `স্টকে আছে ${remaining} টি ভিডিও`;
  stockEl.style.color = remaining === 0 ? 'var(--coral)' : '#16A34A';

  const buyBtn = document.getElementById('vpdBuyBtn');
  const oos = remaining < selectedTier.qty;
  buyBtn.textContent = oos ? 'স্টক নেই' : `কিনুন — ৳${price.toLocaleString('en-US')}`;
  buyBtn.disabled = oos;
  buyBtn.style.opacity = oos ? '0.6' : '1';
  buyBtn.onclick = oos ? null : ()=> openCheckout(pack, selectedTier.qty);
}

function renderMoreGrid(others){
  const grid = document.getElementById('vpdMoreGrid');
  if(others.length === 0){ grid.innerHTML = ''; return; }
  grid.innerHTML = others.map((p, i)=>{
    const remaining = remainingOf(p);
    const bg = itemBg(p, i);
    return `
      <a class="product-card" href="video-pack-detail.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none; color:inherit;">
        <div class="product-img" style="background:${p.imageUrl ? `url('${p.imageUrl}') center/cover` : bg};">
          ${remaining === 0 ? `<div class="badge-sale" style="background:#9CA3AF;">স্টক নেই</div>` : ''}
        </div>
        <div class="product-body">
          <h4>${escapeHtml(p.title || '')}</h4>
          <span style="color:var(--muted); font-size:0.75rem; font-weight:600;">${remaining === 0 ? 'স্টক শেষ' : `স্টকে আছে ${remaining} টি`}</span>
          <div class="price-row"><span class="price-now">৳${Number(p.price1 || 0).toLocaleString('en-US')} থেকে</span></div>
        </div>
      </a>`;
  }).join('');
}

async function boot(){
  if(!packId){
    document.getElementById('vpdCard').innerHTML = '<p style="padding:24px; color:var(--coral);">ভিডিও প্যাক পাওয়া যায়নি।</p>';
    return;
  }
  try{
    const [packSnap, allSnap] = await Promise.all([
      getDoc(doc(db, 'videopacks', packId)),
      getDocs(collection(db, 'videopacks'))
    ]);
    if(!packSnap.exists()){
      document.getElementById('vpdCard').innerHTML = '<p style="padding:24px; color:var(--coral);">এই ভিডিও প্যাকটি পাওয়া যায়নি — হয়তো মুছে ফেলা হয়েছে।</p>';
      return;
    }
    pack = { id: packSnap.id, ...packSnap.data() };
    document.title = `${pack.title || 'ভিডিও প্যাক'} | Creator Rivo`;

    const videoId = extractYouTubeId(pack.videoId || '');
    if(videoId){
      document.getElementById('vpdVideoFrame').src = `https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1`;
      document.getElementById('vpdVideoWrap').style.display = 'block';
    } else {
      const bg = itemBg(pack, 0);
      document.getElementById('vpdImage').style.background = pack.imageUrl ? `url('${pack.imageUrl}') center/cover` : bg;
      document.getElementById('vpdImageWrap').style.display = 'block';
    }
    document.getElementById('vpdTitle').textContent = pack.title || '';
    document.getElementById('vpdDescription').textContent = pack.description || '';
    if(!pack.description) document.getElementById('vpdDescription').style.display = 'none';

    // remaining stock অনুযায়ী কেনার মতো সবচেয়ে বড় Tier ডিফল্ট বাছাই করি (ডিফল্ট ৫টি স্টকে না থাকলে)
    const remaining = remainingOf(pack);
    if(remaining < selectedTier.qty){
      selectedTier = [...TIERS].reverse().find(t => remaining >= t.qty) || TIERS[0];
    }
    renderQtyRow();
    renderPriceAndBuy();

    const others = [];
    allSnap.forEach(d=>{ if(d.id !== packId) others.push({ id: d.id, ...d.data() }); });
    renderMoreGrid(others.slice(0, 6));
  }catch(err){
    console.error('video-pack-detail load error:', err);
    document.getElementById('vpdCard').innerHTML = '<p style="padding:24px; color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
  }
}
boot();

document.getElementById('vpdShareBtn').addEventListener('click', async ()=>{
  const shareData = { title: pack ? pack.title : 'ভিডিও প্যাক', url: location.href };
  try{
    if(navigator.share){ await navigator.share(shareData); return; }
  }catch(e){ /* user cancelled or unsupported — fall through to copy */ }
  try{
    await navigator.clipboard.writeText(location.href);
    showToast('লিংক কপি হয়েছে');
  }catch(e){ /* clipboard unavailable */ }
});

/* ---------- Checkout modal (identical flow to the old all-packs listing page) ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
const stepSuccess = document.getElementById('checkoutStepSuccess');
const continueBtn = document.getElementById('checkoutContinueBtn');
const termsCheckbox = document.getElementById('checkoutTerms');
let selectedMethod = null;
let checkoutItem = null; // { pack, qty, price }

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

function openCheckout(p, qty){
  const currentUser = getCurrentUser();
  if(!currentUser){
    window.location.href = 'login.html';
    return;
  }
  const tier = TIERS.find(t => t.qty === qty) || TIERS[0];
  const price = Number(p[tier.key] || 0);
  checkoutItem = { pack: p, qty: tier.qty, price };
  document.getElementById('checkoutItemsLabel').textContent = `${p.title || ''} (${tier.label})`;
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

async function pickStockPool(packId, qty){
  const snap = await getDocs(query(
    collection(db, 'videoStock'),
    where('packId', '==', packId),
    where('status', '==', 'available'),
    limit(qty + 20)
  ));
  const refs = snap.docs.map(d => d.ref);
  for(let i = refs.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [refs[i], refs[j]] = [refs[j], refs[i]];
  }
  return refs;
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
    for(let attempt = 1; ; attempt++){
      const useStock = checkoutItem.pack.system === 'v2';
      const pool = useStock ? await pickStockPool(checkoutItem.pack.id, qty) : [];
      if(useStock && pool.length < qty) throw new Error('out-of-stock');
      try{
        await runTransaction(db, async (tx)=>{
          const uSnap = await tx.get(userRef);
          const packSnap = await tx.get(packRef);
          if(!packSnap.exists()) throw new Error('pack-missing');
          const p = packSnap.data();
          if((p.system === 'v2') !== useStock){
            checkoutItem.pack.system = p.system;
            throw new Error('stock-race');
          }
          const poolSnaps = useStock ? await Promise.all(pool.map(r => tx.get(r))) : [];
          const bal = Number((uSnap.exists() ? uSnap.data().walletBalance : 0) || 0);
          if(bal < total) throw new Error('insufficient-balance');

          if(useStock){
            const free = poolSnaps.filter(s => s.exists() && s.data().status === 'available' && s.data().packId === checkoutItem.pack.id);
            if(free.length < qty) throw new Error('stock-race');
            const picked = free.slice(0, qty);
            deliveredLinks = picked.map(s => s.data().url);
            picked.forEach(s => tx.update(s.ref, {
              status: 'assigned', uid: currentUser.uid, buyerEmail: currentUser.email || '',
              orderId: orderRef.id, assignedAt: serverTimestamp()
            }));
            tx.update(packRef, { assignedCount: increment(qty) });
          } else {
            const links = Array.isArray(p.links) ? p.links : [];
            const assigned = Number(p.assignedCount || 0);
            if(links.length - assigned < qty) throw new Error('out-of-stock');
            deliveredLinks = links.slice(assigned, assigned + qty);
            tx.update(packRef, { assignedCount: assigned + qty });
          }
          tx.update(userRef, { walletBalance: increment(-total) });
          tx.set(orderRef, {
            uid: currentUser.uid, name: currentUser.displayName || '', email: currentUser.email || '',
            items: [currentOrderItem(deliveredLinks)], total, status: 'completed', paymentMethod: 'Wallet', createdAt: serverTimestamp()
          });
          tx.set(txnRef, {
            uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
            orderId: orderRef.id, note: 'ওয়ালেট দিয়ে ভিডিও প্যাক কেনা', createdAt: serverTimestamp()
          });
        });
        break;
      }catch(e){
        if(e && e.message === 'stock-race' && attempt < 4) continue;
        throw e;
      }
    }
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    checkoutItem.pack.assignedCount = Number(checkoutItem.pack.assignedCount || 0) + qty;
    pack.assignedCount = checkoutItem.pack.assignedCount;
    showDeliveredLinks(deliveredLinks);
    renderQtyRow();
    renderPriceAndBuy();
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = err.message === 'insufficient-balance' ? 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।'
      : err.message === 'out-of-stock' ? 'দুঃখিত, এই মুহূর্তে পর্যাপ্ত স্টক নেই।'
      : err.message === 'stock-race' ? 'এই মুহূর্তে অনেকে কিনছেন — আবার চেষ্টা করুন।'
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
