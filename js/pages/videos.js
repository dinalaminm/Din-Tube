import { loadCollectionGrid, escapeHtml } from '../common.js';

const params = new URLSearchParams(window.location.search);
const category = params.get('category');

if(category){
  const titleEl = document.getElementById('videoGridTitle');
  if(titleEl) titleEl.innerHTML = `Playlist: <em>${escapeHtml(category)}</em>`;
}

loadCollectionGrid('videos', 'videoGrid', {
  type:'videos',
  emptyText: category ? 'No videos in this playlist yet.' : 'No videos added yet.',
  filterFn: category ? (v => v.category === category) : undefined
});
