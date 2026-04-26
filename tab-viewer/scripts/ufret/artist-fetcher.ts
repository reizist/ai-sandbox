/**
 * U-FRET artist-page fetcher: given an artist name, list all of that artist's
 * song IDs and titles. The page lives at /artist.php?data={URL-encoded name}.
 *
 * Output is a flat list — duplicates by title (e.g. simple-chord vs full
 * vs ukulele variants) are kept; callers can dedupe by title or pick the
 * preferred variant.
 */

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

const ARTIST_URL = (name: string) =>
  `https://www.ufret.jp/artist.php?data=${encodeURIComponent(name)}`;

export interface UfretSongRow {
  songId: number;
  title: string;
  variantTag?: string; // e.g. "(初心者向け簡単コード ver.)" if present in title
}

export async function listUfretArtistSongs(artistName: string): Promise<{
  artist: string;
  url: string;
  songs: UfretSongRow[];
}> {
  const url = ARTIST_URL(artistName);
  const res = await fetch(url, { headers: browserHeaders });
  if (!res.ok) throw new Error(`UFRET artist ${res.status}: ${url}`);
  const html = await res.text();

  // Each entry looks like:
  //   <a href="/song.php?data=192107" class="c-list__link">
  //     ...
  //     <p class="c-list__title">放浪カモメはどこまでも (初心者向け…)</p>
  //   </a>
  const songs: UfretSongRow[] = [];
  const re = /<a\s+href="\/song\.php\?data=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const songId = Number(m[1]);
    const block = m[2];
    const titleMatch = block.match(/<p\s+class="c-list__title"[^>]*>([\s\S]*?)<\/p>/);
    if (!titleMatch) continue;
    const titleRaw = decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '').trim());
    // Variant marker can appear in two forms on U-FRET artist pages:
    //   1. parens:           "曲名 (初心者向け簡単コード ver.)"
    //   2. trailing suffix:  "曲名                 初心者ver" (multi-space separator)
    // Normalize both into a clean title + a structured variantTag.
    let cleanTitle = titleRaw;
    let variantTag: string | undefined;
    const parenMatch = titleRaw.match(/\(([^()]*ver\.?[^()]*)\)/);
    if (parenMatch) {
      variantTag = parenMatch[1].trim();
      cleanTitle = titleRaw.replace(/\s*\([^()]*ver\.?[^()]*\)\s*/, '').trim();
    } else {
      const suffixMatch = titleRaw.match(/^(.+?)\s{2,}((?:初心者|ウクレレ|簡単|ピアノ)\S*)\s*$/);
      if (suffixMatch) {
        cleanTitle = suffixMatch[1].trim();
        variantTag = suffixMatch[2].trim();
      }
    }
    songs.push({
      songId,
      title: cleanTitle || titleRaw,
      variantTag,
    });
  }
  return { artist: artistName, url, songs };
}

/**
 * Group U-FRET songs by normalized title and pick a canonical entry per song.
 *
 * IMPORTANT: U-FRET serves two different HTML formats. "簡単コード ver." pages
 * (newer IDs) render chords as static HTML which we can parse. The original
 * full-chord pages (older IDs, songId roughly < 100k) render chords via
 * JavaScript and are NOT parseable from raw HTML — `<rt>' + chord + '</rt>`
 * is JS source code, not content.
 *
 * So we prefer the simplified version. Our app does its own chord transforms
 * (capo / transpose / simplify) at view time anyway, so the user can re-simplify
 * or de-simplify after import.
 *
 * Preference order: 簡単 first (parseable), then plain, then ウクレレ last.
 */
export function dedupeUfretSongs(songs: UfretSongRow[]): UfretSongRow[] {
  return groupUfretByTitle(songs).map((g) => g[0]);
}

/**
 * Same grouping as `dedupeUfretSongs` but returns ALL ranked candidates per
 * title so callers can fall back to other entries if the preferred one fails
 * to parse (e.g. the simplified ver. doesn't exist and we fell back to a
 * JS-rendered original).
 */
export function groupUfretByTitle(songs: UfretSongRow[]): UfretSongRow[][] {
  const norm = (s: string) => s.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
  const buckets = new Map<string, UfretSongRow[]>();
  for (const s of songs) {
    const k = norm(s.title);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(s);
  }
  const out: UfretSongRow[][] = [];
  for (const [, group] of buckets) {
    group.sort((a, b) => {
      // Score lower = preferred (will be tried first).
      const score = (r: UfretSongRow) => {
        const t = r.variantTag ?? '';
        if (t.includes('ウクレレ') || t.includes('ピアノ')) return 4;
        if (t.includes('簡単')) return 0;            // most parseable
        if (t.includes('動画')) return 1;            // newer pages
        if (r.songId >= 100000) return 2;            // newer-ish
        return 3;                                    // old, likely JS-rendered
      };
      return score(a) - score(b) || b.songId - a.songId;
    });
    out.push(group);
  }
  return out;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
