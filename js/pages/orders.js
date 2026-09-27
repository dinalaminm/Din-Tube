import { db, collection, getDocs, query, where, requireAuth, onUserReady, escapeHtml, renderSkeletonList } from '../common.js';

requireAuth();

const STATUS_LABEL = { pending:'Pending', paid:'Paid', completed:'Completed', cancelled:'Cancelled', refunded:'Refunded' };
const STATUS_COLOR = { pending:'#F59E0B', paid:'#2563EB', completed:'#16A34A', cancelled:'#6B7280', refunded:'#7C3AED' };
// Fixed display order for filter chips, so it doesn't jump around per user.
const STATUS_ORDER = ['pending', 'paid', 'completed', 'cancelled', 'refunded'];

let allOrders = [];
let activeFilter = 'all';

function formatOrderDate(createdAt){
  if(!createdAt || !createdAt.seconds) return '';
  const d = new Date(createdAt.seconds * 1000);
  const datePart = d.toLocaleDateString('bn-BD', { day:'numeric', month:'long', year:'numeric' });
  const timePart = d.toLocaleTimeString('bn-BD', { hour:'numeric', minute:'2-digit' });
  return `${datePart}, ${timePart}`;
}

function paymentMetaLine(o){
  if(!o.paymentMethod) return '';
  if(o.paymentMethod === 'Wallet') return 'Paid directly from wallet.';
  const method = escapeHtml(o.paymentMethod);
  return o.transactionId
    ? `Paid via ${method}, transaction ID ${escapeHtml(o.transactionId)}.`
    : `Paid via ${method}.`;
}

function renderStats(){
  const el = document.getElementById('ordersStats');
  if(allOrders.length === 0){ el.style.display = 'none'; return; }
  const pendingCount = allOrders.filter(o => o.status === 'pending').length;
  const totalSpent = allOrders
    .filter(o => o.status === 'completed' || o.status === 'paid')
    .reduce((s,o) => s + Number(o.total || 0), 0);
  el.innerHTML = `
    <div class="orders-stat"><span class="num">${allOrders.length}</span><span class="lbl">Total Orders</span></div>
    <div class="orders-stat"><span class="num">${pendingCount}</span><span class="lbl">Pending</span></div>
    <div class="orders-stat"><span class="num">Tk${totalSpent.toLocaleString('en-US')}</span><span class="lbl">Total Spent</span></div>
  `;
  el.style.display = 'flex';
}

function renderFilters(){
  const el = document.getElementById('ordersFilters');
  const present = STATUS_ORDER.filter(s => allOrders.some(o => o.status === s));
  if(allOrders.length === 0 || present.length < 2){ el.style.display = 'none'; return; }
  const chips = [{ key:'all', label:'All' }, ...present.map(s => ({ key:s, label:STATUS_LABEL[s] || s }))];
  el.innerHTML = chips.map(c => `<button type="button" class="chip${activeFilter === c.key ? ' active' : ''}" data-filter="${c.key}">${c.label}</button>`).join('');
  el.style.display = 'flex';
  el.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      renderFilters();
      renderList();
    });
  });
}

function renderList(){
  const wrap = document.getElementById('myOrdersList');
  if(allOrders.length === 0){
    wrap.innerHTML = `
      <div class="orders-empty">
        <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12.5a1 1 0 0 1-1 1.5H6a1 1 0 0 1-1-1.5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
        <p>No orders yet. Browse products or courses to start shopping.</p>
        <a href="index.html#shop">Start Shopping</a>
      </div>
    `;
    return;
  }
  const filtered = activeFilter === 'all' ? allOrders : allOrders.filter(o => o.status === activeFilter);
  if(filtered.length === 0){
    wrap.innerHTML = '<p style="color:var(--muted); padding:24px 0;">No orders in this category.</p>';
    return;
  }
  wrap.innerHTML = filtered.map(o => {
    const color = STATUS_COLOR[o.status] || '#6B7280';
    const label = STATUS_LABEL[o.status] || o.status;
    const dateStr = formatOrderDate(o.createdAt);
    const itemsHtml = (o.items || []).map(it => `
      <li class="receipt-item-row">
        <span class="name">${escapeHtml(it.name)}</span>
        <span class="leader"></span>
        <span class="qty">×${Number(it.qty || 0)}</span>
      </li>
    `).join('');
    const meta = paymentMetaLine(o);
    const linksHtml = (o.items || [])
      .filter(it => Array.isArray(it.deliveredLinks) && it.deliveredLinks.length)
      .map(it => `
        <div class="receipt-links">
          <span class="receipt-links-label">${escapeHtml(it.name)} — Video Links:</span>
          ${it.deliveredLinks.map((link, idx) => `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="receipt-link-btn">Video ${idx + 1}</a>`).join('')}
        </div>
      `).join('');
    return `
      <div class="receipt-card">
        <div class="receipt-perf"></div>
        <div class="receipt-body">
          <div class="receipt-top">
            ${dateStr ? `<span class="receipt-date">${dateStr}</span>` : '<span></span>'}
            <span class="receipt-status"><span class="dot" style="background:${color};"></span>${label}</span>
          </div>
          <ul class="receipt-items">${itemsHtml}</ul>
          ${linksHtml}
          <div class="receipt-divider"></div>
          <div class="receipt-total-row">
            <span class="lbl">Total</span>
            <span class="amount">Tk${Number(o.total || 0).toLocaleString('en-US')}</span>
          </div>
          ${meta ? `<div class="receipt-meta">${meta}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

onUserReady(async (user)=>{
  if(!user) return;
  renderSkeletonList('myOrdersList', 3);
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    allOrders = [];
    snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    allOrders.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderStats();
    renderFilters();
    renderList();
  }catch(err){
    document.getElementById('myOrdersList').innerHTML = '<p style="color:var(--coral);">Could not load orders.</p>';
    console.error('loadMyOrders error:', err);
  }
});
