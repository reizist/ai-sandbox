/**
 * U-FRET song-page fetcher. Parses HTML into our ChordsFile shape.
 *
 * U-FRET serves chord+lyric content as obfuscated-class HTML (classes are
 * stable across pages but not semantically named):
 *   <p class="atfolhyds" data-atfolhyds="N">          ← one line
 *     <span></span>                                   ← always-empty leader
 *     <span class="krijcheug">                        ← chord wrapper
 *       <ruby><img ...><rt>{ChordName}</rt></ruby>
 *     </span>
 *     <span class="mejiowvnz">{lyric text}</span>     ← lyric block
 *     <span class="krijcheug">…</span>
 *     <span class="mejiowvnz">…</span>
 *     …
 *   </p>
 *
 * Compliance: U-FRET ToS prohibits republishing. Output stays in
 * `public/tabs/` which is .gitignored. Use only for personal practice
 * (著作権法30条). Throttle requests so we never hit U-FRET in bursts.
 */

import type { ChordLine, ChordSegment, ChordsFile } from '../../src/types';

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

const SONG_URL = (id: number) => `https://www.ufret.jp/song.php?data=${id}`;

export interface UfretSongMeta {
  songId: number;
  title: string;
  artist: string;
  capo?: string;       // free-form, e.g. "カポ 2"
  originalKey?: string;// free-form, e.g. "キー: E"
  variant?: string;    // e.g. "初心者向け簡単コード ver."
}

export interface UfretFetchResult {
  meta: UfretSongMeta;
  chordsFile: ChordsFile;
  source: 'ufret';
  sourceUrl: string;
}

export async function fetchUfretSong(songId: number): Promise<UfretFetchResult> {
  const url = SONG_URL(songId);
  const res = await fetch(url, { headers: browserHeaders });
  if (!res.ok) throw new Error(`UFRET ${res.status}: ${url}`);
  const html = await res.text();
  const meta = extractMeta(html, songId);

  // U-FRET serves two distinct formats:
  //  (a) Older full-version pages: chord lines are JS-rendered; the data
  //      lives in `var ufret_chord_datas = ["[Chord]lyric…\r", …]`.
  //  (b) Newer simplified-version pages: chord lines are pre-rendered as
  //      <p class="atfolhyds">…</p> static HTML.
  // Try (a) first since it covers the larger long tail; fall back to (b).
  let lines = extractLinesFromJsData(html);
  if (!lines.length) lines = extractLinesFromHtml(html);

  if (!lines.length) {
    throw new Error('No chord lines found — page format may have changed.');
  }
  const uniqueChords = collectUniqueChords(lines);
  const chordsFile: ChordsFile = {
    meta: {
      songId,
      chordsRevisionId: 0,
      chordpro: '',
      artist: meta.artist,
      title: meta.title,
    },
    lines,
    uniqueChords,
  };
  return { meta, chordsFile, source: 'ufret', sourceUrl: url };
}

