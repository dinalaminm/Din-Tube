import {
  db, doc, getDoc, collection, getDocs,
  extractYouTubeId, itemLabel, itemBg, renderCard, addToCart, showToast,
  onUserReady, getOwnedItemIds
} from '../common.js';

const params = new URLSearchParams(window.location.search);
const type = params.get('type');
const id = params.get('id');

const COLLECTION_BY_TYPE = { courses:'courses', products:'products', software:'software', videos:'videos' };

function showDetailSkeleton(){
  const imageWrap = document.getElementById('detailImageWrap');
  if(imageWrap){
    imageWrap.style.display = 'block';
    imageWrap.innerHTML = '<div class="skeleton" style="aspect-ratio:4/3; border-radius:16px;"></div>';
  }
  document.getElementById('detailTitle').innerHTML = '<span class="skeleton skel-detail-line w-80" style="display:inline-block;"></span>';
  document.getElementById('detailDesc').innerHTML = '<span class="skeleton skel-detail-line w-100" style="display:block;"></span><span class="skeleton skel-detail-line w-50" style="display:block;"></span>';
  document.getElementById('detailPriceNow').innerHTML = '<span class="skeleton skel-detail-line w-30" style="display:inline-block;"></span>';
}
function clearDetailImageSkeleton(){
  const imageWrap = document.getElementById('detailImageWrap');
  if(imageWrap) imageWrap.innerHTML = '<div id="detailImage" style="aspect-ratio:4/3; border-radius:16px; background-size:cover; background-position:center;"></div>';
}

