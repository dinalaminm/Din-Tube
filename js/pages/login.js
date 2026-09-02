import {
  auth, db, doc, setDoc, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
  onUserReady, signInWithGoogle
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
    'auth/popup-closed-by-user': 'গুগল সাইন-ইন উইন্ডো বন্ধ হয়ে গেছে, আবার চেষ্টা করুন।',
    'auth/cancelled-popup-request': 'আগের চেষ্টা এখনো চলছে, একটু অপেক্ষা করুন।',
    'auth/popup-blocked': 'ব্রাউজার পপ-আপ ব্লক করেছে, পপ-আপ অনুমতি দিয়ে আবার চেষ্টা করুন।',
    'auth/account-exists-with-different-credential': 'এই ইমেইল দিয়ে আগে থেকেই অন্য পদ্ধতিতে অ্যাকাউন্ট আছে (যেমন ইমেইল-পাসওয়ার্ড)। সেভাবে লগ ইন করুন।',
  };
  return map[err.code] || 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।';
}

document.getElementById('googleSignInBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('googleSignInBtn');
  const msg = document.getElementById('googleSignInMsg');
  btn.disabled = true;
  msg.textContent = 'গুগল দিয়ে সাইন-ইন হচ্ছে...';
  msg.className = 'form-msg';
  try{
    await signInWithGoogle();
    msg.textContent = 'সফলভাবে লগ ইন হয়েছে!';
    msg.className = 'form-msg ok';
    setTimeout(()=> window.location.href = 'profile.html', 400);
  }catch(err){
    msg.textContent = authErrorMessage(err);
    msg.className = 'form-msg err';
    console.error('google sign-in error:', err);
    btn.disabled = false;
  }
});

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

document.getElementById('forgotPassLink').addEventListener('click', (e)=>{
  e.preventDefault();
  document.getElementById('authTabsWrap').style.display = 'none';
  document.getElementById('googleAuthBlock').style.display = 'none';
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('forgotPasswordPanel').style.display = 'block';
  document.getElementById('authTitle').textContent = 'পাসওয়ার্ড রিসেট করুন';
  document.getElementById('authSubtitle').textContent = 'চিন্তা নেই, আমরা রিসেট লিংক পাঠিয়ে দেব।';
  const emailField = document.getElementById('forgotEmail');
  const prefill = document.getElementById('loginId').value.trim();
  if(prefill) emailField.value = prefill;
  emailField.focus();
});

document.getElementById('backToLoginLink').addEventListener('click', (e)=>{
  e.preventDefault();
  document.getElementById('forgotPasswordPanel').style.display = 'none';
  document.getElementById('forgotPassMsg').textContent = '';
  document.getElementById('forgotPassMsg').className = 'form-msg';
  document.getElementById('authTabsWrap').style.display = 'flex';
  document.getElementById('googleAuthBlock').style.display = 'block';
  document.getElementById('loginForm').style.display = 'block';
  document.querySelector('.auth-tab[data-authtab="login"]').click();
});

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  const msg = document.getElementById('forgotPassMsg');
  const btn = document.getElementById('forgotSubmitBtn');
  if(!email){
    msg.textContent = 'ইমেইল দিন।';
    msg.className = 'form-msg err';
    return;
  }
  btn.disabled = true;
  msg.textContent = 'পাঠানো হচ্ছে...';
  msg.className = 'form-msg';
  try{
    await sendPasswordResetEmail(auth, email);
    msg.textContent = `${email} ঠিকানায় একটা অ্যাকাউন্ট থাকলে, রিসেট লিংক পাঠানো হয়েছে। ইনবক্স (এবং স্প্যাম ফোল্ডার) দেখুন।`;
    msg.className = 'form-msg ok';
  }catch(err){
    console.error('password reset error:', err);
    if(err.code === 'auth/invalid-email'){
      msg.textContent = 'সঠিক ইমেইল দিন।';
      msg.className = 'form-msg err';
    } else if(err.code === 'auth/too-many-requests'){
      msg.textContent = 'অনেকবার চেষ্টা হয়েছে, একটু পরে আবার চেষ্টা করুন।';
      msg.className = 'form-msg err';
    } else if(err.code === 'auth/user-not-found'){
      /* Don't reveal whether the account exists — same message as success. */
      msg.textContent = `${email} ঠিকানায় একটা অ্যাকাউন্ট থাকলে, রিসেট লিংক পাঠানো হয়েছে। ইনবক্স (এবং স্প্যাম ফোল্ডার) দেখুন।`;
      msg.className = 'form-msg ok';
    } else {
      msg.textContent = 'পাঠানো যায়নি, আবার চেষ্টা করুন।';
      msg.className = 'form-msg err';
    }
  }finally{
    btn.disabled = false;
  }
});
