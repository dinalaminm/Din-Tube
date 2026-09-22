import { db, collection, getDocs, itemBg, escapeHtml, renderSkeletonCards } from '../common.js';

function remainingOf(pack){
  // system === 'v2': প্রতিটা ভিডিও আলাদা রেকর্ড (videoStock), প্যাকে শুধু গণনা থাকে।
  // পুরনো প্যাকে links অ্যারে আর assignedCount দিয়ে হিসাব চলে।
  const total = pack.system === 'v2'
    ? Number(pack.totalCount || 0)
    : (Array.isArray(pack.links) ? pack.links.length : 0);
  return Math.max(0, total - Number(pack.assignedCount || 0));
}

async function boot(){
  const grid = document.getElementById('videoPacksGrid');
  renderSkeletonCards('videoPacksGrid', 6);
  try{
    const snap = await getDocs(collection(db, 'videopacks'));
    const packs = [];
    snap.forEach(d => packs.push({ id: d.id, ...d.data() }));
    if(packs.length === 0){
      grid.innerHTML = '<p style="color:var(--muted);">এখনো কোনো ভিডিও প্যাক যোগ করা হয়নি।</p>';
      return;
    }
    grid.innerHTML = packs.map((pack, i)=>{
      const remaining = remainingOf(pack);
      const bg = itemBg(pack, i);
      return `
        <a class="product-card" href="video-pack-detail.html?id=${encodeURIComponent(pack.id)}" style="text-decoration:none; color:inherit;">
          <div class="product-img" style="background:${pack.imageUrl ? `url('${pack.imageUrl}') center/cover` : bg};">
            ${remaining === 0 ? `<div class="badge-sale" style="background:#9CA3AF;">স্টক নেই</div>` : ''}
          </div>
          <div class="product-body">
            <h4>${escapeHtml(pack.title || '')}</h4>
            <span style="color:var(--muted); font-size:0.75rem; font-weight:600;">${remaining === 0 ? 'স্টক শেষ' : `স্টকে আছে ${remaining} টি`}</span>
            <div class="price-row">
              <span class="price-now">৳${Number(pack.price1 || 0).toLocaleString('en-US')} থেকে</span>
            </div>
          </div>
        </a>`;
    }).join('');
  }catch(err){
    grid.innerHTML = '<p style="color:var(--coral);">লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error('videopacks load error:', err);
  }
}
boot();
