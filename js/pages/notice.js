import { db, collection, getDocs, renderSkeletonList, escapeHtml } from '../common.js';

const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';

// শুধু বৈধ YouTube আইডি গ্রহণ করি
function safeVideoId(v){
  return /^[A-Za-z0-9_-]{6,15}$/.test(String(v || '')) ? String(v) : '';
}

// থাম্বনেইল + লাল প্লে বাটন। maxres না থাকলে hqdefault (16:9-এ crop হয়ে কালো বার কেটে যায়)
function thumbInner(id){
  return `<img src="https://img.youtube.com/vi/${id}/maxresdefault.jpg" alt="" loading="lazy"
    onerror="this.onerror=null;this.src='https://img.youtube.com/vi/${id}/hqdefault.jpg'">
    <span class="vn-play">${PLAY_SVG}</span>`;
}

function videoCardHtml(v){
  return `
    <div class="vn-card">
      <div class="vn-thumb" role="button" tabindex="0" aria-label="ভিডিও চালান" data-vid="${v.id}">${thumbInner(v.id)}</div>
      ${v.title ? `<p class="vn-title">${escapeHtml(v.title)}</p>` : ''}
    </div>`;
}

let activeThumb = null; // একসাথে একটাই ভিডিও চলবে

function stopActive(){
  if(!activeThumb) return;
  activeThumb.classList.remove('playing');
  activeThumb.innerHTML = thumbInner(activeThumb.dataset.vid);
  activeThumb = null;
}

function playVideo(thumb){
  if(thumb.classList.contains('playing')) return;
  stopActive();
  thumb.classList.add('playing');
  thumb.innerHTML = `<iframe src="https://www.youtube.com/embed/${thumb.dataset.vid}?autoplay=1&rel=0&playsinline=1"
    title="ভিডিও নোটিশ" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  activeThumb = thumb;
}

async function loadNotices(){
  const list = document.getElementById('noticeList');
  renderSkeletonList('noticeList', 4);
  try{
    const snap = await getDocs(collection(db, 'notices'));
    if(snap.empty){
      list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো নোটিশ নেই।</p>';
      try{ localStorage.setItem('seenNoticeCount', '0'); }catch(e){}
      return;
    }
    list.innerHTML = '';
    let count = 0;
    const videos = [];
    snap.forEach(docSnap=>{
      const n = docSnap.data();
      count++;
      const vid = safeVideoId(n.videoId);
      if(vid){ videos.push({ id: vid, title: n.text || '' }); return; }
      const el = document.createElement('div');
      el.className = 'notice-item';
      el.innerHTML = `<span class="date">${n.date || ''}</span>${n.text || ''}`;
      list.appendChild(el);
    });

    if(videos.length){
      const sec = document.createElement('div');
      sec.className = 'vn-section';
      sec.innerHTML = `
        <div class="bar-head"><div class="left"><div class="bar"></div><h2>ভিডিও <em>নোটিশ</em></h2></div></div>
        ${videos.map(videoCardHtml).join('')}`;
      sec.addEventListener('click', (e)=>{
        const t = e.target.closest('.vn-thumb');
        if(t) playVideo(t);
      });
      sec.addEventListener('keydown', (e)=>{
        if(e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target.closest('.vn-thumb');
        if(t){ e.preventDefault(); playVideo(t); }
      });
      list.appendChild(sec);
    }
    try{ localStorage.setItem('seenNoticeCount', String(count)); }catch(e){}
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">নোটিশ লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error('loadNotices error:', err);
  }
}
loadNotices();
