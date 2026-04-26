#!/usr/bin/env tsx
/**
 * Rename legacy {Artist}/{Song}/source.gp and chords.json to the
 * project convention {Artist}/{Song}/{Artist}_{Song}.{ext}.
 * Idempotent: re-running on already-migrated dirs is a no-op.
 */
import { readdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

const TABS_ROOT = 'public/tabs';

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function migrateOne(artistSlug: string, songSlug: string): Promise<void> {
  const dir = join(TABS_ROOT, artistSlug, songSlug);
  const tabLegacy = join(dir, 'source.gp');
  const tabPreferred = join(dir, `${artistSlug}_${songSlug}.gp`);
  const chordsLegacy = join(dir, 'chords.json');
  const chordsPreferred = join(dir, `${artistSlug}_${songSlug}.chords.json`);

  if (await exists(tabLegacy) && !(await exists(tabPreferred))) {
    await rename(tabLegacy, tabPreferred);
    console.log(`  tab    : ${artistSlug}/${songSlug}/source.gp → ${artistSlug}_${songSlug}.gp`);
  }
  if (await exists(chordsLegacy) && !(await exists(chordsPreferred))) {
    await rename(chordsLegacy, chordsPreferred);
    console.log(`  chords : ${artistSlug}/${songSlug}/chords.json → ${artistSlug}_${songSlug}.chords.json`);
  }
}

async function main() {
  const artistDirs = await listDirs(TABS_ROOT);
  let total = 0;
  for (const artistSlug of artistDirs) {
    const songDirs = await listDirs(join(TABS_ROOT, artistSlug));
    for (const songSlug of songDirs) {
      await migrateOne(artistSlug, songSlug);
      total++;
    }
  }
  console.log(`✓ Visited ${total} song dirs.`);
}

main().catch((err) => { console.error('✗', err); process.exit(1); });
