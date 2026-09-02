import '../common.js';

document.getElementById('notifyLiveForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const email = document.getElementById('notifyLiveEmail').value.trim();
  const msg = document.getElementById('notifyLiveMsg');
  if(!email){
    msg.textContent = 'ইমেইল দিন।';
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'ধন্যবাদ! লাইভ স্ট্রিম চালু হলে জানিয়ে দেওয়া হবে।';
  msg.className = 'form-msg ok';
  e.target.reset();
});
