#!/usr/bin/env tsx
/**
 * Fetch an artist's discography from MusicBrainz and save to
 * public/discographies/{artistSlug}.json. This is the *index* of what songs
 * exist; pairing with Songsterr/U-FRET tab availability is a separate step
 * (see fetch-discography-tabs.ts — TODO).
 *
 * Usage:
 *   npm run fetch:discography -- --artist "Spitz"
 *   npm run fetch:discography -- --mbid "9b6c7c4a-..."
 *   npm run fetch:discography -- --artist "スピッツ" --limit 10
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { searchArtist, fetchDiscography } from './discography/musicbrainz';
import { slugify } from './lib/slug';

interface CliArgs {
  artist?: string;
  mbid?: string;
  limit?: number;
  outRoot: string;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { outRoot: 'public/discographies', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artist') args.artist = argv[++i];
    else if (a === '--mbid') args.mbid = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--out') args.outRoot = argv[++i];
    else if (a === '--json') args.json = true;
  }
  if (!args.artist && !args.mbid) {
    throw new Error('Usage: tsx scripts/fetch-discography.ts --artist <name> | --mbid <id> [--limit N]');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let mbid = args.mbid;
  let displayName = args.artist;
  if (!mbid && args.artist) {
    console.log(`Searching MusicBrainz for "${args.artist}"…`);
    const matches = await searchArtist(args.artist);
    if (!matches.length) {
      console.error('No MusicBrainz matches.');
      process.exit(2);
    }
    if (!args.json) {
      console.log('Top matches:');
      for (const m of matches.slice(0, 5)) {
        console.log(`  ${m.id} — ${m.name}${m.country ? ` (${m.country})` : ''}${m.disambiguation ? ` [${m.disambiguation}]` : ''}  score=${m.score ?? '?'}`);
      }
    }
    const top = matches[0];
    mbid = top.id;
    displayName = top.name;
    console.log(`→ using ${top.name} (${top.id})`);
  }

  if (!mbid) throw new Error('No MBID resolved.');
  console.log(`Fetching discography for ${displayName ?? mbid}… (this may take a minute or two due to MB rate limits)`);
  const disc = await fetchDiscography(mbid, { limit: args.limit });

  const slug = slugify(disc.artist.name);
  await mkdir(args.outRoot, { recursive: true });
  const outPath = join(args.outRoot, `${slug}.json`);
  await writeFile(outPath, JSON.stringify(disc, null, 2));

  console.log(
    `✓ ${disc.artist.name}: ${disc.releases.length} releases, ${disc.uniqueTracks.length} unique tracks → ${outPath}`
  );
  if (!args.json) {
    console.log('\nFirst 10 unique tracks:');
    for (const t of disc.uniqueTracks.slice(0, 10)) {
      console.log(`  - ${t.title}${t.firstYear ? ` (${t.firstYear})` : ''}${t.firstRelease ? ` — ${t.firstRelease}` : ''}`);
    }
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