function extractMeta(html: string, songId: number): UfretSongMeta {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const rawTitle = titleMatch ? decodeHtml(titleMatch[1].trim()) : '';
  let title = rawTitle, artist = '', variant: string | undefined;
  const slash = rawTitle.indexOf(' / ');
  if (slash > 0) {
    title = rawTitle.slice(0, slash).trim();
    artist = rawTitle.slice(slash + 3).replace(/\s*ギターコード.*$/, '').trim();
  }
  const variantMatch = title.match(/\s*\(([^()]*ver\.[^()]*)\)\s*$/);
  if (variantMatch) {
    variant = variantMatch[1].trim();
    title = title.slice(0, variantMatch.index).trim();
  }
  title = title.replace(/\s*\(動画プラス\)\s*$/, '').replace(/\s*\(プラス\)\s*$/, '').trim();

  const capoMatch = html.match(/カポ\s*[:：]?\s*([0-9０-９]+|なし)/);
  const keyMatch = html.match(/キー[:：]?\s*([A-G][#b]?(?:m|maj|dim|aug)?)/);
  return {
    songId,
    title,
    artist,
    capo: capoMatch ? `カポ ${capoMatch[1]}` : undefined,
    originalKey: keyMatch ? keyMatch[1] : undefined,
    variant,
  };
}

function extractLinesFromHtml(html: string): ChordLine[] {
  const lines: ChordLine[] = [];
  const lineRe = /<p\s+class="atfolhyds"[^>]*?data-atfolhyds="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(html)) !== null) {
    const inner = m[2];
    const segments = parseLineSegments(inner);
    if (segments.length === 0) continue;
    const hasLyric = segments.some((s) => s.text && s.text.trim() !== '');
    lines.push({ kind: hasLyric ? 'lyric' : 'plain', segments });
  }
  return lines;
}

/**
 * Parse the JS-embedded ChordPro-style array:
 *   var ufret_chord_datas = ["[C]　[Am]\r", "[F]白い[G]光に[C]…\r", …]
 *
 * Each array element is one line. Within a line, [Chord] markers are
 * followed by lyric text. Trailing \r is a line terminator we strip.
 */
function extractLinesFromJsData(html: string): ChordLine[] {
  const m = html.match(/(?:var\s+)?ufret_chord_datas\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) return [];
  let arr: string[];
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const lines: ChordLine[] = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw.replace(/\r$/, '');
    if (!cleaned.trim() && cleaned !== '') {
      // Whitespace-only line → preserve as a blank separator.
      lines.push({ kind: 'plain', segments: [] });
      continue;
    }
    if (cleaned === '') {
      lines.push({ kind: 'plain', segments: [] });
      continue;
    }
    const segments = parseChordProLine(cleaned);
    if (!segments.length) continue;
    const hasLyric = segments.some((s) => s.text && s.text.trim() !== '');
    lines.push({ kind: hasLyric ? 'lyric' : 'plain', segments });
  }
  return lines;
}

function parseChordProLine(line: string): ChordSegment[] {
  // Tokenize: optional leading text, then ([Chord]text)+
  const segments: ChordSegment[] = [];
  let i = 0;
  // Capture any leading text before the first [Chord].
  const firstBracket = line.indexOf('[');
  if (firstBracket > 0) {
    const leading = line.slice(0, firstBracket);
    if (leading) segments.push({ text: leading });
    i = firstBracket;
  } else if (firstBracket < 0) {
    // No chord markers — pure lyric / commentary line.
    segments.push({ text: line });
    return segments;
  }
  while (i < line.length) {
    if (line[i] !== '[') {
      // Unexpected stray text; flush as text appended to previous segment.
      const next = line.indexOf('[', i);
      const tail = line.slice(i, next < 0 ? line.length : next);
      if (segments.length && segments[segments.length - 1].text === undefined) {
        segments[segments.length - 1].text = tail;
      } else if (tail) {
        segments.push({ text: tail });
      }
      i = next < 0 ? line.length : next;
      continue;
    }
    const close = line.indexOf(']', i + 1);
    if (close < 0) break;
    const chord = line.slice(i + 1, close);
    const next = line.indexOf('[', close + 1);
    const text = line.slice(close + 1, next < 0 ? line.length : next);
    segments.push({ chord, text: text || undefined });
    i = next < 0 ? line.length : next;
  }
  return segments;
}

function parseLineSegments(html: string): ChordSegment[] {
  const segments: ChordSegment[] = [];
  let pendingChord: string | undefined;
  const spanRe = /<span\b[^>]*>([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = spanRe.exec(html)) !== null) {
    const inner = m[1];
    const rt = inner.match(/<rt[^>]*>([^<]*)<\/rt>/);
    if (rt) {
      if (pendingChord !== undefined) segments.push({ chord: pendingChord });
      pendingChord = decodeHtml(rt[1]).trim();
    } else {
      const text = decodeHtml(inner.replace(/<[^>]+>/g, ''));
      if (pendingChord !== undefined) {
        segments.push({ chord: pendingChord, text: text || undefined });
        pendingChord = undefined;
      } else if (text) {
        segments.push({ text });
      }
    }
  }
  if (pendingChord !== undefined) segments.push({ chord: pendingChord });
  return segments;
}

function collectUniqueChords(lines: ChordLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    for (const s of l.segments) {
      if (s.chord && !seen.has(s.chord)) {
        seen.add(s.chord);
        out.push(s.chord);
      }
    }
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
