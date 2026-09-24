import {
  db, collection, addDoc, getDocs, doc, getDoc, query, where, serverTimestamp,
  requireAuth, onUserReady, watchProfileLive, getCurrentUser, escapeHtml, renderSkeletonList, showToast
} from '../common.js';

requireAuth();

/* ---------- Wallet balance: cache in localStorage so a refresh shows the
   last known amount instantly instead of flashing ৳0 while auth loads. ---------- */
const WALLET_BALANCE_CACHE_KEY = 'cr_wallet_balance_cache';
function getCachedWalletBalance(){
  try{
    const cached = JSON.parse(localStorage.getItem(WALLET_BALANCE_CACHE_KEY) || 'null');
    return (cached && typeof cached.balance === 'number') ? cached.balance : null;
  }catch(e){ return null; }
}
function cacheWalletBalance(balance){
  try{ localStorage.setItem(WALLET_BALANCE_CACHE_KEY, JSON.stringify({ balance })); }catch(e){ /* ignore */ }
}

/* Render immediately on script load: the cached balance if we have one,
   otherwise a shimmer placeholder (never a bare "৳0"). */
(function renderInitialBalance(){
  const el = document.getElementById('walletBalanceDisplay');
  const cached = getCachedWalletBalance();
  if(cached !== null) el.textContent = '৳' + cached.toLocaleString('en-US');
  else el.innerHTML = '<span class="skeleton-dark skel-amount"></span>';
})();

onUserReady((user)=>{
  if(!user) return;
  loadWalletTransactions();
});

/* Live balance: admin can approve a deposit at any moment while this page
   is open, so listen for changes on the profile doc instead of the
   site-wide cached read (which can lag up to PROFILE_CACHE_TTL behind).
   Also re-loads the transaction list on change so the deposit's status
   pill flips from পেন্ডিং to অনুমোদিত without a manual refresh. */
let firstProfileSnapshot = true;
watchProfileLive((profile)=>{
  const balance = Number(profile?.walletBalance || 0);
  document.getElementById('walletBalanceDisplay').textContent = '৳' + balance.toLocaleString('en-US');
  cacheWalletBalance(balance);
  if(!firstProfileSnapshot) loadWalletTransactions();
  firstProfileSnapshot = false;
});

/* ---------- Payment method chips + merchant number (from admin settings/payment) ----------
   Numbers are cached in localStorage too, so switching methods or refreshing the
   page shows the last known number immediately; a fresh Firestore read then
   quietly confirms/updates it in the background. Only a first-ever visit with
   nothing cached yet falls back to a shimmer placeholder. */
const MERCHANT_NUMBER_FIELD = { bKash:'bkashNumber', Nagad:'nagadNumber', Rocket:'rocketNumber' };
const MERCHANT_NUMBERS_CACHE_KEY = 'cr_merchant_numbers_cache';

function getCachedMerchantNumbers(){
  try{ return JSON.parse(localStorage.getItem(MERCHANT_NUMBERS_CACHE_KEY) || 'null'); }catch(e){ return null; }
}
function cacheMerchantNumbers(numbers){
  try{ localStorage.setItem(MERCHANT_NUMBERS_CACHE_KEY, JSON.stringify(numbers || {})); }catch(e){ /* ignore */ }
}

let merchantNumbersCache = getCachedMerchantNumbers(); // seed from localStorage, may be null
let merchantNumbersFetchPromise = null;
function fetchMerchantNumbers(){
  if(merchantNumbersFetchPromise) return merchantNumbersFetchPromise;
  merchantNumbersFetchPromise = (async ()=>{
    try{
      const snap = await getDoc(doc(db, 'settings', 'payment'));
      const data = snap.exists() ? snap.data() : {};
      merchantNumbersCache = data;
      cacheMerchantNumbers(data);
      return data;
    }catch(err){
      console.error('payment settings fetch error:', err);
      return merchantNumbersCache || {}; // keep showing whatever we had cached
    }
  })();
  return merchantNumbersFetchPromise;
}

const MERCHANT_USSD = { bKash:'*247#', Nagad:'*167#', Rocket:'*322#' };
const MERCHANT_SENDMONEY_LABEL = { bKash:'Send Money/Make Payment', Nagad:'Send Money', Rocket:'Send Money' };
const MERCHANT_BOX_COLOR = { bKash:'#E2136E', Nagad:'#F7941D', Rocket:'#8C3494' };

