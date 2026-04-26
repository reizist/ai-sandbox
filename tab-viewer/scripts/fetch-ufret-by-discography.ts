#!/usr/bin/env tsx
/**
 * Pull chord+lyric data from U-FRET for every MusicBrainz-discography track
 * we can match. U-FRET is the high-coverage chord source for J-pop; Songsterr
 * is sparse for Japanese artists (< 5% chord coverage).
 *
 * Workflow:
 *   1. Read public/discographies/{artistSlug}.json
 *   2. List U-FRET songs for the artist (one HTTP call → ~50–500 entries)
 *   3. Dedupe (prefer full chord ver. over 簡単 / ウクレレ)
 *   4. Build local title index
 *   5. For each MB track: lookup, fetch song page, save as
 *      `{artistSlug}_{songSlug}.chords.json`. Skip if file already exists.
 *
 * Usage:
 *   npm run fetch:ufret -- --artist "スピッツ"
 *   npm run fetch:ufret -- --artist "Mr.Children" --aliases "ミスチル"
 *   npm run fetch:ufret -- --artist "スピッツ" --limit 50
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listUfretArtistSongs, dedupeUfretSongs, groupUfretByTitle, type UfretSongRow } from './ufret/artist-fetcher';
import { fetchUfretSong } from './ufret/song-fetcher';
import { slugify } from './lib/slug';
import type { MBDiscography } from './discography/musicbrainz';

const TABS_ROOT = 'public/tabs';
const SONG_URL = (id: number) => `https://www.ufret.jp/song.php?data=${id}`;

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
  let concurrency = 2;
  let delay = 800; // be polite to U-FRET
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
    throw new Error('Usage: tsx scripts/fetch-ufret-by-discography.ts --artist <name> [--alias <other>] [--limit N]');
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

function titleVariants(title: string): string[] {
  const out = new Set<string>();
  const base = title.trim();
  const lower = base.toLowerCase();
  const noParen = lower
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+feat\.?\s.*$/i, '')
    .trim();
  const stripped = noParen.replace(/[\p{P}\p{S}\s]+/gu, '');
  const noArticle = stripped.replace(/^(the|a|an)/, '');
  for (const v of [base, lower, noParen, stripped, noArticle]) if (v) out.add(v);
  return Array.from(out);
}

function buildIndex(groups: UfretSongRow[][]): Map<string, UfretSongRow[]> {
  const idx = new Map<string, UfretSongRow[]>();
  for (const group of groups) {
    if (!group.length) continue;
    for (const k of titleVariants(group[0].title)) {
      if (!idx.has(k)) idx.set(k, group);
    }
  }
  return idx;
}

interface RunLogRow {
  title: string;
  status: 'ok' | 'no-match' | 'error' | 'skipped';
  matchedTitle?: string;
  ufretSongId?: number;
  error?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.discographyPath, 'utf-8');
  const disc: MBDiscography = JSON.parse(raw);
  const tracks = args.limit ? disc.uniqueTracks.slice(0, args.limit) : disc.uniqueTracks;
  console.log(`Discography: ${disc.artist.name} — ${tracks.length} unique tracks (of ${disc.uniqueTracks.length})`);

  // 1. List U-FRET catalog for this artist (try primary name + aliases).
  const queries = [disc.artist.name, ...args.aliases];
  const seenSongIds = new Set<number>();
  const allRows: UfretSongRow[] = [];
  for (const q of queries) {
    try {
      console.log(`U-FRET artist page: ${q}`);
      const list = await listUfretArtistSongs(q);
      console.log(`  ${list.songs.length} entries`);
      for (const r of list.songs) {
        if (!seenSongIds.has(r.songId)) {
          seenSongIds.add(r.songId);
          allRows.push(r);
        }
      }
      await sleep(800);
    } catch (err) {
      console.warn(`  ✗ ${q}: ${(err as Error).message}`);
    }
  }
  if (!allRows.length) {
    console.error('✗ No U-FRET songs found for this artist.');
    process.exit(2);
  }
  const groups = groupUfretByTitle(allRows);
  const dedupedCount = groups.length;
  console.log(`  total ${allRows.length} → ${dedupedCount} unique titles (each with ranked candidates)`);
  const index = buildIndex(groups);

  // 2. Match + fetch (per track).
  const log: RunLogRow[] = [];
  let okCount = 0, missCount = 0, errCount = 0, skipCount = 0;

  await runWithConcurrency(tracks, args.concurrency, async (track, i) => {
    if (i > 0) await sleep(args.delayMs);
    const row: RunLogRow = { title: track.title, status: 'no-match' };
    try {
      let candidates: UfretSongRow[] | undefined;
      for (const k of titleVariants(track.title)) {
        const v = index.get(k);
        if (v) { candidates = v; break; }
      }
      if (!candidates || !candidates.length) {
        missCount++;
        log.push(row);
        return;
      }

      const artistSlug = slugify(disc.artist.name);
      const songSlug = slugify(track.title);
      const outDir = join(TABS_ROOT, artistSlug, songSlug);
      const chordPath = join(outDir, `${artistSlug}_${songSlug}.chords.json`);
      if (await exists(chordPath)) {
        row.status = 'skipped';
        skipCount++;
        row.matchedTitle = candidates[0].title;
        row.ufretSongId = candidates[0].songId;
        log.push(row);
        return;
      }

      // Try each candidate in preference order until parsing succeeds. The
      // older "原曲" pages render chords via JS and produce zero parsed lines;
      // the simplified-version pages render them as static HTML.
      let result: Awaited<ReturnType<typeof fetchUfretSong>> | undefined;
      let pickedHit: UfretSongRow | undefined;
      let lastErr: Error | undefined;
      for (const cand of candidates) {
        try {
          result = await fetchUfretSong(cand.songId);
          pickedHit = cand;
          break;
        } catch (err) {
          lastErr = err as Error;
          await sleep(args.delayMs);
        }
      }
      if (!result || !pickedHit) {
        throw lastErr ?? new Error('all U-FRET candidates failed to parse');
      }

      row.matchedTitle = pickedHit.title;
      row.ufretSongId = pickedHit.songId;
      const hit = pickedHit;
      await mkdir(outDir, { recursive: true });
      await writeFile(chordPath, JSON.stringify(result.chordsFile, null, 2));

      // Update / create manifest with U-FRET source markers.
      const manifestPath = join(outDir, 'manifest.json');
      let m: any = {};
      try { m = JSON.parse(await readFile(manifestPath, 'utf-8')); } catch { /* fresh */ }
      m = {
        ...m,
        artist: m.artist ?? disc.artist.name,
        song: m.song ?? track.title,
        artistSlug, songSlug,
        hasChords: true,
        chordsSource: 'ufret',
        chordsSourceUrl: SONG_URL(hit.songId),
        chordsUfretSongId: hit.songId,
        chordsUfretVariant: result.meta.variant,
        chordsUfretCapo: result.meta.capo,
        chordsFetchedAt: new Date().toISOString(),
      };
      await writeFile(manifestPath, JSON.stringify(m, null, 2));

      row.status = 'ok';
      okCount++;
      console.log(`  ✓ [${i + 1}/${tracks.length}] ${track.title}  ← ufret/${hit.songId}: ${hit.title}`);
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
  const logPath = join(logDir, `${args.artistSlug}.ufret-log.json`);
  await writeFile(logPath, JSON.stringify({
    artist: disc.artist.name,
    fetchedAt: new Date().toISOString(),
    ufretSongCount: dedupedCount,
    tracks: log,
  }, null, 2));

  console.log(`\nDone: ${okCount} new, ${skipCount} skipped, ${missCount} no-match, ${errCount} error → log: ${logPath}`);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
