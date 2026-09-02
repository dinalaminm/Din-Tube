import { db, collection, getDocs, query, where, requireAuth, onUserReady, escapeHtml } from '../common.js';

requireAuth();

const orderStatusLabelUser = { pending:'পেন্ডিং', paid:'পেইড', completed:'সম্পন্ন', cancelled:'বাতিল', refunded:'রিফান্ড হয়েছে' };
const orderStatusColorUser = { pending:'#F59E0B', paid:'#2563EB', completed:'#16A34A', cancelled:'#6B7280', refunded:'#7C3AED' };

onUserReady(async (user)=>{
  if(!user) return;
  const wrap = document.getElementById('myOrdersList');
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
    orders.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if(orders.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো অর্ডার নেই।</p>';
      return;
    }
    wrap.innerHTML = orders.map(o => `
      <div class="ticket-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="font-size:0.95rem;">৳${Number(o.total || 0).toLocaleString('en-US')}</strong>
          <span class="ticket-status" style="background:${orderStatusColorUser[o.status] || '#999'};">${orderStatusLabelUser[o.status] || o.status}</span>
        </div>
        <ul style="margin-top:8px; padding-left:18px; font-size:0.85rem; color:var(--muted);">
          ${(o.items || []).map(it => `<li>${escapeHtml(it.name)} × ${Number(it.qty || 0)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }catch(err){
    wrap.innerHTML = '<p style="color:var(--coral);">অর্ডার লোড করা যায়নি।</p>';
    console.error('loadMyOrders error:', err);
  }
});
