import {
  db, doc, getDoc, collection, getDocs, addDoc, serverTimestamp, increment, runTransaction,
  extractYouTubeId, itemLabel, renderCard,
  onUserReady, getOwnedItemIds, getCurrentUser, getCurrentProfile, syncProfileCache, showToast
} from '../common.js';

const params = new URLSearchParams(window.location.search);
const type = params.get('type');
const id = params.get('id');

const COLLECTION_BY_TYPE = { courses:'courses', products:'products', software:'software', videos:'videos' };

function showDetailSkeleton(){
  const imageWrap = document.getElementById('detailImageWrap');
  if(imageWrap){
    imageWrap.style.display = 'block';
    imageWrap.innerHTML = '<div class="skeleton" style="aspect-ratio:4/3; border-radius:16px;"></div>';
  }
  document.getElementById('detailTitle').innerHTML = '<span class="skeleton skel-detail-line w-80" style="display:inline-block;"></span>';
  document.getElementById('detailDesc').innerHTML = '<span class="skeleton skel-detail-line w-100" style="display:block;"></span><span class="skeleton skel-detail-line w-50" style="display:block;"></span>';
  document.getElementById('detailPriceNow').innerHTML = '<span class="skeleton skel-detail-line w-30" style="display:inline-block;"></span>';
}
function clearDetailImageSkeleton(){
  const imageWrap = document.getElementById('detailImageWrap');
  if(imageWrap) imageWrap.innerHTML = '<div id="detailImage" style="aspect-ratio:4/3; border-radius:16px; background-size:cover; background-position:center;"></div>';
}

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

async function boot(){
  if(!type || !id || !COLLECTION_BY_TYPE[type]){
    document.getElementById('detailTitle').textContent = 'পাওয়া যায়নি';
    document.getElementById('detailDesc').textContent = 'এই আইটেমটি খুঁজে পাওয়া যায়নি। হোমপেজে ফিরে যান।';
    return;
  }

  showDetailSkeleton();

  let item;
  try{
    const snap = await getDoc(doc(db, COLLECTION_BY_TYPE[type], id));
    if(!snap.exists()){
      clearDetailImageSkeleton();
      document.getElementById('detailImageWrap').style.display = 'none';
      document.getElementById('detailTitle').textContent = 'পাওয়া যায়নি';
      document.getElementById('detailDesc').textContent = 'এই আইটেমটি এখন আর নেই।';
      return;
    }
    item = { id: snap.id, ...snap.data() };
  }catch(err){
    console.error('detail fetch error:', err);
    clearDetailImageSkeleton();
    document.getElementById('detailImageWrap').style.display = 'none';
    document.getElementById('detailTitle').textContent = 'লোড করা যায়নি';
    document.getElementById('detailDesc').textContent = 'Firestore রুলস/কানেকশন চেক করুন।';
    return;
  }

  onUserReady(async (user)=>{
    let owned = Number(item.price || 0) <= 0;
    if(user && !owned){
      const ownedIds = await getOwnedItemIds(user.uid);
      owned = ownedIds.has(item.id);
    }
    renderDetail(item, owned);
  });
}

function renderDetail(item, owned){
  clearDetailImageSkeleton();
  const videoWrap = document.getElementById('detailVideoWrap');
  const videoFrame = document.getElementById('detailVideoFrame');
  const imageWrap = document.getElementById('detailImageWrap');
  const imageEl = document.getElementById('detailImage');
  const lockedWrap = document.getElementById('detailLockedWrap');

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

  document.title = itemLabel(type, item) + ' | Creator Rivo';
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
  const buyNowBtn = document.getElementById('detailBuyNowBtn');
  buyBtn.disabled = false;
  buyBtn.style.opacity = '1';
  if((type === 'products' || type === 'software') && item.downloadUrl && owned){
    buyBtn.style.display = 'block';
    buyNowBtn.style.display = 'none';
    buyBtn.textContent = 'ডাউনলোড করুন';
    buyBtn.onclick = ()=> window.open(item.downloadUrl, '_blank');
  } else if(type === 'videos' && owned){
    buyBtn.style.display = 'block';
    buyNowBtn.style.display = 'none';
    buyBtn.textContent = 'কেনা হয়ে গেছে ✓';
    buyBtn.onclick = null;
    buyBtn.disabled = true;
    buyBtn.style.opacity = '0.6';
  } else {
    // Not owned yet — a single, prominent "Buy Now" action that opens the
    // payment-method modal right here on the page (no cart involved). A
    // submitted order goes straight into Firestore with status 'pending'
    // (or 'completed' for instant wallet payment).
    buyBtn.style.display = 'none';
    buyNowBtn.style.display = 'flex';
    const label = type === 'courses' ? 'কোর্সে ভর্তি হন' : (type === 'videos' ? 'এখনই কিনুন' : 'এখনই কিনুন');
    buyNowBtn.innerHTML = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></svg><span>${label}</span>`;
    buyNowBtn.onclick = ()=> openCheckout(item, type);
  }

  const labelMap = { courses:'কোর্স', products:'প্রোডাক্ট', software:'সফটওয়্যার', videos:'ভিডিও' };
  document.getElementById('detailMoreLabel').textContent = labelMap[type] || '';
  loadRelated(item);
}

async function loadRelated(item){
  const relatedWrap = document.getElementById('detailRelated');
  relatedWrap.innerHTML = '';
  try{
    const snap = await getDocs(collection(db, COLLECTION_BY_TYPE[type]));
    const pool = [];
    snap.forEach(d => { if(d.id !== item.id) pool.push({ id: d.id, ...d.data() }); });
    pool.slice(0, 4).forEach((relItem, i)=> relatedWrap.appendChild(renderCard(type, relItem, i)));
  }catch(err){ console.error('related items error:', err); }
}

/* ---------- Buy-now checkout modal (single item, no cart involved) ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
const continueBtn = document.getElementById('checkoutContinueBtn');
const termsCheckbox = document.getElementById('checkoutTerms');
let selectedMethod = null;
let checkoutItem = null;
let checkoutType = null;

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

function openCheckout(item, type){
  const currentUser = getCurrentUser();
  if(!currentUser){
    window.location.href = 'login.html';
    return;
  }
  checkoutItem = item;
  checkoutType = type;
  const total = Number(item.price || 0);
  document.getElementById('checkoutItemsLabel').textContent = itemLabel(type, item);
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
  return [{ id: checkoutItem.id || null, type: checkoutType || null, name: itemLabel(checkoutType, checkoutItem), price: Number(checkoutItem.price || 0), qty: 1 }];
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
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে অর্ডার পরিশোধ', createdAt: serverTimestamp()
      });
    });
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    overlay.style.display = 'none';
    showToast('পেমেন্ট সফল হয়েছে! অ্যাক্সেস এখনই আনলক হয়ে গেছে।');
    boot();
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
    showToast('অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে অ্যাক্সেস আনলক হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।');
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});

boot();
