import { db, collection, addDoc, getDocs, query, where, serverTimestamp, onUserReady, getCurrentUser, escapeHtml } from '../common.js';

document.getElementById('supportLoginBtn').addEventListener('click', ()=> window.location.href = 'login.html');

onUserReady((user)=>{
  const loggedOut = document.getElementById('supportLoggedOut');
  const loggedIn = document.getElementById('supportLoggedIn');
  if(user){
    loggedOut.style.display = 'none';
    loggedIn.style.display = 'block';
    loadMyTickets();
  } else {
    loggedOut.style.display = 'block';
    loggedIn.style.display = 'none';
  }
});

document.getElementById('supportForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const subject = document.getElementById('supSubject').value.trim();
  const text = document.getElementById('supMsg').value.trim();
  const msg = document.getElementById('supportMsg');
  const currentUser = getCurrentUser();
  if(!subject || !text){
    msg.textContent = 'বিষয় ও বার্তা দুটোই লিখুন।';
    msg.className = 'form-msg err';
    return;
  }
  if(!currentUser){
    msg.textContent = 'আগে লগ ইন করুন।';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'পাঠানো হচ্ছে...';
  msg.className = 'form-msg';
  try{
    await addDoc(collection(db, 'supportTickets'), {
      uid: currentUser.uid,
      name: currentUser.displayName || '',
      email: currentUser.email || '',
      subject, message: text,
      status: 'open',
      adminReply: '',
      createdAt: serverTimestamp()
    });
    msg.textContent = 'টিকিট পাঠানো হয়েছে! আমরা দ্রুত যোগাযোগ করব।';
    msg.className = 'form-msg ok';
    e.target.reset();
    loadMyTickets();
  }catch(err){
    msg.textContent = 'পাঠানো যায়নি, আবার চেষ্টা করুন।';
    msg.className = 'form-msg err';
    console.error('ticket submit error:', err);
  }
});

async function loadMyTickets(){
  const list = document.getElementById('ticketList');
  const currentUser = getCurrentUser();
  if(!currentUser || !list) return;
  list.innerHTML = '<p style="color:var(--muted);">লোড হচ্ছে...</p>';
  try{
    const q = query(collection(db, 'supportTickets'), where('uid', '==', currentUser.uid));
    const snap = await getDocs(q);
    if(snap.empty){
      list.innerHTML = '<p style="color:var(--muted);">এখনো কোনো টিকিট নেই।</p>';
      return;
    }
    const tickets = [];
    snap.forEach(d => tickets.push({ id: d.id, ...d.data() }));
    tickets.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const statusLabel = { open:'ওপেন', replied:'রিপ্লাই দেওয়া হয়েছে', closed:'বন্ধ' };
    const statusColor = { open:'#F59E0B', replied:'#16A34A', closed:'#6B7280' };
    list.innerHTML = tickets.map(t => `
      <div class="ticket-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="font-size:0.95rem;">${escapeHtml(t.subject)}</strong>
          <span class="ticket-status" style="background:${statusColor[t.status] || '#999'};">${statusLabel[t.status] || t.status}</span>
        </div>
        <p style="color:var(--muted); font-size:0.85rem; margin-top:6px;">${escapeHtml(t.message)}</p>
        ${t.adminReply ? `<div style="margin-top:8px; padding:10px; background:#F6F6F8; border-radius:8px; font-size:0.85rem;"><strong>রিপ্লাই:</strong> ${escapeHtml(t.adminReply)}</div>` : ''}
      </div>
    `).join('');
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">টিকিট লোড করা যায়নি।</p>';
    console.error('loadMyTickets error:', err);
  }
}
