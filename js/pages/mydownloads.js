import { db, collection, getDocs, doc, getDoc, query, where, requireAuth, onUserReady, escapeHtml } from '../common.js';

const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const DL_BTN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const DL_EMPTY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16a4.5 4.5 0 0 1-1-8.9 5.5 5.5 0 0 1 10.7-2A4.5 4.5 0 0 1 17.5 16"/><path d="M12 11v8m0 0-3-3m3 3 3-3"/></svg>';

requireAuth();

onUserReady(async (user)=>{
  if(!user) return;
  const wrap = document.getElementById('myDownloadsList');
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    const downloadable = [];
    const videoPackLinks = []; // { packName, link, index } — Google Drive links from videopacks orders
    const lookupCache = {};
    for(const o of orders){
      if(o.status !== 'completed') continue;
      for(const it of (o.items || [])){
        // Video pack links live directly on the order item (deliveredLinks), so they
        // survive even if the pack is later deleted/out of stock — no doc lookup needed.
        if(it.type === 'videopacks' && Array.isArray(it.deliveredLinks) && it.deliveredLinks.length){
          it.deliveredLinks.forEach((link, idx)=>{
            videoPackLinks.push({ packName: it.name || 'ভিডিও প্যাক', link, index: idx + 1 });
          });
          continue;
        }
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

    if(downloadable.length === 0 && videoPackLinks.length === 0){
      wrap.innerHTML = `
        <div class="dl-empty">
          ${DL_EMPTY_ICON}
          <p>এখনো কোনো ডাউনলোডযোগ্য প্রোডাক্ট নেই — অর্ডার সম্পন্ন হলে এখানে দেখা যাবে।</p>
        </div>`;
      return;
    }
    const rows = downloadable.map(item => `
      <div class="dl-item">
        <div class="dl-icon">${DL_ICON}</div>
        <div class="dl-info">
          <b>${item.name}</b>
          <span>ডাউনলোডের জন্য প্রস্তুত</span>
        </div>
        <a href="${item.downloadUrl}" target="_blank" rel="noopener" class="dl-btn">${DL_BTN_ICON}ডাউনলোড</a>
      </div>
    `);
    videoPackLinks.forEach(vp => {
      rows.push(`
        <div class="dl-item">
          <div class="dl-icon">${DL_ICON}</div>
          <div class="dl-info">
            <b>${escapeHtml(vp.packName)} — ভিডিও ${vp.index}</b>
            <span>ডাউনলোডের জন্য প্রস্তুত</span>
          </div>
          <a href="${escapeHtml(vp.link)}" target="_blank" rel="noopener" class="dl-btn">${DL_BTN_ICON}লিংক খুলুন</a>
        </div>
      `);
    });
    wrap.innerHTML = rows.join('');
  }catch(err){
    wrap.innerHTML = `
      <div class="dl-empty dl-error">
        ${DL_EMPTY_ICON}
        <p>লোড করা যায়নি। পুনরায় চেষ্টা করুন।</p>
      </div>`;
    console.error('mydownloads error:', err);
  }
});
