#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSongsterrPage } from './songsterr/fetcher';
import { SongsterrToAlphaTabConverter } from './songsterr/converter';
import { slugify } from './lib/slug';

const DEFAULT_OUT_ROOT = 'public/tabs';

export interface FetchSongResult {
  artist: string;
  song: string;
  artistSlug: string;
  songSlug: string;
  outDir: string;
  bytes: number;
  warnings: number;
  songId: number;
  revisionId: number;
}

export interface FetchSongOptions {
  url: string;
  outRoot?: string;
  artistOverride?: string;
  songOverride?: string;
}

export async function fetchAndSaveSong(
  opts: FetchSongOptions
): Promise<FetchSongResult> {
  const outRoot = opts.outRoot ?? DEFAULT_OUT_ROOT;
  const { state, revisions } = await fetchSongsterrPage(opts.url);
  if (revisions.length === 0) {
    throw new Error(`No revisions could be fetched for ${opts.url}`);
  }

  const artist = opts.artistOverride || state.artist;
  const song = opts.songOverride || state.title;
  const artistSlug = slugify(artist);
  const songSlug = slugify(song);
  const outDir = join(outRoot, artistSlug, songSlug);
  await mkdir(join(outDir, 'parts'), { recursive: true });

  await writeFile(join(outDir, 'state.json'), JSON.stringify(state, null, 2));
  for (const r of revisions) {
    await writeFile(
      join(outDir, 'parts', `${r.partId}.json`),
      JSON.stringify(r.revision, null, 2)
    );
  }

  const converter = new SongsterrToAlphaTabConverter();
  const trackInputs = revisions.map((r) => {
    const trackMeta = state.tracks.find((t) => t.partId === r.partId)!;
    return { trackMeta, revision: r.revision };
  });
  const { data, warnings } = converter.toGp7({
    meta: state,
    revisions: trackInputs
  });

  // Preferred filename per project convention: {artist}_{song}.gp
  const tabFilename = `${artistSlug}_${songSlug}.gp`;
  await writeFile(join(outDir, tabFilename), data);

  const manifest = {
    artist,
    song,
    artistSlug,
    songSlug,
    source: 'songsterr' as const,
    sourceUrl: opts.url,
    songId: state.songId,
    revisionId: state.revisionId,
    image: state.image,
    trackCount: state.tracks.length,
    fetchedRevisions: revisions.length,
    fetchedAt: new Date().toISOString(),
    warnings: warnings.slice(0, 50)
  };
  await writeFile(
    join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  return {
    artist,
    song,
    artistSlug,
    songSlug,
    outDir,
    bytes: data.byteLength,
    warnings: warnings.length,
    songId: state.songId,
    revisionId: state.revisionId
  };
}

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
      'Usage: tsx scripts/fetch-tab.ts <url> [--out public/tabs] [--artist Name] [--song Name]'
    );
  }
  return args as CliArgs;
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('fetch-tab.ts');

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Fetching: ${args.url}`);
  fetchAndSaveSong(args)
    .then((r) => {
      console.log(
        `✓ ${r.artist} / ${r.song} → ${r.outDir} (${(r.bytes / 1024).toFixed(1)} KB${r.warnings ? `, ${r.warnings} warnings` : ''})`
      );
    })
    .catch((err) => {
      console.error('✗', err.message);
      process.exit(1);
    });
}
