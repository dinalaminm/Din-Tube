import {
  db, collection, addDoc, doc, serverTimestamp, increment, runTransaction,
  getCart, saveCart, onUserReady, getCurrentUser, getCurrentProfile
} from '../common.js';

function renderCart(){
  const cart = getCart();
  const wrap = document.getElementById('cartItemsWrap');
  const emptyMsg = document.getElementById('cartEmptyMsg');
  const totalRow = document.getElementById('cartTotalRow');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const walletPayBtn = document.getElementById('walletPayBtn');
  wrap.innerHTML = '';
  if(cart.length === 0){
    emptyMsg.style.display = 'block';
    totalRow.style.display = 'none';
    checkoutBtn.style.display = 'none';
    walletPayBtn.style.display = 'none';
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
  checkoutBtn.style.display = 'block';
  walletPayBtn.style.display = 'block';
  const profile = getCurrentProfile();
  walletPayBtn.textContent = '👛 ওয়ালেট দিয়ে পরিশোধ করুন (ব্যালেন্স: ৳' + Number(profile?.walletBalance || 0).toLocaleString('en-US') + ')';
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

document.getElementById('checkoutBtn').addEventListener('click', async ()=>{
  const cart = getCart();
  if(cart.length === 0) return;
  const msg = document.getElementById('checkoutMsg');
  const currentUser = getCurrentUser();
  if(!currentUser){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করতে আগে লগ ইন করুন।';
    setTimeout(()=> window.location.href = 'login.html', 900);
    return;
  }
  const total = cart.reduce((s,c)=> s + c.price * c.qty, 0);
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
      createdAt: serverTimestamp()
    });
    saveCart([]);
    renderCart();
    msg.className = 'form-msg ok';
    msg.textContent = 'অর্ডার সফলভাবে সম্পন্ন হয়েছে, ধন্যবাদ! পেমেন্ট নিশ্চিত হলে অ্যাক্সেস আনলক হবে।';
    setTimeout(()=>{ msg.textContent=''; }, 5000);
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করা যায়নি, আবার চেষ্টা করুন।';
    console.error('order create error:', err);
  }
});

document.getElementById('walletPayBtn').addEventListener('click', async ()=>{
  const cart = getCart();
  if(cart.length === 0) return;
  const msg = document.getElementById('checkoutMsg');
  const currentUser = getCurrentUser();
  const profile = getCurrentProfile();
  if(!currentUser){
    msg.className = 'form-msg err';
    msg.textContent = 'অর্ডার করতে আগে লগ ইন করুন।';
    setTimeout(()=> window.location.href = 'login.html', 900);
    return;
  }
  const total = cart.reduce((s,c)=> s + c.price * c.qty, 0);
  if(total > Number(profile?.walletBalance || 0)){
    msg.className = 'form-msg err';
    msg.textContent = 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। আগে ডিপোজিট করুন।';
    return;
  }
  msg.className = 'form-msg';
  msg.textContent = 'পেমেন্ট প্রসেস হচ্ছে...';
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
        items, total, status: 'completed', paymentMethod: 'wallet', createdAt: serverTimestamp()
      });
      tx.set(txnRef, {
        uid: currentUser.uid, type: 'purchase', status: 'completed', amount: total,
        orderId: orderRef.id, note: 'ওয়ালেট দিয়ে অর্ডার পরিশোধ', createdAt: serverTimestamp()
      });
    });
    if(profile) profile.walletBalance = Number(profile.walletBalance || 0) - total;
    saveCart([]);
    renderCart();
    msg.className = 'form-msg ok';
    msg.textContent = 'পেমেন্ট সফল হয়েছে! অ্যাক্সেস এখনই আনলক হয়ে গেছে।';
    setTimeout(()=>{ msg.textContent=''; }, 5000);
  }catch(err){
    msg.className = 'form-msg err';
    msg.textContent = err.message === 'insufficient-balance' ? 'ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।' : 'পেমেন্ট ব্যর্থ হয়েছে, আবার চেষ্টা করুন।';
    console.error('wallet payment error:', err);
  }
});