function renderMerchantNumber(method, numbers){
  const box = document.getElementById('merchantNumberBox');
  const valueEl = document.getElementById('merchantNumberValue');
  const copyBtn = document.getElementById('merchantNumberCopy');
  const field = MERCHANT_NUMBER_FIELD[method];
  if(!field) return;
  box.dataset.method = method;
  copyBtn.textContent = 'কপি';
  copyBtn.classList.remove('copied');
  const number = numbers ? numbers[field] : null;
  if(number){
    valueEl.textContent = number;
    copyBtn.disabled = false;
  }else if(numbers){
    // Settings have actually loaded and this method genuinely has no number set.
    valueEl.textContent = `${method} নম্বর এখনো যোগ করা হয়নি`;
    copyBtn.disabled = true;
  }else{
    // Nothing cached yet (first-ever visit) — shimmer instead of a "লোড হচ্ছে..." label.
    valueEl.innerHTML = '<span class="skeleton-dark skel-merchant-number"></span>';
    copyBtn.disabled = true;
  }
}

function renderMethodInstructions(method){
  const list = document.getElementById('amInstructions');
  const ussd = MERCHANT_USSD[method] || '';
  const sendMoneyLabel = MERCHANT_SENDMONEY_LABEL[method] || 'Send Money';
  list.innerHTML = `
    <li>${ussd} ডায়াল করে আপনার ${method} মোবাইল মেনুতে যান অথবা ${method} অ্যাপে যান।</li>
    <li style="color:#FFEB3B; font-weight:800;">${sendMoneyLabel} - এ ক্লিক করুন।</li>
    <li>প্রাপক নম্বর হিসেবে নিচের এই নম্বরটি লিখুন</li>
  `;
}

function applyMethodColor(method){
  const color = MERCHANT_BOX_COLOR[method] || MERCHANT_BOX_COLOR.bKash;
  document.getElementById('amBox').style.background = color;
  document.getElementById('depositSubmitBtn').style.background = color;
  document.getElementById('depositSubmitBtn').dataset.method = method;
}

async function updateMerchantNumberBox(){
  const method = document.getElementById('depMethod').value;
  applyMethodColor(method);
  renderMethodInstructions(method);
  renderMerchantNumber(method, merchantNumbersCache); // instant, from cache (or shimmer)
  const fresh = await fetchMerchantNumbers();
  if(document.getElementById('depMethod').value === method){
    renderMerchantNumber(method, fresh); // silently confirm/update once Firestore replies
  }
}

/* Payment-method chip row: clicking a chip sets the hidden #depMethod
   input, toggles the .active style, and refreshes the number box. */
document.querySelectorAll('.pm-chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('.pm-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    document.getElementById('depMethod').value = chip.dataset.method;
    updateMerchantNumberBox();
  });
});
updateMerchantNumberBox();

async function copyMerchantNumber(){
  const copyBtn = document.getElementById('merchantNumberCopy');
  if(copyBtn.disabled) return;
  const number = document.getElementById('merchantNumberValue').textContent.trim();
  if(!number) return;
  const markCopied = ()=>{
    showToast('নম্বর কপি হয়েছে!');
    copyBtn.textContent = '✓ কপি হয়েছে';
    copyBtn.classList.add('copied');
    setTimeout(()=>{ copyBtn.textContent = 'কপি'; copyBtn.classList.remove('copied'); }, 1600);
  };
  try{
    await navigator.clipboard.writeText(number);
    markCopied();
  }catch(err){
    const temp = document.createElement('textarea');
    temp.value = number;
    document.body.appendChild(temp);
    temp.select();
    try{ document.execCommand('copy'); markCopied(); }
    catch(e){ showToast('কপি করা যায়নি।'); }
    document.body.removeChild(temp);
  }
}
document.getElementById('merchantNumberBox').addEventListener('click', (e)=>{
  if(e.target.closest('#merchantNumberCopy')) return; // avoid double-firing with the button's own click
  copyMerchantNumber();
});
document.getElementById('merchantNumberCopy').addEventListener('click', copyMerchantNumber);

