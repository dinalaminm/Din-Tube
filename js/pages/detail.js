import {
  db, doc, getDoc, collection, getDocs, addDoc, serverTimestamp, increment, runTransaction,
  extractYouTubeId, itemLabel, renderCard,
  onUserReady, getOwnedItemIds, getCurrentUser, getCurrentProfile, syncProfileCache, showToast
} from '../common.js';

const params = new URLSearchParams(window.location.search);
const type = params.get('type');
const id = params.get('id');

const COLLECTION_BY_TYPE = { courses:'courses', products:'products', software:'software', videos:'videos' };

/* ---------- Physical products: delivery-details order flow ---------- */
const DELIVERY_COUNTRIES = ['Bangladesh'];              // এখানে দেশ যোগ করলেই ড্রপডাউনে আসবে
const DEFAULT_DELIVERY_DAYS = { inside: 5, outside: 10 }; // প্রোডাক্টে দিন সেট না থাকলে এটা দেখাবে
let pendingDelivery = null; // { country, phone, address } — Buy Now চাপার পর চেকআউটে যায়

// productType সেট থাকলে সেটাই; না থাকলে ডাউনলোড লিংক ছাড়া প্রোডাক্ট = ফিজিক্যাল
function isPhysicalProduct(item){
  if(type !== 'products') return false;
  if(item.productType) return item.productType === 'physical';
  return !item.downloadUrl;
}

function normalizeBdPhone(raw){
  let d = String(raw || '').replace(/\D/g, '');
  if(d.length === 13 && d.startsWith('8801')) d = d.slice(2);
  return d;
}

function readDeliveryForm(){
  const country = document.getElementById('delCountry').value;
  const phoneRaw = document.getElementById('delPhone').value.trim();
  const address = document.getElementById('delAddress').value.trim();
  if(!country) return { ok:false, field:'delCountry', message:'Please select your country.' };
  const phone = country === 'Bangladesh' ? normalizeBdPhone(phoneRaw) : phoneRaw.replace(/[^\d+]/g, '');
  if(country === 'Bangladesh' ? !/^01[3-9]\d{8}$/.test(phone) : phone.replace(/\D/g, '').length < 7){
    return { ok:false, field:'delPhone', message:'Please enter a valid contact number (01XXXXXXXXX).' };
  }
  if(address.length < 10) return { ok:false, field:'delAddress', message:'Please enter your full delivery address.' };
  return { ok:true, data:{ country, phone, address } };
}

