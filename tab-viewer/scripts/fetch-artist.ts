#!/usr/bin/env tsx
import { stat, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchAndSaveSong } from './fetch-tab';
import { fetchSongsterrChordPage } from './songsterr/chord-fetcher';
import { slugify } from './lib/slug';

const ARTIST_URL_BY_ID = (id: number) =>
  `https://www.songsterr.com/a/wsa/artist-tabs-a${id}`;

const SONG_URL_BY_ID = (id: number) =>
  `https://www.songsterr.com/a/wsa/tab-s${id}`;

const CHORD_URL_BY_ID = (id: number) =>
  `https://www.songsterr.com/a/wsa/song-chords-s${id}`;

const TABS_ROOT = 'public/tabs';

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
};

interface SongstrerArtistSong {
  songId: number;
  title: string;
  artist: string;
  hasPlayer?: boolean;
  hasChords?: boolean;
}

async function fetchArtistSongList(
  artistId: number
): Promise<{ artistName: string; songs: SongstrerArtistSong[] }> {
  const url = ARTIST_URL_BY_ID(artistId);
  const res = await fetch(url, { headers: browserHeaders });
  if (!res.ok) {
    throw new Error(`Artist page fetch failed: ${res.status}`);
  }
  const html = await res.text();
  const m = html.match(
    /<script[^>]*id=["']state["'][^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) throw new Error('No state script in artist page');
  const state = JSON.parse(m[1].trim());
  const list = state?.artist?.songs?.list;
  if (!Array.isArray(list)) {
    throw new Error('Artist song list not found at .artist.songs.list');
  }
  const songs: SongstrerArtistSong[] = list
    .filter(
      (s: any) =>
        typeof s?.songId === 'number' &&
        typeof s?.title === 'string' &&
        s?.hasPlayer !== false
    )
    .map((s: any) => ({
      songId: s.songId,
      title: s.title,
      artist: s.artist,
      hasPlayer: s.hasPlayer,
      hasChords: s.hasChords
    }));
  const artistName = list.find((s: any) => s?.artist)?.artist ?? `artist-${artistId}`;
  return { artistName, songs };
}

interface CliArgs {
  artistId: number;
  limit?: number;
  concurrency: number;
  delayMs: number;
  withChords: boolean;
  skipExisting: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { concurrency: 3, delayMs: 250, withChords: true, skipExisting: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id') args.artistId = Number(argv[++i]);
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--delay') args.delayMs = Number(argv[++i]);
    else if (a === '--no-chords') args.withChords = false;
    else if (a === '--force') args.skipExisting = false;
  }
  if (!args.artistId || Number.isNaN(args.artistId)) {
    throw new Error(
      'Usage: tsx scripts/fetch-artist.ts --id <songsterr-artist-id> [--limit N] [--concurrency 3] [--delay 250]'
    );
  }
  return args as CliArgs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Fetching artist song list (id=${args.artistId})…`);
  const { artistName, songs } = await fetchArtistSongList(args.artistId);
  const limited = args.limit ? songs.slice(0, args.limit) : songs;
  console.log(
    `Artist: ${artistName} — ${songs.length} songs total, downloading ${limited.length}`
  );

  type Outcome =
    | { ok: true; title: string; bytes: number; warnings: number }
    | { ok: false; title: string; error: string };

  const outcomes = await runWithConcurrency<SongstrerArtistSong, Outcome>(
    limited,
    args.concurrency,
    async (song, i) => {
      if (i > 0) await sleep(args.delayMs);
      const artistSlug = slugify(song.artist || artistName);
      const songSlug = slugify(song.title);
      const tabPath = join(TABS_ROOT, artistSlug, songSlug, `${artistSlug}_${songSlug}.gp`);
      try {
        let bytes = 0, warnings = 0;
        if (args.skipExisting && (await exists(tabPath))) {
          console.log(`  • [${i + 1}/${limited.length}] ${song.title}: tab exists, skipping`);
        } else {
          const result = await fetchAndSaveSong({
            url: SONG_URL_BY_ID(song.songId),
            artistOverride: song.artist || artistName,
            songOverride: song.title
          });
          bytes = result.bytes;
          warnings = result.warnings;
          console.log(
            `  ✓ [${i + 1}/${limited.length}] ${result.song} (${(result.bytes / 1024).toFixed(0)} KB${result.warnings ? `, ${result.warnings} warnings` : ''})`
          );
        }

        // Chord-page fetch (best effort; failures don't stop the run).
        if (args.withChords && song.hasChords) {
          const chordPath = join(TABS_ROOT, artistSlug, songSlug, `${artistSlug}_${songSlug}.chords.json`);
          if (args.skipExisting && (await exists(chordPath))) {
            // already there, no-op
          } else {
            try {
              const chord = await fetchSongsterrChordPage(CHORD_URL_BY_ID(song.songId));
              const outDir = join(TABS_ROOT, artistSlug, songSlug);
              await mkdir(outDir, { recursive: true });
              await writeFile(chordPath, JSON.stringify(chord, null, 2));
              // Update manifest hasChords flag if manifest exists.
              const manifestPath = join(outDir, 'manifest.json');
              try {
                const m = JSON.parse(await readFile(manifestPath, 'utf-8'));
                m.hasChords = true;
                m.chordsSource = 'songsterr';
                m.chordsSourceUrl = CHORD_URL_BY_ID(song.songId);
                m.chordsSongId = chord.meta.songId;
                m.chordsRevisionId = chord.meta.chordsRevisionId;
                m.chordsFetchedAt = new Date().toISOString();
                await writeFile(manifestPath, JSON.stringify(m, null, 2));
              } catch { /* manifest may not exist if tab fetch failed */ }
              console.log(`     chord page: ${chord.lines.length} lines, ${chord.uniqueChords.length} chords`);
            } catch (chErr: any) {
              console.warn(`     chord fetch failed: ${chErr.message}`);
            }
          }
        }
        return { ok: true, title: song.title, bytes, warnings };
      } catch (err: any) {
        console.warn(
          `  ✗ [${i + 1}/${limited.length}] ${song.title}: ${err.message}`
        );
        return { ok: false, title: song.title, error: err.message };
      }
    }
  );

  const successes = outcomes.filter((o) => o.ok).length;
  const failures = outcomes.filter((o) => !o.ok).length;
  console.log(`\nDone: ${successes} succeeded, ${failures} failed`);
  if (failures > 0) {
    console.log('Failed songs:');
    outcomes.forEach((o) => {
      if (!o.ok) console.log(`  - ${o.title}: ${o.error}`);
    });
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
