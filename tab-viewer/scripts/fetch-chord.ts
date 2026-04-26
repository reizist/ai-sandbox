#!/usr/bin/env tsx
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSongsterrChordPage } from './songsterr/chord-fetcher';
import { slugify } from './lib/slug';

const DEFAULT_OUT_ROOT = 'public/tabs';

interface CliArgs {
  url: string;
  outRoot: string;
  artistOverride?: string;
  songOverride?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { outRoot: DEFAULT_OUT_ROOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--out') args.outRoot = argv[++i];
    else if (a === '--artist') args.artistOverride = argv[++i];
    else if (a === '--song') args.songOverride = argv[++i];
    else if (!args.url && a.startsWith('http')) args.url = a;
  }
  if (!args.url) {
    throw new Error(
      'Usage: tsx scripts/fetch-chord.ts <chord-page-url> [--out public/tabs] [--artist Name] [--song Name]'
    );
  }
  return args as CliArgs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Fetching chord page: ${args.url}`);
  const result = await fetchSongsterrChordPage(args.url);

  const artist = args.artistOverride || result.meta.artist;
  const song = (args.songOverride || result.meta.title)
    .replace(/\s*\(Lyrics\)\s*$/i, ''); // strip "(Lyrics)" suffix Songsterr adds
  const artistSlug = slugify(artist);
  const songSlug = slugify(song);
  const outDir = join(args.outRoot, artistSlug, songSlug);
  await mkdir(outDir, { recursive: true });

  const chordsFilename = `${artistSlug}_${songSlug}.chords.json`;
  await writeFile(
    join(outDir, chordsFilename),
    JSON.stringify(result, null, 2)
  );

  // Update the existing manifest if present, else write a chord-only manifest.
  const manifestPath = join(outDir, 'manifest.json');
  let manifest: any = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  } catch {}
  manifest = {
    ...manifest,
    artist,
    song,
    artistSlug,
    songSlug,
    hasChords: true,
    chordsSource: 'songsterr',
    chordsSourceUrl: args.url,
    chordsSongId: result.meta.songId,
    chordsRevisionId: result.meta.chordsRevisionId,
    chordsFetchedAt: new Date().toISOString()
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    `✓ ${artist} / ${song} → ${outDir}/${chordsFilename} (${result.lines.length} lines, ${result.uniqueChords.length} unique chords: ${result.uniqueChords.slice(0, 8).join(', ')}${result.uniqueChords.length > 8 ? '…' : ''})`
  );
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
