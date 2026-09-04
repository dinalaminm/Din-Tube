import { getFavorites, renderCard } from '../common.js';

function render(){
  const grid = document.getElementById('wishlistGrid');
  const empty = document.getElementById('wishlistEmpty');
  const favorites = getFavorites();

  if(favorites.length === 0){
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = '';
  favorites.forEach((item, i)=> grid.appendChild(renderCard(item.type, item, i)));
}

render();

/* Re-render right after a card's heart icon is clicked on this page (removing
   it from favorites here should drop it out of the grid immediately). */
document.getElementById('wishlistGrid').addEventListener('click', (e)=>{
  if(e.target.closest('.fav-btn')) setTimeout(render, 0);
});
