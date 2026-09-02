import { auth, signOut, onUserReady } from '../common.js';

document.getElementById('goLoginBtn').addEventListener('click', ()=> window.location.href = 'login.html');
document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await signOut(auth);
  window.location.href = 'index.html';
});

onUserReady((user, profile)=>{
  if(user){
    const displayName = user.displayName || user.email;
    document.getElementById('profileName').textContent = displayName;
    document.getElementById('profileHandle').textContent = user.email;
    document.getElementById('profileAvatar').textContent = displayName.charAt(0).toUpperCase();
    document.getElementById('profileLoggedOut').style.display = 'none';
    document.getElementById('profileLoggedIn').style.display = 'block';
    document.getElementById('dashWalletBalance').textContent = '৳' + Number(profile?.walletBalance || 0).toLocaleString('en-US');
    if(profile && profile.createdAt && profile.createdAt.toDate){
      document.getElementById('profileJoined').textContent = profile.createdAt.toDate().toLocaleDateString('bn-BD');
    }
  } else {
    document.getElementById('profileLoggedOut').style.display = 'block';
    document.getElementById('profileLoggedIn').style.display = 'none';
  }
});
