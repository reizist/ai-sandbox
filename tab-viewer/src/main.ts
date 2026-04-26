import './style.css';
import { Router } from './router';
import { renderArtistList } from './views/artist-list';
import { renderSongList } from './views/song-list';
import { renderPlayer } from './views/player';

const view = document.getElementById('view') as HTMLElement;

const router = new Router()
  .on('/', () => renderArtistList(view))
  .on('/artist/:slug', ([slug]) => renderSongList(view, slug))
  .on('/song/:artistSlug/:songSlug', ([a, s]) => renderPlayer(view, a, s))
  .setNotFound(() => {
    view.innerHTML = `
      <section class="page">
        <p class="error">Page not found.</p>
        <p><a href="#/">← Back to artists</a></p>
      </section>`;
  });

router.start();
