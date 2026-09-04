import { db, collection, getDocs, query, where, requireAuth, onUserReady, escapeHtml, renderSkeletonList } from '../common.js';

requireAuth();

const orderStatusLabelUser = { pending:'পেন্ডিং', paid:'পেইড', completed:'সম্পন্ন', cancelled:'বাতিল', refunded:'রিফান্ড হয়েছে' };
const orderStatusColorUser = { pending:'#F59E0B', paid:'#2563EB', completed:'#16A34A', cancelled:'#6B7280', refunded:'#7C3AED' };
const orderStatusIcon = {
  pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  paid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/></svg>',
  completed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  cancelled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  refunded: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 21v-6h6"/></svg>',
};

function formatOrderDate(createdAt){
  if(!createdAt || !createdAt.seconds) return '';
  const d = new Date(createdAt.seconds * 1000);
  const datePart = d.toLocaleDateString('bn-BD', { day:'numeric', month:'long', year:'numeric' });
  const timePart = d.toLocaleTimeString('bn-BD', { hour:'numeric', minute:'2-digit' });
  return `${datePart} · ${timePart}`;
}

onUserReady(async (user)=>{
  if(!user) return;
  const wrap = document.getElementById('myOrdersList');
  const countEl = document.getElementById('ordersCount');
  renderSkeletonList('myOrdersList', 3);
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
    orders.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if(countEl) countEl.textContent = orders.length > 0 ? `মোট ${orders.length}টা` : '';
    if(orders.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো অর্ডার নেই।</p>';
      return;
    }
    wrap.innerHTML = orders.map(o => {
      const color = orderStatusColorUser[o.status] || '#6B7280';
      const label = orderStatusLabelUser[o.status] || o.status;
      const icon = orderStatusIcon[o.status] || '';
      const dateStr = formatOrderDate(o.createdAt);
      const itemsHtml = (o.items || []).map(it => `
        <li class="order-item-row">
          <span class="name">${escapeHtml(it.name)}</span>
          <span class="qty">× ${Number(it.qty || 0)}</span>
        </li>
      `).join('');
      const metaParts = [];
      if(o.paymentMethod) metaParts.push(`<span><strong>${escapeHtml(o.paymentMethod)}</strong> দিয়ে পেমেন্ট</span>`);
      if(o.transactionId) metaParts.push(`<span>ট্রানজেকশন: <strong>${escapeHtml(o.transactionId)}</strong></span>`);
      return `
        <div class="order-card">
          <div class="order-card-top">
            <div>
              ${dateStr ? `<div class="order-date">${dateStr}</div>` : ''}
              <div class="order-total">৳${Number(o.total || 0).toLocaleString('en-US')}</div>
            </div>
            <span class="order-status-pill" style="background:${color};">${icon}${label}</span>
          </div>
          <ul class="order-items">${itemsHtml}</ul>
          ${metaParts.length ? `<div class="order-meta">${metaParts.join('<span style="color:var(--line);">•</span>')}</div>` : ''}
        </div>
      `;
    }).join('');
  }catch(err){
    wrap.innerHTML = '<p style="color:var(--coral);">অর্ডার লোড করা যায়নি।</p>';
    console.error('loadMyOrders error:', err);
  }
});