document.getElementById('depositForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('depositMsg');
  const submitBtn = document.getElementById('depositSubmitBtn');
  const btnText = submitBtn.querySelector('.btn-text');
  const spinner = document.getElementById('depositSpinner');
  const currentUser = getCurrentUser();
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
  msg.textContent = '';
  msg.className = 'form-msg';
  submitBtn.disabled = true;
  btnText.textContent = 'পাঠানো হচ্ছে...';
  spinner.hidden = false;
  try{
    await addDoc(collection(db, 'walletTransactions'), {
      uid: currentUser.uid, type: 'deposit', status: 'pending',
      amount, method, transactionId: txnId, note, createdAt: serverTimestamp()
    });
    e.target.reset();
    document.getElementById('depMethod').value = method;
    updateMerchantNumberBox();
    loadWalletTransactions();
    document.getElementById('depositOverlay').style.display = 'none';
    document.getElementById('depositSuccessOverlay').style.display = 'flex';
  }catch(err){
    msg.textContent = 'পাঠানো যায়নি, আবার চেষ্টা করুন।';
    msg.className = 'form-msg err';
    console.error('deposit request error:', err);
  }finally{
    submitBtn.disabled = false;
    btnText.textContent = 'VERIFY';
    spinner.hidden = true;
  }
});

function closeDepositSuccessOverlay(){
  document.getElementById('depositSuccessOverlay').style.display = 'none';
}
document.getElementById('depositSuccessOkBtn').addEventListener('click', closeDepositSuccessOverlay);
document.getElementById('depositSuccessOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'depositSuccessOverlay') closeDepositSuccessOverlay();
});

/* ---------- Deposit modal open/close ---------- */
document.getElementById('openDepositBtn').addEventListener('click', ()=>{
  document.getElementById('depositOverlay').style.display = 'flex';
});
document.getElementById('depositCloseBtn').addEventListener('click', ()=>{
  document.getElementById('depositOverlay').style.display = 'none';
});
document.getElementById('depositOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'depositOverlay') document.getElementById('depositOverlay').style.display = 'none';
});

const txnTypeLabel = { deposit:'ডিপোজিট', purchase:'কেনাকাটা', refund:'রিফান্ড' };
const txnStatusLabel = { pending:'পেন্ডিং', approved:'অনুমোদিত', rejected:'বাতিল', completed:'সম্পন্ন' };
const txnIconSvg = {
  deposit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13m0 0-4.5-4.5M12 17l4.5-4.5"/><path d="M4 20h16"/></svg>',
  purchase: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12.5a1 1 0 0 1-1 1.5H6a1 1 0 0 1-1-1.5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  refund: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>'
};

async function loadWalletTransactions(){
  const currentUser = getCurrentUser();
  const wrap = document.getElementById('walletTxnList');
  if(!currentUser || !wrap) return;
  renderSkeletonList('walletTxnList', 3);
  try{
    const q = query(collection(db, 'walletTransactions'), where('uid', '==', currentUser.uid));
    const snap = await getDocs(q);
    const txns = [];
    snap.forEach(d => txns.push({ id: d.id, ...d.data() }));
    txns.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if(txns.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো লেনদেন নেই।</p>';
      return;
    }
    wrap.innerHTML = txns.map(t=>{
      const isCredit = t.type === 'deposit' || t.type === 'refund';
      const sign = isCredit ? '+' : '−';
      const dateStr = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('bn-BD') : '';
      return `
        <div class="txn-row">
          <span class="txn-icon ${t.type || ''}">${txnIconSvg[t.type] || ''}</span>
          <div class="txn-info">
            <strong>${txnTypeLabel[t.type] || t.type}</strong>
            <div class="txn-meta">
              <span>${dateStr}${t.method ? ' · ' + escapeHtml(t.method) : ''}</span>
              <span class="txn-status-pill ${t.status || ''}">${txnStatusLabel[t.status] || t.status}</span>
            </div>
          </div>
          <span class="txn-amt ${isCredit ? 'credit' : 'debit'}">${sign}৳${Number(t.amount || 0).toLocaleString('en-US')}</span>
        </div>
      `;
    }).join('');
  }catch(err){
    wrap.innerHTML = '<p style="color:var(--coral);">লেনদেন লোড করা যায়নি।</p>';
    console.error('loadWalletTransactions error:', err);
  }
}
