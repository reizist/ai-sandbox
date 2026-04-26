import { loadCatalog, subscribeCatalog } from '../catalog';
import { escapeHtml } from '../router';
import type { Catalog, CatalogArtist } from '../types';

let unsubscribe: (() => void) | null = null;

export async function renderArtistList(view: HTMLElement): Promise<void> {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  view.innerHTML = `<div class="loading">Loading…</div>`;
  const catalog = await loadCatalog();

  view.innerHTML = `
    <section class="page artist-list">
      <header class="page-header">
        <h2>Artists</h2>
        <p class="muted" id="meta"></p>
        <input id="search" type="search" placeholder="Filter by artist name…" autofocus />
      </header>
      <ul id="results" class="card-list"></ul>
      <div id="live-tag" class="live-tag" title="catalog.json は自動再読み込み中"></div>
    </section>
  `;

  const search = view.querySelector<HTMLInputElement>('#search')!;
  const results = view.querySelector<HTMLUListElement>('#results')!;
  const meta = view.querySelector<HTMLParagraphElement>('#meta')!;
  const liveTag = view.querySelector<HTMLDivElement>('#live-tag')!;

  let current: Catalog = catalog;

  const draw = (filtered: CatalogArtist[]) => {
    if (filtered.length === 0) {
      results.innerHTML = `<li class="empty">No matches</li>`;
      return;
    }
    results.innerHTML = filtered
      .map((a) => {
        const tabCount = a.songs.filter((s) => s.hasTab).length;
        const chordCount = a.songs.filter((s) => s.hasChords).length;
        return `
        <li class="card">
          <a href="#/artist/${encodeURIComponent(a.slug)}">
            <span class="card-title">${escapeHtml(a.name)}</span>
            <span class="card-meta">${a.songs.length} songs · ${tabCount} TAB · ${chordCount} CHORD</span>
          </a>
        </li>`;
      })
      .join('');
  };

  const refreshMeta = () => {
    const totalSongs = current.artists.reduce((s, a) => s + a.songs.length, 0);
    const ts = current.generatedAt ? new Date(current.generatedAt).toLocaleTimeString() : '';
    meta.textContent = `${current.artists.length} artists, ${totalSongs} songs${ts ? ` · updated ${ts}` : ''}`;
  };

  const applyFilter = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { draw(current.artists); return; }
    draw(current.artists.filter((a) => a.name.toLowerCase().includes(q)));
  };

  refreshMeta();
  draw(current.artists);
  search.addEventListener('input', applyFilter);

  // Live-update: poll catalog.json so newly collected artists/songs appear
  // automatically while a fetch script runs in the background.
  unsubscribe = subscribeCatalog((next) => {
    current = next;
    refreshMeta();
    applyFilter();
    liveTag.textContent = '✦ updated';
    liveTag.classList.add('flash');
    setTimeout(() => liveTag.classList.remove('flash'), 1200);
  }, 10000);
}
