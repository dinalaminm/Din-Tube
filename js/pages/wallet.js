import {
  db, collection, addDoc, getDocs, doc, getDoc, query, where, serverTimestamp,
  requireAuth, onUserReady, getCurrentUser, escapeHtml, renderSkeletonList, showToast
} from '../common.js';

requireAuth();

onUserReady((user, profile)=>{
  if(!user) return;
  document.getElementById('walletBalanceDisplay').textContent = '৳' + Number(profile?.walletBalance || 0).toLocaleString('en-US');
  loadWalletTransactions();
});

/* ---------- Payment method chips + merchant number (from admin settings/payment) ---------- */
const MERCHANT_NUMBER_FIELD = { bKash:'bkashNumber', Nagad:'nagadNumber', Rocket:'rocketNumber' };
const MERCHANT_ICON_TEXT = { bKash:'bK', Nagad:'N', Rocket:'R' };
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

async function updateMerchantNumberBox(){
  const method = document.getElementById('depMethod').value;
  const box = document.getElementById('merchantNumberBox');
  const icon = document.getElementById('merchantNumberIcon');
  const label = document.getElementById('merchantNumberLabel');
  const valueEl = document.getElementById('merchantNumberValue');
  const hint = document.getElementById('merchantNumberHint');
  const copyBtn = document.getElementById('merchantNumberCopy');
  const field = MERCHANT_NUMBER_FIELD[method];
  if(!field){ box.style.display = 'none'; return; }
  box.style.display = 'flex';
  box.dataset.method = method;
  icon.textContent = MERCHANT_ICON_TEXT[method] || method[0];
  label.textContent = method + ' নম্বর';
  valueEl.textContent = 'লোড হচ্ছে...';
  valueEl.className = 'merchant-number-value muted';
  hint.textContent = '';
  copyBtn.disabled = true;
  copyBtn.textContent = 'কপি';
  copyBtn.classList.remove('copied');
  const numbers = await getMerchantNumbers();
  const number = numbers[field];
  if(number){
    valueEl.textContent = number;
    valueEl.className = 'merchant-number-value';
    hint.textContent = 'ট্যাপ করে কপি করুন';
    copyBtn.disabled = false;
  }else{
    valueEl.textContent = `${method} নম্বর এখনো যোগ করা হয়নি`;
    valueEl.className = 'merchant-number-value muted';
    hint.textContent = 'অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন';
    copyBtn.disabled = true;
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
