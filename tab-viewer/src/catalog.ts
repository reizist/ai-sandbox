import type { Catalog, CatalogArtist, CatalogSong } from './types';

let cached: Catalog | null = null;

export async function loadCatalog(opts?: { force?: boolean }): Promise<Catalog> {
  if (!opts?.force && cached) return cached;
  const res = await fetch('/tabs/catalog.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `Could not load catalog. Run \`npm run build:catalog\` first. (${res.status})`
    );
  }
  cached = (await res.json()) as Catalog;
  return cached;
}

/**
 * Subscribe to catalog updates. Polls catalog.json every `intervalMs` and
 * invokes `onChange` whenever `generatedAt` advances. Returns an unsubscribe
 * function. Errors are swallowed so a transient fetch failure doesn't kill
 * the polling loop.
 */
export function subscribeCatalog(
  onChange: (next: Catalog) => void,
  intervalMs = 15000
): () => void {
  let cancelled = false;
  let lastSeen = cached?.generatedAt ?? '';

  const tick = async () => {
    if (cancelled) return;
    try {
      const next = await loadCatalog({ force: true });
      if (next.generatedAt !== lastSeen) {
        lastSeen = next.generatedAt;
        onChange(next);
      }
    } catch { /* ignore — keep polling */ }
  };

  const id = window.setInterval(tick, intervalMs);
  // Refresh immediately when the tab regains focus (e.g. returning from another window).
  const onVis = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    cancelled = true;
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}

export function findArtist(catalog: Catalog, slug: string): CatalogArtist | undefined {
  return catalog.artists.find((a) => a.slug === slug);
}

export function findSong(
  artist: CatalogArtist | undefined,
  songSlug: string
): CatalogSong | undefined {
  return artist?.songs.find((s) => s.slug === songSlug);
}

/**
 * @deprecated Use src/paths.ts (preferredTabUrl + legacyTabUrl + resolveAssetUrl).
 * Kept temporarily so existing callers don't break during migration.
 */
export function tabSourceUrl(artistSlug: string, songSlug: string): string {
  return `/tabs/${encodeURIComponent(artistSlug)}/${encodeURIComponent(songSlug)}/source.gp`;
}
