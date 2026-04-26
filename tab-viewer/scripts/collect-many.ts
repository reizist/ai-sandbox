#!/usr/bin/env tsx
/**
 * Sequence-runner for fetch:discography + fetch:by-discography across many
 * artists. Single-process to respect MusicBrainz's 1 req/sec global limit.
 *
 * Usage:
 *   npm run collect:many -- "スピッツ" "Mr.Children" "RADWIMPS" "あいみょん"
 *
 * Reads existing public/discographies/{slug}.json — re-fetch is opt-in via
 * --refresh-discography. By default we just run by-discography against the
 * cached list when it exists.
 */
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { slugify } from './lib/slug';

interface ArtistSpec {
  name: string;
  aliases: string[];
}

interface CliOpts {
  artists: ArtistSpec[];
  refresh: boolean;
  perArtistLimit?: number;
  concurrency: number;
}

/** Parse "Name|alias1|alias2" into ArtistSpec. Bare names with no `|` work too. */
function parseArtistSpec(s: string): ArtistSpec {
  const parts = s.split('|').map((p) => p.trim()).filter(Boolean);
  return { name: parts[0], aliases: parts.slice(1) };
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { artists: [], refresh: false, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--refresh' || a === '--refresh-discography') opts.refresh = true;
    else if (a === '--limit') opts.perArtistLimit = Number(argv[++i]);
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]);
    else if (!a.startsWith('--')) opts.artists.push(parseArtistSpec(a));
  }
  if (!opts.artists.length) {
    throw new Error('Usage: tsx scripts/collect-many.ts "Name|alias1|alias2" ... [--refresh] [--limit N]');
  }
  return opts;
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Collecting for ${opts.artists.length} artist(s):`);
  for (const a of opts.artists) {
    console.log(`  - ${a.name}${a.aliases.length ? ` (alias: ${a.aliases.join(', ')})` : ''}`);
  }

  let okCount = 0, failCount = 0;
  for (const spec of opts.artists) {
    const artist = spec.name;
    const slug = slugify(artist);
    const discPath = `public/discographies/${slug}.json`;
    console.log(`\n=== ${artist} ===`);

    if (opts.refresh || !(await exists(discPath))) {
      console.log(`[1/2] Fetching MusicBrainz discography…`);
      const discArgs = ['tsx', 'scripts/fetch-discography.ts', '--artist', artist];
      if (opts.perArtistLimit) discArgs.push('--limit', String(opts.perArtistLimit));
      const code = await run('npx', discArgs);
      if (code !== 0) {
        console.warn(`✗ discography fetch failed for ${artist}`);
        failCount++;
        continue;
      }
    } else {
      console.log(`[1/2] Using cached discography: ${discPath}`);
    }

    console.log(`[2/3] Fetching tabs from Songsterr for matched tracks…`);
    const byArgs = [
      'tsx', 'scripts/fetch-by-discography.ts', '--artist', artist,
      '--concurrency', String(opts.concurrency),
    ];
    for (const al of spec.aliases) byArgs.push('--alias', al);
    const code = await run('npx', byArgs);
    if (code !== 0) {
      console.warn(`✗ by-discography fetch failed for ${artist}`);
      failCount++;
      continue;
    }
    okCount++;

    // Step 3: U-FRET chord fetch (Songsterr coverage of J-pop chords is sparse).
    console.log(`[3/3] Fetching chords from U-FRET…`);
    const ufretArgs = [
      'tsx', 'scripts/fetch-ufret-by-discography.ts', '--artist', artist,
      '--concurrency', String(Math.min(opts.concurrency, 3)),
      '--delay', '500',
    ];
    for (const al of spec.aliases) ufretArgs.push('--alias', al);
    const ufretCode = await run('npx', ufretArgs);
    if (ufretCode !== 0) {
      console.warn(`  ! U-FRET fetch returned ${ufretCode} for ${artist} (continuing)`);
    }

    // Rebuild catalog after each artist so UI auto-refresh picks them up
    // without waiting for the whole run to finish.
    console.log(`[catalog] rebuilding catalog.json…`);
    await run('npx', ['tsx', 'scripts/build-catalog.ts']);
  }

  console.log(`\nFinal: ${okCount} ok, ${failCount} failed`);
  console.log('Running final build:catalog…');
  await run('npx', ['tsx', 'scripts/build-catalog.ts']);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
