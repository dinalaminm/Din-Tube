import { db, collection, getDocs, doc, getDoc, query, where, requireAuth, onUserReady, escapeHtml } from '../common.js';

const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const DL_BTN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const DL_EMPTY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16a4.5 4.5 0 0 1-1-8.9 5.5 5.5 0 0 1 10.7-2A4.5 4.5 0 0 1 17.5 16"/><path d="M12 11v8m0 0-3-3m3 3 3-3"/></svg>';

function formatOrderDateTime(createdAt){
  if(!createdAt || !createdAt.seconds) return '';
  const d = new Date(createdAt.seconds * 1000);
  const datePart = d.toLocaleDateString('bn-BD', { day:'numeric', month:'long', year:'numeric' });
  const timePart = d.toLocaleTimeString('bn-BD', { hour:'numeric', minute:'2-digit' });
  return `${datePart}, ${timePart}`;
}

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
    const videoPackGroups = []; // one entry per purchase: { packName, createdAt, links: [] }
    const lookupCache = {};
    for(const o of orders){
      if(o.status !== 'completed') continue;
      for(const it of (o.items || [])){
        // Video pack links live directly on the order item (deliveredLinks), so they
        // survive even if the pack is later deleted/out of stock — no doc lookup needed.
        if(it.type === 'videopacks' && Array.isArray(it.deliveredLinks) && it.deliveredLinks.length){
          videoPackGroups.push({ packName: it.name || 'ভিডিও প্যাক', createdAt: o.createdAt, links: it.deliveredLinks });
          continue;
        }
        if(!it.id || !it.type || (it.type !== 'products' && it.type !== 'software' && it.type !== 'courses')) continue;
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

    // Number every purchased video 1, 2, 3... in the order they were bought (oldest
    // first), then show the groups newest-first so recent purchases stay on top while
    // each video keeps one consistent, permanent serial number.
    videoPackGroups.sort((a,b)=> (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    let serialCounter = 0;
    videoPackGroups.forEach(group => {
      group.startSerial = serialCounter + 1;
      serialCounter += group.links.length;
    });
    videoPackGroups.reverse();

    if(downloadable.length === 0 && videoPackGroups.length === 0){
      wrap.innerHTML = `
        <div class="dl-empty">
          ${DL_EMPTY_ICON}
          <p>এখনো কোনো ডাউনলোডযোগ্য প্রোডাক্ট নেই — অর্ডার সম্পন্ন হলে এখানে দেখা যাবে।</p>
        </div>`;
      return;
    }

    const rows = [];
    videoPackGroups.forEach(group => {
      const dateStr = formatOrderDateTime(group.createdAt);
      const rangeLabel = group.links.length > 1
        ? `ভিডিও ${group.startSerial}–${group.startSerial + group.links.length - 1}`
        : `ভিডিও ${group.startSerial}`;
      rows.push(`
        <div class="dl-vp-group">
          <div class="dl-vp-head">
            <div class="dl-icon">${DL_ICON}</div>
            <div class="dl-vp-head-info">
              <b>${escapeHtml(group.packName)}</b>
              <span>${rangeLabel} · ${group.links.length} টি ${dateStr ? '· ' + dateStr : ''}</span>
            </div>
          </div>
          <div class="dl-vp-rows">
            ${group.links.map((link, idx)=> `
              <div class="dl-vp-row">
                <span>ভিডিও #${group.startSerial + idx}</span>
                <a href="${escapeHtml(link)}" target="_blank" rel="noopener">${DL_BTN_ICON}লিংক খুলুন</a>
              </div>
            `).join('')}
          </div>
        </div>
      `);
    });
    downloadable.forEach(item => {
      rows.push(`
        <div class="dl-item">
          <div class="dl-icon">${DL_ICON}</div>
          <div class="dl-info">
            <b>${item.name}</b>
            <span>ডাউনলোডের জন্য প্রস্তুত</span>
          </div>
          <a href="${item.downloadUrl}" target="_blank" rel="noopener" class="dl-btn">${DL_BTN_ICON}ডাউনলোড</a>
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
