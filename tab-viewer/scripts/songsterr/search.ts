/**
 * Thin wrapper over Songsterr's public song-search endpoint:
 *   GET https://www.songsterr.com/api/songs?pattern=<q>&size=<n>
 * Returns matches with songId / artistId / hasChords / hasPlayer flags.
 *
 * Important detail: a single "song" on Songsterr may exist as TWO entries —
 * one with hasPlayer:true (tab data) and one with hasChords:true (chord page).
 * They have different songIds. Callers usually want both.
 */

const SEARCH_URL = (q: string, size = 10) =>
  `https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(q)}&size=${size}`;

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json',
};

export interface SongsterrSearchHit {
  songId: number;
  artistId: number;
  artist: string;
  title: string;
  hasChords: boolean;
  hasPlayer: boolean;
  isJunk?: boolean;
}

export async function searchSongs(query: string, size = 10): Promise<SongsterrSearchHit[]> {
  const res = await fetch(SEARCH_URL(query, size), { headers: browserHeaders });
  if (!res.ok) {
    throw new Error(`Songsterr search ${res.status}: ${query}`);
  }
  const data = (await res.json()) as any[];
  return data.map((d) => ({
    songId: d.songId,
    artistId: d.artistId,
    artist: d.artist,
    title: d.title,
    hasChords: !!d.hasChords,
    hasPlayer: !!d.hasPlayer,
    isJunk: !!d.isJunk,
  }));
}

/** Lightweight title equality: lowercase, strip parenthetical suffixes & non-word chars. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/[\p{P}\s]+/gu, '')
    .trim();
}

export interface MatchResult {
  tab?: SongsterrSearchHit;
  chord?: SongsterrSearchHit;
}

/**
 * Given a title + (optional) artist name, return the best Songsterr matches
 * for tab and chord, restricted by simple normalized-title equality and
 * (when artistId is provided) the same artistId. Returns undefined entries
 * when no match exists — e.g. for very obscure tracks or artists not on
 * Songsterr.
 */
export async function findSongMatch(
  title: string,
  opts: { artistName?: string; artistId?: number } = {}
): Promise<MatchResult> {
  const query = [opts.artistName, title].filter(Boolean).join(' ');
  const hits = await searchSongs(query, 15);
  const wantTitle = normalizeTitle(title);
  const isMatch = (h: SongsterrSearchHit): boolean => {
    if (h.isJunk) return false;
    if (normalizeTitle(h.title) !== wantTitle) return false;
    if (opts.artistId && h.artistId !== opts.artistId) return false;
    return true;
  };
  const matches = hits.filter(isMatch);
  // Prefer the same-artist match if artistId was not pinned.
  if (!opts.artistId && opts.artistName) {
    const wantArtist = normalizeTitle(opts.artistName);
    matches.sort((a, b) => {
      const aMatch = normalizeTitle(a.artist) === wantArtist ? 0 : 1;
      const bMatch = normalizeTitle(b.artist) === wantArtist ? 0 : 1;
      return aMatch - bMatch;
    });
  }
  return {
    tab:   matches.find((h) => h.hasPlayer),
    chord: matches.find((h) => h.hasChords),
  };
}
