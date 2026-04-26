#!/usr/bin/env tsx
/**
 * One-shot migration: merge `public/tabs/Spitz/` into `public/tabs/スピッツ/`.
 *
 * Both folders represent the same artist on different sources (Songsterr's
 * English-titled `Spitz` artistId 5288 vs Japanese-titled スピッツ etc.).
 * We pick the JP folder as canonical and consolidate everything under it.
 *
 * Strategy per song:
 *   1. If the song slug doesn't exist in スピッツ → move it.
 *   2. If both exist → pick whichever has both .gp and .chords.json, or the
 *      union of files, and delete the loser. Prefer the JP entry as canonical
 *      naming so `スピッツ_{song}.{ext}` stays consistent.
 *
 * Internal asset files are renamed `Spitz_*.gp` → `スピッツ_*.gp` and
 * manifest.json is patched (artist, artistSlug).
 *
 * Idempotent: re-running on an already-merged tree leaves the JP side
 * untouched and removes the empty Spitz dir.
 */
import { readdir, readFile, rename, stat, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const TABS_ROOT = 'public/tabs';
const SRC_SLUG = 'Spitz';
const DST_SLUG = 'スピッツ';
const DST_NAME = 'スピッツ';

async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }
async function listDirs(dir: string): Promise<string[]> {
  try {
    const e = await readdir(dir, { withFileTypes: true });
    return e.filter((x) => x.isDirectory()).map((x) => x.name);
  } catch { return []; }
}

async function fileSize(p: string): Promise<number> {
  try { return (await stat(p)).size; } catch { return 0; }
}

interface Snapshot {
  hasTab: boolean;
  tabPath: string;
  tabSize: number;
  hasChords: boolean;
  chordsPath: string;
  chordsSize: number;
  hasManifest: boolean;
  manifestPath: string;
}

async function snapshot(artistSlug: string, songSlug: string): Promise<Snapshot> {
  const dir = join(TABS_ROOT, artistSlug, songSlug);
  const tabPath = join(dir, `${artistSlug}_${songSlug}.gp`);
  const chordsPath = join(dir, `${artistSlug}_${songSlug}.chords.json`);
  const manifestPath = join(dir, 'manifest.json');
  return {
    hasTab: await exists(tabPath),
    tabPath,
    tabSize: await fileSize(tabPath),
    hasChords: await exists(chordsPath),
    chordsPath,
    chordsSize: await fileSize(chordsPath),
    hasManifest: await exists(manifestPath),
    manifestPath,
  };
}

async function patchManifest(manifestPath: string, songSlug: string): Promise<void> {
  if (!(await exists(manifestPath))) return;
  let m: any = {};
  try { m = JSON.parse(await readFile(manifestPath, 'utf-8')); } catch { return; }
  m.artist = DST_NAME;
  m.artistSlug = DST_SLUG;
  m.songSlug = songSlug;
  await writeFile(manifestPath, JSON.stringify(m, null, 2));
}

async function moveAsCanonical(songSlug: string): Promise<{ moved: boolean }> {
  // Source dir is Spitz/{slug}; ensure target dir exists; rename files;
  // patch manifest; rename top-level dir from Spitz/{slug} to スピッツ/{slug}.
  const srcDir = join(TABS_ROOT, SRC_SLUG, songSlug);
  const dstDir = join(TABS_ROOT, DST_SLUG, songSlug);
  await mkdir(join(TABS_ROOT, DST_SLUG), { recursive: true });

  // Rename internal files inside src first.
  const oldTab = join(srcDir, `${SRC_SLUG}_${songSlug}.gp`);
  const newTab = join(srcDir, `${DST_SLUG}_${songSlug}.gp`);
  if (await exists(oldTab)) await rename(oldTab, newTab);
  const oldChords = join(srcDir, `${SRC_SLUG}_${songSlug}.chords.json`);
  const newChords = join(srcDir, `${DST_SLUG}_${songSlug}.chords.json`);
  if (await exists(oldChords)) await rename(oldChords, newChords);

  // Patch manifest with new artist info.
  await patchManifest(join(srcDir, 'manifest.json'), songSlug);

  // Move dir.
  await rename(srcDir, dstDir);
  return { moved: true };
}