function renderFeatures(list){
  const wrap = document.getElementById('detailFeatures');
  if(!Array.isArray(list) || list.length === 0){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = list.map(f => `
    <div style="display:flex; align-items:flex-start; gap:10px;">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#16A34A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto; margin-top:2px;"><path d="M20 6 9 17l-5-5"/></svg>
      <span>${f}</span>
    </div>
  `).join('');
}

async function boot(){
  if(!type || !id || !COLLECTION_BY_TYPE[type]){
    document.getElementById('detailTitle').textContent = 'পাওয়া যায়নি';
    document.getElementById('detailDesc').textContent = 'এই আইটেমটি খুঁজে পাওয়া যায়নি। হোমপেজে ফিরে যান।';
    return;
  }

  showDetailSkeleton();

  let item;
  try{
    const snap = await getDoc(doc(db, COLLECTION_BY_TYPE[type], id));
    if(!snap.exists()){
      clearDetailImageSkeleton();
      document.getElementById('detailImageWrap').style.display = 'none';
      document.getElementById('detailTitle').textContent = 'পাওয়া যায়নি';
      document.getElementById('detailDesc').textContent = 'এই আইটেমটি এখন আর নেই।';
      return;
    }
    item = { id: snap.id, ...snap.data() };
  }catch(err){
    console.error('detail fetch error:', err);
    clearDetailImageSkeleton();
    document.getElementById('detailImageWrap').style.display = 'none';
    document.getElementById('detailTitle').textContent = 'লোড করা যায়নি';
    document.getElementById('detailDesc').textContent = 'Firestore রুলস/কানেকশন চেক করুন।';
    return;
  }

  onUserReady(async (user)=>{
    let owned = Number(item.price || 0) <= 0;
    if(user && !owned){
      const ownedIds = await getOwnedItemIds(user.uid);
      owned = ownedIds.has(item.id);
    }
    renderDetail(item, owned);
  });
}

function renderDetail(item, owned){
  clearDetailImageSkeleton();
  const videoWrap = document.getElementById('detailVideoWrap');
  const videoFrame = document.getElementById('detailVideoFrame');
  const imageWrap = document.getElementById('detailImageWrap');
  const imageEl = document.getElementById('detailImage');
  const lockedWrap = document.getElementById('detailLockedWrap');

  const hasVideo = (type === 'courses' || type === 'videos') && item.videoId;

  if(hasVideo && (type === 'courses' || owned)){
    videoFrame.src = 'https://www.youtube.com/embed/' + extractYouTubeId(item.videoId);
    videoWrap.style.display = 'block';
    imageWrap.style.display = 'none';
    lockedWrap.style.display = 'none';
  } else if(hasVideo && type === 'videos' && !owned){
    videoFrame.src = '';
    videoWrap.style.display = 'none';
    imageWrap.style.display = 'none';
    lockedWrap.style.display = 'block';
  } else {
    videoFrame.src = '';
    videoWrap.style.display = 'none';
    lockedWrap.style.display = 'none';
    if(item.imageUrl){
      imageEl.style.background = `url('${item.imageUrl}') center/cover`;
      imageWrap.style.display = 'block';
    } else {
      imageWrap.style.display = 'none';
    }
  }

  document.title = itemLabel(type, item) + ' | Creator Rivo';
  document.getElementById('detailTitle').textContent = itemLabel(type, item);

  const tags = document.getElementById('detailTags');
  tags.innerHTML = '';
  if(item.category){
    tags.innerHTML += `<span style="background:#E6F9EE; color:#16A34A; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">${item.category}</span>`;
  }
  if(type === 'courses'){
    tags.innerHTML += `<span style="background:#FFF1EF; color:var(--coral); font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">Instant Access</span>`;
  }
  if(type === 'software' && item.version){
    tags.innerHTML += `<span style="background:#EFF6FF; color:#2563EB; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">v${item.version}</span>`;
  }
  if(type === 'software' && item.platform){
    tags.innerHTML += `<span style="background:#F5F3FF; color:#7C3AED; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px;">${item.platform}</span>`;
  }

  document.getElementById('detailDesc').textContent = item.description || '';
  renderFeatures(item.features);

  document.getElementById('detailPriceNow').textContent = '৳' + Number(item.price || 0).toLocaleString('en-US');
  const oldPriceEl = document.getElementById('detailPriceOld');
  oldPriceEl.textContent = item.oldPrice ? '৳' + Number(item.oldPrice).toLocaleString('en-US') : '';
  const badgeEl = document.getElementById('detailDiscountBadge');
  if((type === 'courses' || type === 'videos') && item.discount){
    badgeEl.textContent = item.discount;
    badgeEl.style.display = 'inline-block';
  } else {
    badgeEl.style.display = 'none';
  }

  const buyBtn = document.getElementById('detailBuyBtn');
  buyBtn.disabled = false;
  buyBtn.style.opacity = '1';
  if((type === 'products' || type === 'software') && item.downloadUrl && owned){
    buyBtn.textContent = 'ডাউনলোড করুন';
    buyBtn.onclick = ()=> window.open(item.downloadUrl, '_blank');
  } else if(type === 'videos' && owned){
    buyBtn.textContent = 'কেনা হয়ে গেছে ✓';
    buyBtn.onclick = null;
    buyBtn.disabled = true;
    buyBtn.style.opacity = '0.6';
  } else {
    buyBtn.textContent = type === 'courses' ? 'কোর্সে ভর্তি হন' : (type === 'videos' ? 'কিনুন' : 'কার্টে যোগ করুন');
    buyBtn.onclick = ()=>{
      addToCart({ id: item.id, type, name: itemLabel(type, item), price: Number(item.price || 0), grad: itemBg(item, 0) });
      showToast(itemLabel(type, item) + ' কার্টে যোগ হয়েছে');
    };
  }

  const labelMap = { courses:'কোর্স', products:'প্রোডাক্ট', software:'সফটওয়্যার', videos:'ভিডিও' };
  document.getElementById('detailMoreLabel').textContent = labelMap[type] || '';
  loadRelated(item);
}

async function loadRelated(item){
  const relatedWrap = document.getElementById('detailRelated');
  relatedWrap.innerHTML = '';
  try{
    const snap = await getDocs(collection(db, COLLECTION_BY_TYPE[type]));
    const pool = [];
    snap.forEach(d => { if(d.id !== item.id) pool.push({ id: d.id, ...d.data() }); });
    pool.slice(0, 4).forEach((relItem, i)=> relatedWrap.appendChild(renderCard(type, relItem, i)));
  }catch(err){ console.error('related items error:', err); }
}

boot();
