#!/usr/bin/env tsx
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const TABS_ROOT = 'public/tabs';

interface YoutubeRef {
  videoId: string;
  title: string;
  channel: string;
  duration?: string;
  views?: string;
  url: string;
  embedUrl: string;
}

interface Manifest {
  artist: string;
  song: string;
  artistSlug?: string;
  songSlug?: string;
  source?: string;
  sourceUrl?: string;
  songId?: number;
  revisionId?: number;
  trackCount?: number;
  fetchedAt?: string;
  hasChords?: boolean;
  chordsSourceUrl?: string;
  chordsSongId?: number;
  youtubeRefs?: YoutubeRef[];
  originalArtist?: string;
}

interface CatalogSong {
  slug: string;
  title: string;
  hasTab: boolean;
  hasChords: boolean;
  hasVideos?: boolean;
  songId?: number;
  revisionId?: number;
  source?: string;
  sourceUrl?: string;
  trackCount?: number;
  fetchedAt?: string;
  chordsSourceUrl?: string;
  youtubeRefs?: YoutubeRef[];
  originalArtist?: string;
}

interface CatalogArtist {
  slug: string;
  name: string;
  songs: CatalogSong[];
}

interface Catalog {
  generatedAt: string;
  artists: CatalogArtist[];
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function readManifest(path: string): Promise<Manifest | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function buildCatalog(): Promise<Catalog> {
  const artistDirs = await listDirs(TABS_ROOT);
  const artists: CatalogArtist[] = [];

  for (const artistSlug of artistDirs) {
    const artistPath = join(TABS_ROOT, artistSlug);
    const songDirs = await listDirs(artistPath);
    const songs: CatalogSong[] = [];
    let displayName = artistSlug;

    for (const songSlug of songDirs) {
      const manifest = await readManifest(
        join(artistPath, songSlug, 'manifest.json')
      );
      if (!manifest) continue;
      // Detect both the new {artist}_{song} naming and the legacy filenames.
      const tabPreferred = join(artistPath, songSlug, `${artistSlug}_${songSlug}.gp`);
      const tabLegacy = join(artistPath, songSlug, 'source.gp');
      const chordsPreferred = join(artistPath, songSlug, `${artistSlug}_${songSlug}.chords.json`);
      const chordsLegacy = join(artistPath, songSlug, 'chords.json');
      const hasTab = (await fileExists(tabPreferred)) || (await fileExists(tabLegacy));
      const hasChords = (await fileExists(chordsPreferred)) || (await fileExists(chordsLegacy));
      const youtubeRefs = manifest.youtubeRefs;
      const hasVideos = !!youtubeRefs && youtubeRefs.length > 0;
      if (!hasTab && !hasChords && !hasVideos) continue;

      displayName = manifest.artist;
      songs.push({
        slug: songSlug,
        title: manifest.song,
        hasTab,
        hasChords,
        hasVideos,
        songId: manifest.songId,
        revisionId: manifest.revisionId,
        source: manifest.source,
        sourceUrl: manifest.sourceUrl,
        trackCount: manifest.trackCount,
        fetchedAt: manifest.fetchedAt,
        chordsSourceUrl: manifest.chordsSourceUrl,
        youtubeRefs,
        originalArtist: manifest.originalArtist,
      });
    }

    if (songs.length === 0) continue;
    songs.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    artists.push({ slug: artistSlug, name: displayName, songs });
  }

  artists.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return { generatedAt: new Date().toISOString(), artists };
}

async function main() {
  const catalog = await buildCatalog();
  const outPath = join(TABS_ROOT, 'catalog.json');
  await writeFile(outPath, JSON.stringify(catalog, null, 2));
  const totalSongs = catalog.artists.reduce(
    (sum, a) => sum + a.songs.length,
    0
  );
  console.log(
    `✓ Catalog written to ${outPath}: ${catalog.artists.length} artists, ${totalSongs} songs`
  );
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
