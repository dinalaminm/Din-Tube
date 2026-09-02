import { db, collection, getDocs, doc, getDoc, query, where, requireAuth, onUserReady, renderSkeletonList } from '../common.js';

requireAuth();

onUserReady(async (user)=>{
  if(!user) return;
  const wrap = document.getElementById('myDownloadsList');
  renderSkeletonList('myDownloadsList', 3);
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    const downloadable = [];
    const lookupCache = {};
    for(const o of orders){
      if(o.status !== 'completed') continue;
      for(const it of (o.items || [])){
        if(!it.id || !it.type || (it.type !== 'products' && it.type !== 'software')) continue;
        const cacheKey = `${it.type}/${it.id}`;
        if(!(cacheKey in lookupCache)){
          try{
            const dSnap = await getDoc(doc(db, it.type, it.id));
            lookupCache[cacheKey] = dSnap.exists() ? { id: dSnap.id, ...dSnap.data() } : null;
          }catch(e){ lookupCache[cacheKey] = null; }
        }
        const full = lookupCache[cacheKey];
        if(full && full.downloadUrl) downloadable.push(full);
      }
    }

    if(downloadable.length === 0){
      wrap.innerHTML = '<p style="color:var(--muted);">এখনো কোনো ডাউনলোডযোগ্য প্রোডাক্ট নেই — অর্ডার সম্পন্ন হলে এখানে দেখা যাবে।</p>';
      return;
    }
    wrap.innerHTML = downloadable.map(item => `
      <div class="ticket-card" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <span style="font-weight:700;">${item.name}</span>
        <a href="${item.downloadUrl}" target="_blank" class="btn-primary" style="padding:8px 16px; font-size:0.85rem; border-radius:8px; text-decoration:none; white-space:nowrap;">ডাউনলোড</a>
      </div>
    `).join('');
  }catch(err){
    wrap.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি।</p>';
    console.error('mydownloads error:', err);
  }
});
