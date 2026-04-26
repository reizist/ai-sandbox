#!/usr/bin/env tsx
/**
 * Ultimate Guitar fallback fetcher for tracks where U-FRET / Songsterr
 * came up empty. Uses Playwright (slow: ~5-10s per page) and is meant for
 * filling coverage gaps, not bulk import.
 *
 * Workflow:
 *   1. Read public/discographies/{artistSlug}.json
 *   2. For each track that DOESN'T already have chords on disk, search UG
 *      for "{artist} {title}" and fetch the first chord-page result.
 *   3. Save as `{artistSlug}_{songSlug}.chords.json` with chordsSource:'ug'
 *
 * Usage:
 *   npm run fetch:ug -- --artist "スピッツ"
 *   npm run fetch:ug -- --artist "Spitz" --limit 30 --gap-only
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openUgContext, searchUG, fetchUgTab } from './ultimate-guitar/fetcher';
import { slugify } from './lib/slug';
import type { MBDiscography } from './discography/musicbrainz';

const TABS_ROOT = 'public/tabs';

interface CliArgs {
  artistSlug: string;
  artistName: string;
  discographyPath: string;
  limit?: number;
  gapOnly: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  let name = '';
  let path = '';
  let limit: number | undefined;
  let gapOnly = true;
  let delay = 1500;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artist') name = argv[++i];
    else if (a === '--file') path = argv[++i];
    else if (a === '--limit') limit = Number(argv[++i]);
    else if (a === '--all') gapOnly = false;
    else if (a === '--delay') delay = Number(argv[++i]);
  }
  if (!name && !path) {
    throw new Error('Usage: tsx scripts/fetch-ug-by-discography.ts --artist <name> [--limit N] [--all]');
  }
  const slug = name ? slugify(name) : '';
  return {
    artistSlug: slug,
    artistName: name,
    discographyPath: path || `public/discographies/${slug}.json`,
    limit,
    gapOnly,
    delayMs: delay,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.discographyPath, 'utf-8');
  const disc: MBDiscography = JSON.parse(raw);
  const tracks = args.limit ? disc.uniqueTracks.slice(0, args.limit) : disc.uniqueTracks;
  const artistSlug = slugify(disc.artist.name);

  // Filter tracks that lack chord data on disk if --gap-only.
  const targets: { track: typeof disc.uniqueTracks[number]; songSlug: string; chordPath: string }[] = [];
  for (const t of tracks) {
    const songSlug = slugify(t.title);
    const chordPath = join(TABS_ROOT, artistSlug, songSlug, `${artistSlug}_${songSlug}.chords.json`);
    if (args.gapOnly && (await exists(chordPath))) continue;
    targets.push({ track: t, songSlug, chordPath });
  }
  console.log(`UG fallback: ${targets.length} of ${tracks.length} tracks lack chords on disk.`);
  if (!targets.length) { console.log('Nothing to do.'); return; }

  const ug = await openUgContext();
  let okCount = 0, missCount = 0, errCount = 0;
  try {
    for (let i = 0; i < targets.length; i++) {
      const { track, songSlug, chordPath } = targets[i];
      const query = `${disc.artist.name} ${track.title}`;
      try {
        const refs = await searchUG(ug.context, query, 'chords');
        if (!refs.length) {
          missCount++;
          console.log(`  · [${i + 1}/${targets.length}] ${track.title} — no UG match`);
          await sleep(args.delayMs);
          continue;
        }
        // Pick the first link that looks like a chord page (URL or tab text).
        const ref = refs[0];
        const result = await fetchUgTab(ug.context, ref.href);
        const outDir = join(TABS_ROOT, artistSlug, songSlug);
        await mkdir(outDir, { recursive: true });
        await writeFile(chordPath, JSON.stringify(result.chordsFile, null, 2));
        const manifestPath = join(outDir, 'manifest.json');
        let m: any = {};
        try { m = JSON.parse(await readFile(manifestPath, 'utf-8')); } catch { /* fresh */ }
        m = {
          ...m,
          artist: m.artist ?? disc.artist.name,
          song: m.song ?? track.title,
          artistSlug, songSlug,
          hasChords: true,
          chordsSource: 'ultimate-guitar',
          chordsSourceUrl: ref.href,
          chordsFetchedAt: new Date().toISOString(),
        };
        await writeFile(manifestPath, JSON.stringify(m, null, 2));
        okCount++;
        console.log(`  ✓ [${i + 1}/${targets.length}] ${track.title}  ← ${ref.href}`);
      } catch (err: any) {
        errCount++;
        console.warn(`  ✗ [${i + 1}/${targets.length}] ${track.title}: ${err.message}`);
      }
      await sleep(args.delayMs);
    }
  } finally {
    await ug.close();
  }
  console.log(`\nDone: ${okCount} new, ${missCount} no-match, ${errCount} error`);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