async function mergeIntoExisting(songSlug: string): Promise<{ kept: 'src' | 'dst'; details: string }> {
  // Both dirs exist for this slug. Compare snapshots. Prefer the side with
  // more data; fall back to file size for the same-coverage case. After picking,
  // ensure the canonical naming on the surviving dir, and delete the loser.
  const srcSnap = await snapshot(SRC_SLUG, songSlug);
  const dstSnap = await snapshot(DST_SLUG, songSlug);
  const srcScore = (srcSnap.hasTab ? 2 : 0) + (srcSnap.hasChords ? 2 : 0) + Math.log10(srcSnap.tabSize + srcSnap.chordsSize + 1);
  const dstScore = (dstSnap.hasTab ? 2 : 0) + (dstSnap.hasChords ? 2 : 0) + Math.log10(dstSnap.tabSize + dstSnap.chordsSize + 1) + 0.05; // slight bias towards JP canonical
  if (srcScore > dstScore) {
    // SRC wins → drop DST, then move SRC over.
    await rm(join(TABS_ROOT, DST_SLUG, songSlug), { recursive: true, force: true });
    await moveAsCanonical(songSlug);
    return { kept: 'src', details: `src(${srcSnap.hasTab ? 'T' : '-'}${srcSnap.hasChords ? 'C' : '-'}) > dst(${dstSnap.hasTab ? 'T' : '-'}${dstSnap.hasChords ? 'C' : '-'})` };
  }
  // DST wins. We may still want to copy unique files from SRC if DST is missing them.
  let copied: string[] = [];
  if (!dstSnap.hasTab && srcSnap.hasTab) {
    const target = join(TABS_ROOT, DST_SLUG, songSlug, `${DST_SLUG}_${songSlug}.gp`);
    await mkdir(join(TABS_ROOT, DST_SLUG, songSlug), { recursive: true });
    await rename(srcSnap.tabPath, target);
    copied.push('tab');
  }
  if (!dstSnap.hasChords && srcSnap.hasChords) {
    const target = join(TABS_ROOT, DST_SLUG, songSlug, `${DST_SLUG}_${songSlug}.chords.json`);
    await rename(srcSnap.chordsPath, target);
    copied.push('chords');
  }
  // Delete the SRC dir whatever leftover is in there.
  await rm(join(TABS_ROOT, SRC_SLUG, songSlug), { recursive: true, force: true });
  return { kept: 'dst', details: copied.length ? `dst kept; copied from src: ${copied.join(',')}` : 'dst kept' };
}

async function main() {
  const srcSongs = await listDirs(join(TABS_ROOT, SRC_SLUG));
  if (!srcSongs.length) {
    console.log(`No songs under ${SRC_SLUG}. Nothing to do.`);
    return;
  }
  console.log(`Merging ${srcSongs.length} song(s) from ${SRC_SLUG} → ${DST_SLUG}`);
  for (const songSlug of srcSongs) {
    const dstDir = join(TABS_ROOT, DST_SLUG, songSlug);
    if (await exists(dstDir)) {
      const r = await mergeIntoExisting(songSlug);
      console.log(`  ◇ ${songSlug}: ${r.details}`);
    } else {
      await moveAsCanonical(songSlug);
      console.log(`  → ${songSlug}: moved`);
    }
  }
  // Remove the now-empty source dir if possible.
  try {
    const remaining = await listDirs(join(TABS_ROOT, SRC_SLUG));
    if (remaining.length === 0) {
      await rm(join(TABS_ROOT, SRC_SLUG), { recursive: true, force: true });
      console.log(`✓ Removed empty ${SRC_SLUG}/`);
    } else {
      console.warn(`! ${SRC_SLUG}/ still has ${remaining.length} item(s) after merge`);
    }
  } catch { /* nothing */ }
}

main().catch((err) => { console.error('✗', err); process.exit(1); });
