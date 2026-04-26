/**
 * Songsterr artist-page based bulk fetch.
 *
 * Rationale: doing one /api/songs search per discography track is fragile —
 * Japanese titles in MusicBrainz are sometimes romaji and sometimes kana/kanji,
 * and Songsterr's index uses one or the other inconsistently. Strict
 * "{artist} {title}" search misses both directions of that mismatch.
 *
 * This module instead pulls the COMPLETE per-artist song list from Songsterr
 * once (via the artist page's <script id="state">), then matches each MB
 * track locally against that list with multiple normalization passes.
 */
import type { SongsterrSearchHit } from './search';
import { searchSongs } from './search';

const ARTIST_URL = (id: number) => `https://www.songsterr.com/a/wsa/artist-tabs-a${id}`;

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface SongsterrSongRow {
  songId: number;
  title: string;
  artist: string;
  artistId: number;
  hasPlayer: boolean;
  hasChords: boolean;
}

/**
 * Use the search API as a way to discover candidate Songsterr artistIds for
 * a given artist name. The /api/songs endpoint returns hits for both songs
 * and (incidentally) reveals the artistId on each hit. We aggregate to find
 * the most-frequently-occurring artistId for the search query.
 *
 * Returns up to 3 candidates ordered by frequency, since one logical artist
 * (e.g. "Spitz") can exist on Songsterr under multiple IDs (5288 = "Spitz",
 * 526497 = "SPITZ 「スピッツ」").
 */
export async function findSongsterrArtistIds(
  name: string,
  options?: { aliases?: string[]; maxCandidates?: number }
): Promise<{ artistId: number; artist: string; hits: number }[]> {
  const queries = [name, ...(options?.aliases ?? [])];
  const counts = new Map<number, { artistId: number; artist: string; hits: number }>();
  for (const q of queries) {
    let results: SongsterrSearchHit[] = [];
    try { results = await searchSongs(q, 50); } catch { continue; }
    for (const r of results) {
      if (!r.artistId) continue;
      const existing = counts.get(r.artistId);
      if (existing) {
        existing.hits++;
      } else {
        counts.set(r.artistId, { artistId: r.artistId, artist: r.artist, hits: 1 });
      }
    }
  }
  // Filter candidates whose name actually looks like one of our queries —
  // i.e. the normalized candidate name starts with a normalized query, OR
  // the normalized query starts with the candidate name. This drops false
  // positives like "Die Spitz" leaking into a search for "Spitz".
  const norm = (s: string) =>
    s.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
  const normQueries = queries.map(norm).filter(Boolean);
  const filtered = Array.from(counts.values()).filter((c) => {
    const cn = norm(c.artist);
    return normQueries.some((q) => cn.startsWith(q) || q.startsWith(cn));
  });
  const max = options?.maxCandidates ?? 4;
  return filtered.sort((a, b) => b.hits - a.hits).slice(0, max);
}

/**
 * Fetch every song listed on the artist page (including hasPlayer:false /
 * hasChords:true chord-only entries). The artist page's embedded state JSON
 * has a list under `artist.songs.list[]`.
 */
export async function listArtistSongs(artistId: number): Promise<SongsterrSongRow[]> {
  const res = await fetch(ARTIST_URL(artistId), { headers: browserHeaders });
  if (!res.ok) throw new Error(`artist page ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script[^>]*id=["']state["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No state script in artist page');
  const state = JSON.parse(m[1].trim());
  const list = state?.artist?.songs?.list;
  if (!Array.isArray(list)) throw new Error('artist.songs.list missing');
  return list
    .filter((s: any) => typeof s?.songId === 'number' && typeof s?.title === 'string')
    .map((s: any) => ({
      songId: s.songId,
      title: s.title,
      artist: s.artist || '',
      artistId: s.artistId || artistId,
      hasPlayer: !!s.hasPlayer,
      hasChords: !!s.hasChords,
    }));
}

/** Group rows by normalized title; one entry can hold both tab and chord IDs. */
export interface SongsterrLocalIndex {
  byTitle: Map<string, { tabSongId?: number; chordSongId?: number; row: SongsterrSongRow }>;
  /** raw rows, kept for fuzzy fallback. */
  rows: SongsterrSongRow[];
}

export function buildLocalIndex(rows: SongsterrSongRow[]): SongsterrLocalIndex {
  const byTitle = new Map<string, { tabSongId?: number; chordSongId?: number; row: SongsterrSongRow }>();
  for (const row of rows) {
    if (row.title === '') continue;
    // Multiple normalization keys per row (so we can lookup by either form).
    for (const k of titleVariants(row.title)) {
      const existing = byTitle.get(k);
      if (!existing) {
        byTitle.set(k, {
          tabSongId: row.hasPlayer ? row.songId : undefined,
          chordSongId: row.hasChords ? row.songId : undefined,
          row,
        });
      } else {
        if (row.hasPlayer && !existing.tabSongId) existing.tabSongId = row.songId;
        if (row.hasChords && !existing.chordSongId) existing.chordSongId = row.songId;
      }
    }
  }
  return { byTitle, rows };
}

/**
 * Aggressively normalize a title and emit multiple candidate keys:
 *  - lowercased
 *  - parenthesized clauses dropped
 *  - punctuation/spaces dropped
 *  - "the / a / an" article stripped (English)
 *  - feat./featuring stripped
 *
 * Multiple keys per title trades index size for recall.
 */
export function titleVariants(title: string): string[] {
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

  for (const v of [base, lower, noParen, stripped, noArticle]) {
    if (v) out.add(v);
  }
  return Array.from(out);
}

/** Loose lookup: try each variant of `title` against the index. */
export function lookup(
  index: SongsterrLocalIndex,
  title: string
): { tabSongId?: number; chordSongId?: number; matchedTitle?: string; artistName?: string } | undefined {
  for (const k of titleVariants(title)) {
    const hit = index.byTitle.get(k);
    if (hit) {
      return {
        tabSongId: hit.tabSongId,
        chordSongId: hit.chordSongId,
        matchedTitle: hit.row.title,
        artistName: hit.row.artist,
      };
    }
  }
  return undefined;
}

/**
 * Convenience: resolve all Songsterr artistIds for a logical artist name and
 * pull their union of songs. Returns both the merged index and the candidate
 * artist metadata so callers can warn on multiple-artistId edge cases.
 */
export async function loadArtistCorpus(
  name: string,
  aliases?: string[]
): Promise<{
  candidates: { artistId: number; artist: string; hits: number }[];
  rows: SongsterrSongRow[];
  index: SongsterrLocalIndex;
}> {
  const candidates = await findSongsterrArtistIds(name, { aliases });
  const allRows: SongsterrSongRow[] = [];
  for (const c of candidates) {
    try {
      const rows = await listArtistSongs(c.artistId);
      allRows.push(...rows);
    } catch (err) {
      console.warn(`[songsterr] artist ${c.artistId} (${c.artist}) failed: ${(err as Error).message}`);
    }
  }
  return { candidates, rows: allRows, index: buildLocalIndex(allRows) };
}
