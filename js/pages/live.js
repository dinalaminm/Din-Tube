import '../common.js';

document.getElementById('notifyLiveForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const email = document.getElementById('notifyLiveEmail').value.trim();
  const msg = document.getElementById('notifyLiveMsg');
  if(!email){
    msg.textContent = 'Enter an email.';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'Thank you! We\'ll notify you when the live stream starts.';
  msg.className = 'form-msg ok';
  e.target.reset();
});
