import { loadCollectionGrid, escapeHtml } from '../common.js';

const params = new URLSearchParams(window.location.search);
const category = params.get('category');

if(category){
  const titleEl = document.getElementById('videoGridTitle');
  if(titleEl) titleEl.innerHTML = `প্লেলিস্ট: <em>${escapeHtml(category)}</em>`;
}

loadCollectionGrid('videos', 'videoGrid', {
  type:'videos',
  emptyText: category ? 'এই প্লেলিস্টে এখনো কোনো ভিডিও নেই।' : 'এখনো কোনো ভিডিও যোগ করা হয়নি।',
  filterFn: category ? (v => v.category === category) : undefined
});
