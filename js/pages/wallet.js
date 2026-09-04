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

/* ---------- Merchant number (from admin settings/payment) ---------- */
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

async function updateMerchantNumberBox(){
  const method = document.getElementById('depMethod').value;
  const box = document.getElementById('merchantNumberBox');
  const label = document.getElementById('merchantNumberLabel');
  const valueEl = document.getElementById('merchantNumberValue');
  const copyBtn = document.getElementById('merchantNumberCopy');
  const field = MERCHANT_NUMBER_FIELD[method];
  if(!field){ box.style.display = 'none'; return; }
  box.style.display = 'block';
  label.textContent = method + ' নম্বর';
  valueEl.textContent = 'লোড হচ্ছে...';
  valueEl.className = 'merchant-number-value muted';
  copyBtn.disabled = true;
  const numbers = await getMerchantNumbers();
  const number = numbers[field];
  if(number){
    valueEl.textContent = number;
    valueEl.className = 'merchant-number-value';
    copyBtn.disabled = false;
  }else{
    valueEl.textContent = `${method} নম্বর এখনো যোগ করা হয়নি`;
    valueEl.className = 'merchant-number-value muted';
    copyBtn.disabled = true;
  }
}

document.getElementById('depMethod').addEventListener('change', updateMerchantNumberBox);
updateMerchantNumberBox();

document.getElementById('merchantNumberCopy').addEventListener('click', async ()=>{
  const number = document.getElementById('merchantNumberValue').textContent.trim();
  if(!number) return;
  try{
    await navigator.clipboard.writeText(number);
    showToast('নম্বর কপি হয়েছে!');
  }catch(err){
    const temp = document.createElement('textarea');
    temp.value = number;
    document.body.appendChild(temp);
    temp.select();
    try{ document.execCommand('copy'); showToast('নম্বর কপি হয়েছে!'); }
    catch(e){ showToast('কপি করা যায়নি।'); }
    document.body.removeChild(temp);
  }
});

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
          <div>
            <strong>${txnTypeLabel[t.type] || t.type}</strong>
            <div style="color:var(--muted); font-size:0.78rem; margin-top:2px;">${dateStr} · ${txnStatusLabel[t.status] || t.status}${t.method ? ' · ' + escapeHtml(t.method) : ''}</div>
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
