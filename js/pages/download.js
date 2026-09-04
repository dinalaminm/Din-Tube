import { db, collection, getDocs, doc, getDoc, query, where, requireAuth, onUserReady } from '../common.js';

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none"/></svg>';
const ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const DL_BTN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const EMPTY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16a4.5 4.5 0 0 1-1-8.9 5.5 5.5 0 0 1 10.7-2A4.5 4.5 0 0 1 17.5 16"/><path d="M12 11v8m0 0-3-3m3 3 3-3"/></svg>';

const TYPE_LABEL = { courses:'কোর্স', videos:'ভিডিও', products:'প্রোডাক্ট', software:'সফটওয়্যার' };

requireAuth();

onUserReady(async (user)=>{
  if(!user) return;
  const wrap = document.getElementById('myDownloadsList');
  try{
    const q = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    const downloadable = []; // products/software with a direct downloadUrl
    const courseItems = [];  // purchased courses/videos -> opened via detail page, not a raw file
    const lookupCache = {};
    for(const o of orders){
      if(o.status !== 'completed') continue;
      for(const it of (o.items || [])){
        if(!it.id || !it.type) continue;
        const cacheKey = `${it.type}/${it.id}`;
        if(!(cacheKey in lookupCache)){
          try{
            const dSnap = await getDoc(doc(db, it.type, it.id));
            lookupCache[cacheKey] = dSnap.exists() ? { id: dSnap.id, ...dSnap.data() } : null;
          }catch(e){ lookupCache[cacheKey] = null; }
        }
        const full = lookupCache[cacheKey];
        if(!full) continue;
        if((it.type === 'products' || it.type === 'software') && full.downloadUrl){
          downloadable.push(full);
        }else if(it.type === 'courses' || it.type === 'videos'){
          courseItems.push({ ...full, type: it.type });
        }
      }
    }

    if(downloadable.length === 0 && courseItems.length === 0){
      wrap.innerHTML = `
        <div class="dl-empty">
          ${EMPTY_ICON}
          <p>এখনো কোনো ডাউনলোড বা কেনা কোর্স/ভিডিও নেই — অর্ডার সম্পন্ন হলে এখানে দেখা যাবে।</p>
        </div>`;
      return;
    }

    const rows = [];
    courseItems.forEach(item => {
      rows.push(`
        <div class="dl-item">
          <div class="dl-icon">${PLAY_ICON}</div>
          <div class="dl-info">
            <b>${item.title || ''}</b>
            <span class="dl-tag">${TYPE_LABEL[item.type] || ''}</span>
          </div>
          <a href="detail.html?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}" class="dl-btn">${ARROW_ICON}দেখুন</a>
        </div>
      `);
    });
    downloadable.forEach(item => {
      rows.push(`
        <div class="dl-item">
          <div class="dl-icon">${DL_ICON}</div>
          <div class="dl-info">
            <b>${item.name || ''}</b>
            <span class="dl-tag">ডাউনলোডের জন্য প্রস্তুত</span>
          </div>
          <a href="${item.downloadUrl}" target="_blank" rel="noopener" class="dl-btn">${DL_BTN_ICON}ডাউনলোড</a>
        </div>
      `);
    });
    wrap.innerHTML = rows.join('');
  }catch(err){
    wrap.innerHTML = `
      <div class="dl-empty dl-error">
        ${EMPTY_ICON}
        <p>লোড করা যায়নি। পুনরায় চেষ্টা করুন।</p>
      </div>`;
    console.error('download page error:', err);
  }
});
