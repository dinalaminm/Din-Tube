import { db, collection, getDocs } from '../common.js';

async function loadNotices(){
  const list = document.getElementById('noticeList');
  try{
    const snap = await getDocs(collection(db, 'notices'));
    if(snap.empty){
      list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো নোটিশ নেই।</p>';
      try{ localStorage.setItem('seenNoticeCount', '0'); }catch(e){}
      return;
    }
    list.innerHTML = '';
    let count = 0;
    snap.forEach(docSnap=>{
      const n = docSnap.data();
      count++;
      const el = document.createElement('div');
      el.className = 'notice-item';
      el.innerHTML = `<span class="date">${n.date || ''}</span>${n.text || ''}`;
      list.appendChild(el);
    });
    try{ localStorage.setItem('seenNoticeCount', String(count)); }catch(e){}
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">নোটিশ লোড করা যায়নি। Firestore রুলস/কানেকশন চেক করুন।</p>';
    console.error('loadNotices error:', err);
  }
}
loadNotices();
