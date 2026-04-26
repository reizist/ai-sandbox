#!/usr/bin/env tsx
import { fetchUfretSong } from './ufret/song-fetcher';
import { listUfretArtistSongs, dedupeUfretSongs } from './ufret/artist-fetcher';

async function main() {
  // Test 1: parse one song.
  console.log('=== fetch single song (192107) ===');
  const r = await fetchUfretSong(192107);
  console.log('title :', r.meta.title);
  console.log('artist:', r.meta.artist);
  console.log('variant:', r.meta.variant);
  console.log('lines :', r.chordsFile.lines.length);
  console.log('uniqueChords:', r.chordsFile.uniqueChords);
  console.log('first 3 lines:');
  for (const l of r.chordsFile.lines.slice(0, 3)) {
    console.log(' ', l.kind, l.segments.slice(0, 4).map(s => `${s.chord ? '['+s.chord+']' : ''}${s.text || ''}`).join(' | '));
  }
  console.log();

  // Test 2: artist listing.
  console.log('=== list spitz songs ===');
  const list = await listUfretArtistSongs('スピッツ');
  console.log('total entries:', list.songs.length);
  const deduped = dedupeUfretSongs(list.songs);
  console.log('after dedupe :', deduped.length);
  console.log('first 5 deduped:');
  for (const s of deduped.slice(0, 5)) console.log(' ', s.songId, s.title, s.variantTag ? `(${s.variantTag})` : '');
}

main().catch((err) => { console.error('✗', err); process.exit(1); });
