#!/usr/bin/env tsx
/**
 * Attach YouTube tutorial / cover video references to a song's manifest.
 * Useful for tracks that have no canned chord/tab data but where players
 * have uploaded TAB-overlay performances on YouTube (e.g. instrumental
 * Ghibli pieces like アシタカせっ記).
 *
 * Search query: "{artist} {title} TAB OR ソロギター OR 弾いてみた".
 * Top N ranked-by-tutorial-score videos go into manifest.youtubeRefs.
 *
 * Usage:
 *   npm run fetch:yt-refs -- --artist "ジブリ" --title "アシタカせっ記"
 *   npm run fetch:yt-refs -- --artist "ジブリ" --all  # all songs that lack chord+tab data
 *   npm run fetch:yt-refs -- --artist "ジブリ" --missing-only
 */
import { mkdir, readFile, stat, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { searchYouTube, rankTutorials } from './youtube/search';
import { slugify } from './lib/slug';

const TABS_ROOT = 'public/tabs';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }

interface CliArgs {
  artistName: string;
  artistSlug: string;
  songTitle?: string;
  all: boolean;
  missingOnly: boolean;
  hasChordOrTab: boolean;  // songs WITH data (opposite of missing-only)
  skipExisting: boolean;
  topN: number;
  query?: string;
}

function parseArgs(argv: string[]): CliArgs {
  let artist = '', title = '', query = '';
  let all = false, missingOnly = false, hasChordOrTab = false, skipExisting = true;
  let topN = 5;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artist') artist = argv[++i];
    else if (a === '--title') title = argv[++i];
    else if (a === '--query') query = argv[++i];
    else if (a === '--all') all = true;
    else if (a === '--missing-only') missingOnly = true;
    else if (a === '--has-data') hasChordOrTab = true;
    else if (a === '--force') skipExisting = false;
    else if (a === '--top') topN = Number(argv[++i]);
  }
  if (!artist) throw new Error('Usage: --artist <name> [--title <song> | --all | --missing-only | --has-data] [--top 5] [--force]');
  return {
    artistName: artist, artistSlug: slugify(artist),
    songTitle: title || undefined,
    all, missingOnly, hasChordOrTab, skipExisting,
    topN, query: query || undefined,
  };
}

async function discoverSongs(artistSlug: string): Promise<{ songSlug: string; title: string; hasTab: boolean; hasChords: boolean; hasYtRefs: boolean }[]> {
  const dir = join(TABS_ROOT, artistSlug);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: { songSlug: string; title: string; hasTab: boolean; hasChords: boolean; hasYtRefs: boolean }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const songSlug = e.name;
    const songDir = join(dir, songSlug);
    const tabPath = join(songDir, `${artistSlug}_${songSlug}.gp`);
    const chordPath = join(songDir, `${artistSlug}_${songSlug}.chords.json`);
    const manifestPath = join(songDir, 'manifest.json');
    let title = songSlug;
    let hasYtRefs = false;
    try {
      const m = JSON.parse(await readFile(manifestPath, 'utf-8'));
      title = m.song ?? songSlug;
      hasYtRefs = Array.isArray(m.youtubeRefs) && m.youtubeRefs.length > 0;
    } catch { /* manifest missing */ }
    out.push({
      songSlug, title,
      hasTab: await exists(tabPath),
      hasChords: await exists(chordPath),
      hasYtRefs,
    });
  }
  return out;
}

async function attachRefs(artistName: string, artistSlug: string, songTitle: string, topN: number, queryOverride?: string): Promise<{ ok: boolean; videoCount?: number; error?: string }> {
  const songSlug = slugify(songTitle);
  const outDir = join(TABS_ROOT, artistSlug, songSlug);
  await mkdir(outDir, { recursive: true });
  const query = queryOverride ?? `${artistName} ${songTitle} TAB ソロギター`;
  try {
    const videos = await searchYouTube(query);
    if (!videos.length) return { ok: false, error: 'no videos found' };
    const ranked = rankTutorials(videos).slice(0, topN);
    const manifestPath = join(outDir, 'manifest.json');
    let m: any = {};
    try { m = JSON.parse(await readFile(manifestPath, 'utf-8')); } catch { /* fresh */ }
    m = {
      ...m,
      artist: m.artist ?? artistName,
      song: m.song ?? songTitle,
      artistSlug, songSlug,
      youtubeRefs: ranked,
      youtubeRefsQuery: query,
      youtubeRefsFetchedAt: new Date().toISOString(),
    };
    await writeFile(manifestPath, JSON.stringify(m, null, 2));
    return { ok: true, videoCount: ranked.length };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let targets: { songSlug: string; title: string }[] = [];
  if (args.songTitle) {
    targets = [{ songSlug: slugify(args.songTitle), title: args.songTitle }];
  } else {
    const songs = await discoverSongs(args.artistSlug);
    let candidates = songs;
    if (args.missingOnly) {
      candidates = songs.filter((s) => !s.hasTab && !s.hasChords);
    } else if (args.hasChordOrTab) {
      candidates = songs.filter((s) => s.hasTab || s.hasChords);
    } else if (!args.all) {
      throw new Error('Specify --title <song> or --all or --missing-only or --has-data');
    }
    if (args.skipExisting) candidates = candidates.filter((s) => !s.hasYtRefs);
    targets = candidates.map((s) => ({ songSlug: s.songSlug, title: s.title }));
  }
  console.log(`YouTube refs for ${args.artistName}: ${targets.length} target(s)`);
  let ok = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const res = await attachRefs(args.artistName, args.artistSlug, t.title, args.topN, args.query);
    if (res.ok) {
      ok++;
      console.log(`  ✓ [${i + 1}/${targets.length}] ${t.title}: ${res.videoCount} refs`);
    } else {
      fail++;
      console.warn(`  ✗ [${i + 1}/${targets.length}] ${t.title}: ${res.error}`);
    }
    await sleep(800);
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
