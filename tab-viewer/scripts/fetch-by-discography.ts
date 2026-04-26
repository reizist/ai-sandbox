#!/usr/bin/env tsx
/**
 * Fetch tabs/chords for every track in an artist's MusicBrainz-derived
 * discography by *bulk-loading* the artist's entire Songsterr catalog
 * (one HTTP call per Songsterr-artistId) and matching titles locally.
 *
 * This is much higher recall than the previous per-track search, which
 * choked on JP romaji ↔ kana/kanji mismatches.
 *
 * Workflow:
 *   1. Read public/discographies/{artistSlug}.json
 *   2. Resolve Songsterr artistId(s) for the artist (search + aggregate)
 *   3. Pull each artistId's full song list
 *   4. Build a normalized title index across them all
 *   5. For each MB track, lookup. Fetch tab + chord if found, skipping
 *      already-on-disk files.
 *
 * Usage:
 *   npm run fetch:by-discography -- --artist "Spitz"
 *   npm run fetch:by-discography -- --artist "スピッツ" --aliases "Spitz" --limit 50
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchAndSaveSong } from './fetch-tab';
import { fetchSongsterrChordPage } from './songsterr/chord-fetcher';
import { loadArtistCorpus, lookup } from './songsterr/artist-songs';
import { slugify } from './lib/slug';
import type { MBDiscography } from './discography/musicbrainz';

const TABS_ROOT = 'public/tabs';
const SONG_URL = (id: number) => `https://www.songsterr.com/a/wsa/tab-s${id}`;
const CHORD_URL = (id: number) => `https://www.songsterr.com/a/wsa/song-chords-s${id}`;

interface CliArgs {
  artistSlug: string;
  artistName: string;
  aliases: string[];
  discographyPath: string;
  limit?: number;
  concurrency: number;
  delayMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  let name = '';
  let path = '';
  let limit: number | undefined;
  let concurrency = 3;
  let delay = 400;
  const aliases: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artist') name = argv[++i];
    else if (a === '--alias' || a === '--aliases') aliases.push(argv[++i]);
    else if (a === '--file') path = argv[++i];
    else if (a === '--limit') limit = Number(argv[++i]);
    else if (a === '--concurrency') concurrency = Number(argv[++i]);
    else if (a === '--delay') delay = Number(argv[++i]);
  }
  if (!name && !path) {
    throw new Error('Usage: tsx scripts/fetch-by-discography.ts --artist <name> [--alias <other-name>] [--limit N]');
  }
  const slug = name ? slugify(name) : '';
  return {
    artistSlug: slug,
    artistName: name,
    aliases,
    discographyPath: path || `public/discographies/${slug}.json`,
    limit,
    concurrency,
    delayMs: delay,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }

async function runWithConcurrency<T>(
  items: T[], concurrency: number, worker: (item: T, i: number) => Promise<void>
): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  }));
}

interface RunLogRow {
  title: string;
  status: 'ok' | 'no-match' | 'error' | 'skipped';
  matchedTitle?: string;
  matchedArtist?: string;
  tabSongId?: number;
  chordSongId?: number;
  error?: string;
  hasTab?: boolean;
  hasChords?: boolean;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.discographyPath, 'utf-8');
  const disc: MBDiscography = JSON.parse(raw);

  const tracks = args.limit ? disc.uniqueTracks.slice(0, args.limit) : disc.uniqueTracks;
  console.log(`Discography: ${disc.artist.name} — ${tracks.length} unique tracks (of ${disc.uniqueTracks.length})`);

  // 1. Build a Songsterr artist corpus (bulk fetch).
  console.log(`Resolving Songsterr artistId(s)…`);
  const corpus = await loadArtistCorpus(disc.artist.name, args.aliases);
  if (!corpus.candidates.length) {
    console.warn(`✗ No Songsterr artist match for "${disc.artist.name}". Aborting.`);
    process.exit(2);
  }
  for (const c of corpus.candidates) {
    console.log(`  candidate artistId=${c.artistId} "${c.artist}" (${c.hits} search hits)`);
  }
  console.log(`Loaded ${corpus.rows.length} Songsterr songs across ${corpus.candidates.length} artistId(s).`);

  // 2. Match + fetch.
  const log: RunLogRow[] = [];
  let okCount = 0, missCount = 0, errCount = 0;

  await runWithConcurrency(tracks, args.concurrency, async (track, i) => {
    if (i > 0) await sleep(args.delayMs);
    const row: RunLogRow = { title: track.title, status: 'no-match' };
    try {
      const m = lookup(corpus.index, track.title);
      if (!m || (!m.tabSongId && !m.chordSongId)) {
        missCount++;
        log.push(row);
        if (i % 25 === 0) console.log(`  · [${i + 1}/${tracks.length}] ${track.title}`);
        return;
      }
      row.matchedTitle = m.matchedTitle;
      row.matchedArtist = m.artistName;
      row.tabSongId = m.tabSongId;
      row.chordSongId = m.chordSongId;

      const artistSlug = slugify(disc.artist.name); // Use MB canonical name for our directory.
      const songSlug = slugify(track.title);

      // Tab fetch.
      if (m.tabSongId) {
        const tabPath = join(TABS_ROOT, artistSlug, songSlug, `${artistSlug}_${songSlug}.gp`);
        if (!(await exists(tabPath))) {
          await fetchAndSaveSong({
            url: SONG_URL(m.tabSongId),
            artistOverride: disc.artist.name,
            songOverride: track.title,
          });
        }
        row.hasTab = true;
      }

      // Chord fetch.
      if (m.chordSongId) {
        const chordPath = join(TABS_ROOT, artistSlug, songSlug, `${artistSlug}_${songSlug}.chords.json`);
        if (!(await exists(chordPath))) {
          const chord = await fetchSongsterrChordPage(CHORD_URL(m.chordSongId));
          const outDir = join(TABS_ROOT, artistSlug, songSlug);
          await mkdir(outDir, { recursive: true });
          await writeFile(chordPath, JSON.stringify(chord, null, 2));
          // Annotate manifest.
          const manifestPath = join(outDir, 'manifest.json');
          let manifest: any = {};
          try { manifest = JSON.parse(await readFile(manifestPath, 'utf-8')); } catch { /* missing ok */ }
          manifest = {
            ...manifest,
            artist: disc.artist.name,
            song: track.title,
            artistSlug, songSlug,
            hasChords: true,
            chordsSource: 'songsterr',
            chordsSourceUrl: CHORD_URL(m.chordSongId),
            chordsSongId: chord.meta.songId,
            chordsRevisionId: chord.meta.chordsRevisionId,
            chordsFetchedAt: new Date().toISOString(),
          };
          await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        }
        row.hasChords = true;
      }

      row.status = 'ok';
      okCount++;
      const flags = `${row.hasTab ? 'TAB' : '   '}${row.hasChords ? '+CHORD' : ''}`;
      console.log(`  ✓ [${i + 1}/${tracks.length}] ${track.title}  ${flags}  ← ${m.artistName}: ${m.matchedTitle}`);
    } catch (err: any) {
      row.status = 'error';
      row.error = err.message;
      errCount++;
      console.warn(`  ✗ [${i + 1}/${tracks.length}] ${track.title}: ${err.message}`);
    } finally {
      log.push(row);
    }
  });

  // Persist log.
  const logDir = `public/discographies`;
  await mkdir(logDir, { recursive: true });
  const logPath = join(logDir, `${args.artistSlug}.fetch-log.json`);
  await writeFile(logPath, JSON.stringify({
    artist: disc.artist.name,
    fetchedAt: new Date().toISOString(),
    songsterrCandidates: corpus.candidates,
    songsterrSongCount: corpus.rows.length,
    tracks: log,
  }, null, 2));

  console.log(`\nDone: ${okCount} ok, ${missCount} no-match, ${errCount} error → log: ${logPath}`);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
