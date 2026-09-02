import { db, doc, getDoc } from '../common.js';

async function loadAboutText(){
  const el = document.getElementById('aboutTextContent');
  if(!el) return;
  try{
    const cached = localStorage.getItem('aboutText');
    if(cached) el.textContent = cached;
  }catch(e){ /* ignore */ }
  try{
    const snap = await getDoc(doc(db, 'settings', 'homepage'));
    if(snap.exists()){
      const data = snap.data();
      if(data.aboutText){
        el.textContent = data.aboutText;
        try{ localStorage.setItem('aboutText', data.aboutText); }catch(e){}
      }
    }
  }catch(err){ console.error('loadAboutText error:', err); }
}
loadAboutText();
