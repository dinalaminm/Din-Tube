import '../common.js';

document.getElementById('playStoreBtn').addEventListener('click', ()=>{
  document.getElementById('downloadMsg').textContent = 'অ্যাপ শীঘ্রই Google Play-তে লঞ্চ হচ্ছে।';
});
document.getElementById('appStoreBtn').addEventListener('click', ()=>{
  document.getElementById('downloadMsg').textContent = 'অ্যাপ শীঘ্রই App Store-এ লঞ্চ হচ্ছে।';
});
