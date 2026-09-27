import { db, collection, addDoc, getDocs, query, where, serverTimestamp, onUserReady, getCurrentUser, escapeHtml, renderSkeletonList } from '../common.js';

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
    msg.textContent = 'Enter both subject and message.';
    msg.className = 'form-msg err';
    return;
  }
  if(!currentUser){
    msg.textContent = 'Please log in first.';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'Sending...';
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
    msg.textContent = 'Ticket sent! We\'ll get back to you soon.';
    msg.className = 'form-msg ok';
    e.target.reset();
    loadMyTickets();
  }catch(err){
    msg.textContent = 'Could not send, please try again.';
    msg.className = 'form-msg err';
    console.error('ticket submit error:', err);
  }
});

async function loadMyTickets(){
  const list = document.getElementById('ticketList');
  const currentUser = getCurrentUser();
  if(!currentUser || !list) return;
  renderSkeletonList('ticketList', 2);
  try{
    const q = query(collection(db, 'supportTickets'), where('uid', '==', currentUser.uid));
    const snap = await getDocs(q);
    if(snap.empty){
      list.innerHTML = '<p style="color:var(--muted);">No tickets yet.</p>';
      return;
    }
    const tickets = [];
    snap.forEach(d => tickets.push({ id: d.id, ...d.data() }));
    tickets.sort((a,b)=> (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const statusLabel = { open:'Open', replied:'Replied', closed:'Closed' };
    const statusColor = { open:'#F59E0B', replied:'#16A34A', closed:'#6B7280' };
    list.innerHTML = tickets.map(t => `
      <div class="ticket-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="font-size:0.95rem;">${escapeHtml(t.subject)}</strong>
          <span class="ticket-status" style="background:${statusColor[t.status] || '#999'};">${statusLabel[t.status] || t.status}</span>
        </div>
        <p style="color:var(--muted); font-size:0.85rem; margin-top:6px;">${escapeHtml(t.message)}</p>
        ${t.adminReply ? `<div style="margin-top:8px; padding:10px; background:#F6F6F8; border-radius:8px; font-size:0.85rem;"><strong>Reply:</strong> ${escapeHtml(t.adminReply)}</div>` : ''}
      </div>
    `).join('');
  }catch(err){
    list.innerHTML = '<p style="color:var(--coral);">Could not load tickets.</p>';
    console.error('loadMyTickets error:', err);
  }
}
