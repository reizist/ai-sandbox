import { findArtist, loadCatalog, subscribeCatalog } from '../catalog';
import { escapeHtml } from '../router';
import type { CatalogSong } from '../types';

let unsubscribe: (() => void) | null = null;

export async function renderSongList(
  view: HTMLElement,
  artistSlug: string
): Promise<void> {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  view.innerHTML = `<div class="loading">Loading…</div>`;
  const catalog = await loadCatalog();
  const artist = findArtist(catalog, artistSlug);

  if (!artist) {
    view.innerHTML = `
      <section class="page">
        <p class="error">Unknown artist: ${escapeHtml(artistSlug)}</p>
        <p><a href="#/">← Back to artists</a></p>
      </section>`;
    return;
  }

  view.innerHTML = `
    <section class="page song-list">
      <nav class="breadcrumb">
        <a href="#/">Artists</a> / <span>${escapeHtml(artist.name)}</span>
      </nav>
      <header class="page-header">
        <h2>${escapeHtml(artist.name)}</h2>
        <p class="muted">${artist.songs.length} songs</p>
        <input id="search" type="search" placeholder="Filter by song title…" autofocus />
      </header>
      <ul id="results" class="card-list"></ul>
    </section>
  `;

  const search = view.querySelector<HTMLInputElement>('#search')!;
  const results = view.querySelector<HTMLUListElement>('#results')!;

  const draw = (filtered: CatalogSong[]) => {
    if (filtered.length === 0) {
      results.innerHTML = `<li class="empty">No matches</li>`;
      return;
    }
    results.innerHTML = filtered
      .map((s) => {
        const badges = [
          s.hasTab    ? '<span class="pill pill-tab">TAB</span>' : '',
          s.hasChords ? '<span class="pill pill-chord">CHORD</span>' : '',
          s.hasVideos ? '<span class="pill pill-video">VIDEO</span>' : '',
        ].filter(Boolean).join('');
        const meta = [
          s.trackCount ? `${s.trackCount} tracks` : '',
          s.songId ? `songId ${s.songId}` : '',
        ].filter(Boolean).join(' · ');
        return `
        <li class="card">
          <a href="#/song/${encodeURIComponent(artist.slug)}/${encodeURIComponent(s.slug)}">
            <span class="card-title">${escapeHtml(s.title)} ${badges}</span>
            <span class="card-meta">${meta}</span>
          </a>
        </li>`;
      })
      .join('');
  };

  let songs = artist.songs;

  const applyFilter = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { draw(songs); return; }
    draw(songs.filter((s) => s.title.toLowerCase().includes(q)));
  };

  draw(songs);
  search.addEventListener('input', applyFilter);

  // Live-update: when catalog.json changes (background fetch landed), pick up
  // newly-available songs for this artist without forcing a manual reload.
  unsubscribe = subscribeCatalog((next) => {
    const updated = findArtist(next, artistSlug);
    if (!updated) return;
    songs = updated.songs;
    const meta = view.querySelector<HTMLParagraphElement>('.muted');
    if (meta) meta.textContent = `${songs.length} songs`;
    applyFilter();
  }, 10000);
}
