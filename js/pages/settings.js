import {
  auth, db, doc, setDoc, getDocs, collection, query, where,
  updateProfile, sendPasswordResetEmail, deleteDoc, deleteUser,
  EmailAuthProvider, reauthenticateWithCredential,
  requireAuth, onUserReady, getCurrentUser, getCurrentProfile, syncProfileCache, showToast,
  updateHeaderAvatar
} from '../common.js';

requireAuth();

onUserReady((user, profile)=>{
  if(!user) return;
  document.getElementById('setName').value = user.displayName || '';
  document.getElementById('setPhone').value = profile?.phone || '';
  document.getElementById('setEmail').value = user.email || '';
});

document.getElementById('settingsProfileForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('settingsProfileMsg');
  const currentUser = getCurrentUser();
  if(!currentUser){ msg.textContent = 'Please log in first.'; msg.className = 'form-msg err'; return; }
  const name = document.getElementById('setName').value.trim();
  const phone = document.getElementById('setPhone').value.trim();
  if(!name){ msg.textContent = 'Enter a name.'; msg.className = 'form-msg err'; return; }
  msg.textContent = 'Saving...';
  msg.className = 'form-msg';
  try{
    await updateProfile(auth.currentUser, { displayName: name });
    await setDoc(doc(db, 'users', currentUser.uid), { name, phone }, { merge: true });
    const profile = getCurrentProfile();
    if(profile){ profile.name = name; profile.phone = phone; syncProfileCache(); }
    updateHeaderAvatar(name);
    msg.textContent = 'Saved!';
    msg.className = 'form-msg ok';
  }catch(err){
    msg.textContent = 'Save failed, please try again.';
    msg.className = 'form-msg err';
    console.error(err);
  }
});

document.getElementById('resetPassBtn').addEventListener('click', async ()=>{
  const msg = document.getElementById('settingsPassMsg');
  const currentUser = getCurrentUser();
  if(!currentUser) return;
  try{
    await sendPasswordResetEmail(auth, currentUser.email);
    msg.textContent = 'Password reset link sent to ' + currentUser.email + '.';
    msg.className = 'form-msg ok';
  }catch(err){
    msg.textContent = 'Could not send, please try again.';
    msg.className = 'form-msg err';
    console.error(err);
  }
});

document.getElementById('exportDataBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('exportDataBtn');
  const currentUser = getCurrentUser();
  if(!currentUser) return;
  btn.disabled = true;
  btn.textContent = 'Creating...';
  try{
    const [ticketsSnap, ordersSnap, walletSnap] = await Promise.all([
      getDocs(query(collection(db, 'supportTickets'), where('uid', '==', currentUser.uid))),
      getDocs(query(collection(db, 'orders'), where('uid', '==', currentUser.uid))),
      getDocs(query(collection(db, 'walletTransactions'), where('uid', '==', currentUser.uid))),
    ]);
    const toPlain = (snap)=> { const arr = []; snap.forEach(d=>{
      const data = d.data();
      if(data.createdAt && data.createdAt.toDate) data.createdAt = data.createdAt.toDate().toISOString();
      arr.push({ id: d.id, ...data });
    }); return arr; };
    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: { uid: currentUser.uid, name: currentUser.displayName, email: currentUser.email },
      supportTickets: toPlain(ticketsSnap),
      orders: toPlain(ordersSnap),
      walletTransactions: toPlain(walletSnap),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'creator-rivo-data-' + currentUser.uid.slice(0,8) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(err){
    console.error('data export error:', err);
    showToast('Could not export data');
  }finally{
    btn.disabled = false;
    btn.textContent = '📥 Export My Data (JSON)';
  }
});

document.getElementById('showDeleteAccountBtn').addEventListener('click', ()=>{
  const form = document.getElementById('deleteAccountForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('deleteAccountForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('deleteAccountMsg');
  const currentUser = getCurrentUser();
  if(!currentUser){ return; }
  const pass = document.getElementById('deleteConfirmPass').value;
  if(!pass){
    msg.textContent = 'Enter a password.';
    msg.className = 'form-msg err';
    return;
  }
  if(!confirm('Are you sure? This action cannot be undone.')) return;
  msg.textContent = 'Deleting...';
  msg.className = 'form-msg';
  try{
    const cred = EmailAuthProvider.credential(currentUser.email, pass);
    await reauthenticateWithCredential(auth.currentUser, cred);
    await deleteDoc(doc(db, 'users', currentUser.uid));
    await deleteUser(auth.currentUser);
    showToast('Account deleted');
    window.location.href = 'index.html';
  }catch(err){
    console.error('account delete error:', err);
    if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'){
      msg.textContent = 'Incorrect password.';
    } else {
      msg.textContent = 'Could not delete, please try again.';
    }
    msg.className = 'form-msg err';
  }
});
