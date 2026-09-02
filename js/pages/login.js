import {
  auth, db, doc, setDoc, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
  onUserReady
} from '../common.js';

/* Already logged in? Send them straight to their profile. */
onUserReady((user)=>{ if(user) window.location.href = 'profile.html'; });

function authErrorMessage(err){
  const map = {
    'auth/email-already-in-use': 'এই ইমেইল দিয়ে আগে থেকেই অ্যাকাউন্ট আছে।',
    'auth/invalid-email': 'সঠিক ইমেইল দিন।',
    'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে।',
    'auth/user-not-found': 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।',
    'auth/wrong-password': 'পাসওয়ার্ড ভুল হয়েছে।',
    'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল।',
    'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, একটু পরে আবার চেষ্টা করুন।',
  };
  return map[err.code] || 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।';
}

document.querySelectorAll('.auth-tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.auth-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.authtab;
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('authTitle').textContent = tab === 'login' ? 'লগ ইন করুন' : 'নতুন অ্যাকাউন্ট তৈরি করুন';
    document.getElementById('authSubtitle').textContent = tab === 'login'
      ? 'আপনার একাউন্টে প্রবেশ করে অর্ডার ট্র্যাক করুন ও এক্সক্লুসিভ অফার পান।'
      : 'একটা ফ্রি অ্যাকাউন্ট তৈরি করুন কোর্স-প্রোডাক্ট কিনতে ও সাপোর্ট টিকিট পাঠাতে।';
  });
});

document.getElementById('registerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  const msg = document.getElementById('registerMsg');
  if(!name || !phone || !email || pass.length < 6){
    msg.textContent = 'সব ফিল্ড সঠিকভাবে পূরণ করুন (পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার)।';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'অ্যাকাউন্ট তৈরি হচ্ছে...';
  msg.className = 'form-msg';
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, phone, email, role: 'user', createdAt: serverTimestamp()
    });
    msg.textContent = 'অ্যাকাউন্ট তৈরি হয়েছে! স্বাগতম।';
    msg.className = 'form-msg ok';
    setTimeout(()=> window.location.href = 'profile.html', 500);
  }catch(err){
    msg.textContent = authErrorMessage(err);
    msg.className = 'form-msg err';
    console.error(err);
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginId').value.trim();
  const pass = document.getElementById('loginPass').value;
  const msg = document.getElementById('loginMsg');
  if(!email || !pass){
    msg.textContent = 'সব ফিল্ড পূরণ করুন।';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'লগ ইন হচ্ছে...';
  msg.className = 'form-msg';
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    msg.textContent = 'সফলভাবে লগ ইন হয়েছে!';
    msg.className = 'form-msg ok';
    setTimeout(()=> window.location.href = 'profile.html', 500);
  }catch(err){
    msg.textContent = authErrorMessage(err);
    msg.className = 'form-msg err';
    console.error(err);
  }
});

document.getElementById('forgotPassLink').addEventListener('click', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginId').value.trim();
  const msg = document.getElementById('loginMsg');
  if(!email){
    msg.textContent = 'পাসওয়ার্ড রিসেট করতে আগে ইমেইল লিখুন।';
    msg.className = 'form-msg err';
    return;
  }
  try{
    await sendPasswordResetEmail(auth, email);
    msg.textContent = 'পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে।';
    msg.className = 'form-msg ok';
  }catch(err){
    msg.textContent = authErrorMessage(err);
    msg.className = 'form-msg err';
  }
});
