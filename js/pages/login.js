import {
  auth, db, doc, setDoc, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
  onUserReady, signInWithGoogle
} from '../common.js';

/* Already logged in? Send them straight to their profile. */
onUserReady((user)=>{ if(user) window.location.href = 'profile.html'; });

function authErrorMessage(err){
  const map = {
    'auth/email-already-in-use': 'An account already exists with this email.',
    'auth/invalid-email': 'Enter a valid email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts, please try again later.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed, please try again.',
    'auth/cancelled-popup-request': 'The previous attempt is still in progress, please wait a moment.',
    'auth/popup-blocked': 'Your browser blocked the pop-up — allow pop-ups and try again.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using a different method (e.g. email/password). Please log in that way.',
  };
  return map[err.code] || 'Something went wrong, please try again.';
}

document.getElementById('googleSignInBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('googleSignInBtn');
  const msg = document.getElementById('googleSignInMsg');
  btn.disabled = true;
  msg.textContent = 'Signing in with Google...';
  msg.className = 'form-msg';
  try{
    await signInWithGoogle();
    msg.textContent = 'Logged in successfully!';
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
    document.getElementById('authTitle').textContent = tab === 'login' ? 'Log In' : 'Create New Account';
    document.getElementById('authSubtitle').textContent = tab === 'login'
      ? 'Log in to your account to track orders and get exclusive offers.'
      : 'Create a free account to buy courses/products and send support tickets.';
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
    msg.textContent = 'Fill in all fields correctly (password must be at least 6 characters).';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'Creating account...';
  msg.className = 'form-msg';
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, phone, email, role: 'user', createdAt: serverTimestamp()
    });
    msg.textContent = 'Account created! Welcome.';
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
    msg.textContent = 'Please fill in all fields.';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'Logging in...';
  msg.className = 'form-msg';
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    msg.textContent = 'Logged in successfully!';
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
  document.getElementById('authTitle').textContent = 'Reset Password';
  document.getElementById('authSubtitle').textContent = 'No worries, we\'ll send you a reset link.';
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
    msg.textContent = 'Enter an email.';
    msg.className = 'form-msg err';
    return;
  }
  btn.disabled = true;
  msg.textContent = 'Sending...';
  msg.className = 'form-msg';
  try{
    await sendPasswordResetEmail(auth, email);
    msg.textContent = `If an account exists with ${email}, a reset link has been sent. Check your inbox (and spam folder).`;
    msg.className = 'form-msg ok';
  }catch(err){
    console.error('password reset error:', err);
    if(err.code === 'auth/invalid-email'){
      msg.textContent = 'Enter a valid email.';
      msg.className = 'form-msg err';
    } else if(err.code === 'auth/too-many-requests'){
      msg.textContent = 'Too many attempts, please try again later.';
      msg.className = 'form-msg err';
    } else if(err.code === 'auth/user-not-found'){
      /* Don't reveal whether the account exists — same message as success. */
      msg.textContent = `If an account exists with ${email}, a reset link has been sent. Check your inbox (and spam folder).`;
      msg.className = 'form-msg ok';
    } else {
      msg.textContent = 'Could not send, please try again.';
      msg.className = 'form-msg err';
    }
  }finally{
    btn.disabled = false;
  }
});
