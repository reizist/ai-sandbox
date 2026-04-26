/**
 * Ultimate Guitar fetcher (Playwright-backed).
 *
 * UG sits behind Cloudflare's bot challenge so plain HTTP fetch is 403'd.
 * We use Playwright to satisfy the challenge transparently. Cost: ~5-10s
 * per page including launch, so this fetcher is for completing chord
 * coverage where U-FRET / Songsterr came up empty — not bulk import.
 *
 * Tab pages render the chord+lyric body in a <pre> using the classic
 * ASCII layout:
 *
 *     C             G/B    Am7
 *     kimi o wasurenai magarikunetta
 *     F               C       F                 G
 *     umaretate no taiyou to yume o wataru kiroi suna
 *
 * Chord lines and lyric lines alternate; chord positions over lyric
 * characters tell us which chord falls on which syllable.
 */
import { chromium, type BrowserContext } from 'playwright';
import type { ChordLine, ChordSegment, ChordsFile } from '../../src/types';

const SEARCH_URL = (q: string) =>
  `https://www.ultimate-guitar.com/search.php?value=${encodeURIComponent(q)}&search_type=title`;

export interface UGTabRef {
  href: string;
  text: string;
}

export interface UGFetchResult {
  meta: { title: string; artist: string; sourceUrl: string };
  chordsFile: ChordsFile;
}

/**
 * Open a long-lived browser context. Reuse it across calls to amortize the
 * Cloudflare-challenge cost.
 */
export async function openUgContext(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'ja-JP',
    extraHTTPHeaders: { 'Accept-Language': 'ja,en-US;q=0.9' },
  });
  return {
    context,
    close: async () => { await context.close(); await browser.close(); },
  };
}

export async function searchUG(
  context: BrowserContext,
  query: string,
  type: 'chords' | 'tabs' | 'any' = 'chords'
): Promise<UGTabRef[]> {
  const page = await context.newPage();
  try {
    await page.goto(SEARCH_URL(query), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => !!document.querySelector('a[href*="/tab/"]'), { timeout: 30_000 }).catch(() => {});
    const refs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/tab/"]'))
        .map((a) => ({ text: a.textContent?.trim() ?? '', href: a.href }));
    });
    // Filter by type heuristic — UG stores type in the URL slug for older URLs;
    // for the newer numeric-only URLs we have to fetch the page to know.
    return refs;
  } finally {
    await page.close();
  }
}

export async function fetchUgTab(
  context: BrowserContext,
  url: string
): Promise<UGFetchResult> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('pre', { timeout: 30_000 }).catch(() => {});
    const data = await page.evaluate(() => {
      const pre = document.querySelector('pre');
      const title = document.querySelector('title')?.textContent ?? '';
      return { pre: pre?.textContent ?? '', title };
    });
    const meta = parseTitleMeta(data.title);
    const lines = parseAsciiChordPre(data.pre);
    if (!lines.length) throw new Error('no parseable chord/lyric lines in <pre>');
    const uniqueChords = collectUnique(lines);
    return {
      meta: { title: meta.title, artist: meta.artist, sourceUrl: url },
      chordsFile: {
        meta: { songId: 0, chordsRevisionId: 0, chordpro: '', artist: meta.artist, title: meta.title },
        lines, uniqueChords,
      },
    };
  } finally {
    await page.close();
  }
}

/* ------------------------ helpers ------------------------ */

function parseTitleMeta(title: string): { title: string; artist: string } {
  // Pattern: "{TITLE_UPPER} {kanji} CHORDS by {Artist} @ Ultimate-Guitar.Com"
  const m = title.match(/^(.+?)\s+(?:CHORDS|TAB|GUITAR PRO|BASS|UKULELE|DRUM)\s+by\s+(.+?)\s*@/);
  if (m) {
    return { title: m[1].trim(), artist: m[2].trim() };
  }
  return { title: title.replace(/\s*@.*$/, '').trim(), artist: '' };
}

function parseAsciiChordPre(text: string): ChordLine[] {
  // Strip [intro], [verse] tags but preserve them as plain lines.
  const result: ChordLine[] = [];
  const rawLines = text.replace(/\r/g, '').split('\n');
  // Trim leading credit/comment lines (typically wrapped in quotes or prefixed).
  for (let i = 0; i < rawLines.length; i++) {
    const cur = rawLines[i];
    const next = rawLines[i + 1];
    if (!cur.trim() && !cur) {
      // pure empty → skip (we don't represent blank lines yet)
      continue;
    }
    if (isChordOnlyLine(cur)) {
      if (next !== undefined && next.trim() && !isChordOnlyLine(next) && !looksLikeSection(next)) {
        result.push({ kind: 'lyric', segments: pairChordAndLyric(cur, next) });
        i++;
      } else {
        result.push({ kind: 'plain', segments: chordOnlySegments(cur) });
      }
    } else if (cur.trim()) {
      result.push({ kind: 'lyric', segments: [{ text: cur }] });
    }
  }
  return result;
}

const CHORD_TOKEN_RE = /^[A-G](?:#|b)?(?:m|M|maj|min|dim|aug|sus|add|°|\+)?[0-9bM#]*(?:\/[A-G](?:#|b)?)?$/;

function isChordOnlyLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (looksLikeSection(line)) return false; // [Intro] etc.
  const tokens = t.split(/\s+/);
  if (tokens.length === 0) return false;
  // Allow tokens like "N.C." (no chord) too.
  return tokens.every((tok) => CHORD_TOKEN_RE.test(tok) || tok === 'N.C.' || tok === 'NC');
}

function looksLikeSection(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(line);
}

function pairChordAndLyric(chordLine: string, lyricLine: string): ChordSegment[] {
  const segments: ChordSegment[] = [];
  const positions: { col: number; chord: string }[] = [];
  const tokenRe = /(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(chordLine)) !== null) {
    positions.push({ col: m.index, chord: m[1] });
  }
  if (positions.length === 0) return [{ text: lyricLine }];
  if (positions[0].col > 0) {
    const leading = lyricLine.slice(0, positions[0].col);
    if (leading) segments.push({ text: leading });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].col;
    const end = i < positions.length - 1 ? positions[i + 1].col : Math.max(lyricLine.length, chordLine.length);
    const text = lyricLine.slice(Math.min(start, lyricLine.length), Math.min(end, lyricLine.length));
    segments.push({ chord: positions[i].chord, text: text || undefined });
  }
  return segments;
}

function chordOnlySegments(line: string): ChordSegment[] {
  const out: ChordSegment[] = [];
  const tokenRe = /(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(line)) !== null) out.push({ chord: m[1] });
  return out;
}

function collectUnique(lines: ChordLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) for (const s of l.segments) {
    if (s.chord && !seen.has(s.chord)) { seen.add(s.chord); out.push(s.chord); }
  }
  return out;
}