function setupPhysicalUI(item){
  document.body.classList.add('pz-page');
  document.getElementById('detailCard').classList.add('pz-card');

  // Physical Product / N in stock badges
  const stock = typeof item.stock === 'number' ? item.stock : null;
  const badges = document.getElementById('detailBadges');
  let html = '<span class="pz-badge pz-physical">Physical Product</span>';
  if(stock !== null) html += stock > 0
    ? `<span class="pz-badge pz-stock">${stock} in stock</span>`
    : '<span class="pz-badge pz-out">Out of stock</span>';
  badges.innerHTML = html;
  badges.style.display = 'flex';

  // 50% OFF · Save ৳400
  const price = Number(item.price || 0), old = Number(item.oldPrice || 0);
  const badgeEl = document.getElementById('detailDiscountBadge');
  if(old > price){
    badgeEl.textContent = `${Math.round((old - price) / old * 100)}% OFF · Save ৳${(old - price).toLocaleString('en-US')}`;
    badgeEl.style.display = 'inline-block';
  } else {
    badgeEl.style.display = 'none';
  }

  // Delivery details card
  const inside = Number(item.deliveryInside) > 0 ? Number(item.deliveryInside) : DEFAULT_DELIVERY_DAYS.inside;
  const outside = Number(item.deliveryOutside) > 0 ? Number(item.deliveryOutside) : DEFAULT_DELIVERY_DAYS.outside;
  document.getElementById('deliveryEstimate').innerHTML =
    `Estimated delivery: <strong>Inside Dhaka — ${inside} days; Outside Dhaka — ${outside} days</strong>.`;
  const countrySel = document.getElementById('delCountry');
  if(!countrySel.options.length){
    countrySel.innerHTML = DELIVERY_COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  document.getElementById('deliveryError').textContent = '';
  document.getElementById('deliveryCard').style.display = 'block';

  // Related Product + View All
  document.getElementById('detailMoreHeading').innerHTML = 'Related <em>Product</em>';
  document.getElementById('detailViewAll').style.display = 'block';
}

function resetPhysicalUI(){
  document.body.classList.remove('pz-page');
  document.getElementById('detailCard').classList.remove('pz-card');
  document.getElementById('detailBadges').style.display = 'none';
  document.getElementById('deliveryCard').style.display = 'none';
  document.getElementById('detailViewAll').style.display = 'none';
  const buyNow = document.getElementById('detailBuyNowBtn');
  buyNow.className = 'btn-buynow';
}

function showDetailSkeleton(){
  const imageWrap = document.getElementById('detailImageWrap');
  if(imageWrap){
    imageWrap.style.display = 'block';
    imageWrap.innerHTML = '<div class="skeleton" style="aspect-ratio:4/3; border-radius:16px;"></div>';
  }
  document.getElementById('detailTitle').innerHTML = '<span class="skeleton skel-detail-line w-80" style="display:inline-block;"></span>';
  document.getElementById('detailDesc').innerHTML = '<span class="skeleton skel-detail-line w-100" style="display:block;"></span><span class="skeleton skel-detail-line w-50" style="display:block;"></span>';
  document.getElementById('detailPriceNow').innerHTML = '<span class="skeleton skel-detail-line w-30" style="display:inline-block;"></span>';
  // The buy button(s) have no text yet at this point and would otherwise show
  // as a bare solid-color bar during the shimmer — hide them until boot()
  // fills in the real label and picks which one to show.
  document.getElementById('detailBuyBtn').style.display = 'none';
  document.getElementById('detailBuyNowBtn').style.display = 'none';
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

  const isPhysical = isPhysicalProduct(item);
  if(isPhysical) setupPhysicalUI(item); else resetPhysicalUI();

  const buyBtn = document.getElementById('detailBuyBtn');
  const buyNowBtn = document.getElementById('detailBuyNowBtn');
  buyBtn.disabled = false;
  buyBtn.style.opacity = '1';
  if(isPhysical){
    // ফিজিক্যাল প্রোডাক্ট: ডেলিভারির তথ্য নিয়ে অর্ডার — "owned" ধারণা এখানে নেই, আবার অর্ডার করা যায়
    const soldOut = typeof item.stock === 'number' && item.stock <= 0;
    buyBtn.style.display = 'none';
    buyNowBtn.className = 'pz-buy';
    buyNowBtn.style.cssText = 'display:flex;';
    buyNowBtn.textContent = soldOut ? 'Out of Stock' : 'Buy Now';
    buyNowBtn.disabled = soldOut;
    buyNowBtn.onclick = soldOut ? null : ()=>{
      if(!getCurrentUser()){ window.location.href = 'login.html'; return; }
      const res = readDeliveryForm();
      const errEl = document.getElementById('deliveryError');
      if(!res.ok){
        errEl.textContent = res.message;
        const f = document.getElementById(res.field);
        if(f){ f.focus(); f.scrollIntoView({ behavior:'smooth', block:'center' }); }
        return;
      }
      errEl.textContent = '';
      pendingDelivery = res.data;
      openCheckout(item, 'products');
    };
  } else if((type === 'products' || type === 'software' || type === 'courses') && item.downloadUrl && owned){
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
    // Not owned yet. Courses/videos/software still go through the in-app
    // payment-method modal (wallet or manual bKash/Nagad/Rocket). Products are
    // "contact to buy" only — price is shown for reference, but clicking the
    // button just opens WhatsApp with the item pre-filled; nothing is charged
    // and no order is created in Firestore.
    buyBtn.style.display = 'none';
    buyNowBtn.style.display = 'flex';
    const label = type === 'courses' ? 'কোর্সে ভর্তি হন' : (type === 'products' ? 'কিনুন' : 'এখনই কিনুন');
    buyNowBtn.innerHTML = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></svg><span>${label}</span>`;
    buyNowBtn.onclick = type === 'products' ? ()=> redirectToWhatsAppBuy(item) : ()=> openCheckout(item, type);
  }

  const labelMap = { courses:'কোর্স', products:'প্রোডাক্ট', software:'সফটওয়্যার', videos:'ভিডিও' };
  if(!isPhysical){
    document.getElementById('detailMoreHeading').innerHTML = 'আরও <em id="detailMoreLabel">' + (labelMap[type] || '') + '</em>';
  }
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

/* ---------- Products: "contact to buy" via WhatsApp (no payment in-app) ---------- */
let whatsappUrlCache = null;
async function redirectToWhatsAppBuy(item){
  if(!getCurrentUser()){
    window.location.href = 'login.html';
    return;
  }
  if(whatsappUrlCache === null){
    try{
      const snap = await getDoc(doc(db, 'settings', 'social'));
      whatsappUrlCache = snap.exists() ? (snap.data().whatsapp || '') : '';
    }catch(err){
      console.error('whatsapp settings fetch error:', err);
      whatsappUrlCache = '';
    }
  }
  if(!whatsappUrlCache){
    showToast('হোয়াটসঅ্যাপ নম্বর সেট করা নেই — সাপোর্টে যোগাযোগ করুন।');
    return;
  }
  const price = '৳' + Number(item.price || 0).toLocaleString('en-US');
  const text = `আমি "${itemLabel('products', item)}" (${price}) প্রোডাক্টটি কিনতে চাই।`;
  const sep = whatsappUrlCache.includes('?') ? '&' : '?';
  window.open(whatsappUrlCache + sep + 'text=' + encodeURIComponent(text), '_blank');
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

/* ফিজিক্যাল প্রোডাক্ট অর্ডার = ডেলিভারি তথ্য আছে + স্টক ট্র্যাক করা থাকলে অর্ডারের সময়ই ১টা কমে */
function isPhysicalOrder(){
  return checkoutType === 'products' && !!checkoutItem && isPhysicalProduct(checkoutItem) && !!pendingDelivery;
}

// transaction-এর ভেতরে: স্টক ট্র্যাক করা থাকলে যাচাই করে ১ কমায় (পড়া আগে, লেখা পরে — তাই productSnap আগে নিতে হয়)
function reserveStock(tx, productRef, productSnap, items){
  if(!productSnap.exists()) throw new Error('product-missing');
  const st = productSnap.data().stock;
  if(typeof st === 'number'){
    if(st < 1) throw new Error('out-of-stock');
    tx.update(productRef, { stock: increment(-1) });
    items[0].stockReserved = true;
  }
}

function currentOrderItems(){
  const item = { id: checkoutItem.id || null, type: checkoutType || null, name: itemLabel(checkoutType, checkoutItem), price: Number(checkoutItem.price || 0), qty: 1 };
  if(isPhysicalOrder()) item.physical = true;
  // Stamp the download link onto the order item right away for products/software/courses —
  // the instant-wallet path marks the order 'completed' immediately (no admin
  // approval step), so this is the only chance to capture it for "আমার ডাউনলোড".
  if((checkoutType === 'products' || checkoutType === 'software' || checkoutType === 'courses') && checkoutItem.downloadUrl){
    item.downloadUrl = checkoutItem.downloadUrl;
  }
  return [item];
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
  const physical = isPhysicalOrder();
  const productRef = physical ? doc(db, 'products', checkoutItem.id) : null;
  const userRef = doc(db, 'users', currentUser.uid);
  const orderRef = doc(collection(db, 'orders'));
  const txnRef = doc(collection(db, 'walletTransactions'));
  try{
    await runTransaction(db, async (tx)=>{
      const uSnap = await tx.get(userRef);
      const pSnap = physical ? await tx.get(productRef) : null;
      const bal = Number((uSnap.exists() ? uSnap.data().walletBalance : 0) || 0);
      if(bal < total) throw new Error('insufficient-balance');
      if(physical) reserveStock(tx, productRef, pSnap, items);
      tx.update(userRef, { walletBalance: increment(-total) });
      tx.set(orderRef, {
        uid: currentUser.uid, name: currentUser.displayName || '', email: currentUser.email || '',
        items, total,
        // ফিজিক্যাল অর্ডার: টাকা পরিশোধ হয়েছে ('paid'), পণ্য পৌঁছালে অ্যাডমিন 'সম্পন্ন' করবে
        status: physical ? 'paid' : 'completed',
        paymentMethod: 'Wallet', createdAt: serverTimestamp(),
        ...(physical ? { delivery: pendingDelivery } : {})
      });
      tx.set(txnRef, {
        uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে অর্ডার পরিশোধ', createdAt: serverTimestamp()
      });
    });
    if(profile){ profile.walletBalance = Number(profile.walletBalance || 0) - total; syncProfileCache(); }
    overlay.style.display = 'none';
    showToast(physical ? 'অর্ডার সফল হয়েছে! আপনার ঠিকানায় ডেলিভারি দেওয়া হবে।' : 'পেমেন্ট সফল হয়েছে! অ্যাক্সেস এখনই আনলক হয়ে গেছে।');
    boot();
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = err.message === 'insufficient-balance' ? 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।'
      : err.message === 'out-of-stock' ? 'দুঃখিত, প্রোডাক্টটির স্টক শেষ হয়ে গেছে।'
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
  const total = Number(checkoutItem.price || 0);
  const btn = document.getElementById('manualSubmitBtn');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
  try{
    const items = currentOrderItems();
    const physical = isPhysicalOrder();
    const orderData = {
      uid: currentUser.uid,
      name: currentUser.displayName || '',
      email: currentUser.email || '',
      items,
      total,
      status: 'pending',
      paymentMethod: selectedMethod,
      transactionId: txnId,
      createdAt: serverTimestamp()
    };
    if(physical){
      orderData.delivery = pendingDelivery;
      const productRef = doc(db, 'products', checkoutItem.id);
      const orderRef = doc(collection(db, 'orders'));
      await runTransaction(db, async (tx)=>{
        const pSnap = await tx.get(productRef);
        reserveStock(tx, productRef, pSnap, items);
        tx.set(orderRef, orderData);
      });
    } else {
      await addDoc(collection(db, 'orders'), orderData);
    }
    overlay.style.display = 'none';
    showToast(physical
      ? 'অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে ডেলিভারির ব্যবস্থা করা হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।'
      : 'অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে অ্যাক্সেস আনলক হবে — "আমার অর্ডার"-এ পেন্ডিং হিসেবে দেখা যাবে।');
    if(physical) boot();
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = err.message === 'out-of-stock' ? 'দুঃখিত, প্রোডাক্টটির স্টক শেষ হয়ে গেছে।' : 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});

boot();
