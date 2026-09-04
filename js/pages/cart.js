import {
  db, doc, getDoc, collection, addDoc, serverTimestamp, increment, runTransaction,
  getCart, saveCart, onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache, showToast
} from '../common.js';

function renderCart(){
  const cart = getCart();
  const wrap = document.getElementById('cartItemsWrap');
  const emptyMsg = document.getElementById('cartEmptyMsg');
  const totalRow = document.getElementById('cartTotalRow');
  const openCheckoutBtn = document.getElementById('openCheckoutBtn');
  wrap.innerHTML = '';
  if(cart.length === 0){
    emptyMsg.style.display = 'block';
    totalRow.style.display = 'none';
    openCheckoutBtn.style.display = 'none';
    return;
  }
  emptyMsg.style.display = 'none';
  let total = 0;
  cart.forEach((item, idx)=>{
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
  openCheckoutBtn.style.display = 'block';
  wrap.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = +btn.dataset.idx;
      const act = btn.dataset.act;
      const c = getCart();
      if(act === 'inc') c[idx].qty += 1;
      if(act === 'dec'){ c[idx].qty -= 1; if(c[idx].qty <= 0) c.splice(idx,1); }
      if(act === 'remove') c.splice(idx,1);
      saveCart(c);
      renderCart();
    });
  });
}
renderCart();
onUserReady(()=> renderCart());

/* If we arrived here via a detail page's "এখনই কিনুন" (Buy Now) button
   (cart.html?checkout=1), skip straight to the checkout modal instead of
   making the person tap "চেকআউট করুন" again. */
if(new URLSearchParams(window.location.search).get('checkout') === '1'){
  onUserReady(()=>{
    if(getCart().length > 0) document.getElementById('openCheckoutBtn').click();
  });
}

/* ---------- Checkout modal ---------- */
const overlay = document.getElementById('checkoutOverlay');
const stepMethod = document.getElementById('checkoutStepMethod');
const stepManual = document.getElementById('checkoutStepManual');
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
  document.getElementById('checkoutStepMsg').textContent = '';
  document.getElementById('manualPayMsg').textContent = '';
  document.getElementById('manualTxnId').value = '';
}

function updateContinueState(){
  const enabled = !!selectedMethod && termsCheckbox.checked;
  continueBtn.disabled = !enabled;
  continueBtn.style.opacity = enabled ? '1' : '0.5';
}

document.getElementById('openCheckoutBtn').addEventListener('click', ()=>{
  const currentUser = getCurrentUser();
  if(!currentUser){
    document.getElementById('checkoutMsg').className = 'form-msg err';
    document.getElementById('checkoutMsg').textContent = 'চেকআউট করতে আগে লগ ইন করুন।';
    setTimeout(()=> window.location.href = 'login.html', 900);
    return;
  }
  const cart = getCart();
  const total = cart.reduce((s,c)=> s + c.price * c.qty, 0);
  const itemCount = cart.reduce((s,c)=> s + c.qty, 0);
  document.getElementById('checkoutItemsLabel').textContent = itemCount + 'টা আইটেম';
  document.getElementById('checkoutTotalLabel').textContent = '৳' + total.toLocaleString('en-US');
  const profile = getCurrentProfile();
  document.getElementById('pmWalletBalance').textContent = 'ব্যালেন্স: ৳' + Number(profile?.walletBalance || 0).toLocaleString('en-US');
  resetCheckoutModal();
  overlay.style.display = 'flex';
});

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

async function payWithWallet(){
  const msg = document.getElementById('checkoutStepMsg');
  const currentUser = getCurrentUser();
  const profile = getCurrentProfile();
  const cart = getCart();
  const total = cart.reduce((s,c)=> s + c.price * c.qty, 0);
  if(total > Number(profile?.walletBalance || 0)){
    msg.className = 'form-msg err';
    msg.textContent = 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। আগে ডিপোজিট করুন।';
    return;
  }
  msg.className = 'form-msg';
  msg.textContent = 'পেমেন্ট প্রসেস হচ্ছে...';
  continueBtn.disabled = true;
  const items = cart.map(c => ({ id: c.id || null, type: c.type || null, name: c.name, price: c.price, qty: c.qty }));
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
    saveCart([]);
    renderCart();
    overlay.style.display = 'none';
    showToast('পেমেন্ট সফল হয়েছে! অ্যাক্সেস এখনই আনলক হয়ে গেছে।');
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
  const cart = getCart();
  const total = cart.reduce((s,c)=> s + c.price * c.qty, 0);
  const btn = document.getElementById('manualSubmitBtn');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'অর্ডার প্রসেস হচ্ছে...';
  try{
    await addDoc(collection(db, 'orders'), {
      uid: currentUser.uid,
      name: currentUser.displayName || '',
      email: currentUser.email || '',
      items: cart.map(c => ({ id: c.id || null, type: c.type || null, name: c.name, price: c.price, qty: c.qty })),
      total,
      status: 'pending',
      paymentMethod: selectedMethod,
      transactionId: txnId,
      createdAt: serverTimestamp()
    });
    saveCart([]);
    renderCart();
    overlay.style.display = 'none';
    showToast('অর্ডার পাঠানো হয়েছে! পেমেন্ট ভেরিফাই হলে অ্যাক্সেস আনলক হবে।');
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('manual order create error:', err);
  }finally{
    btn.disabled = false;
  }
});
