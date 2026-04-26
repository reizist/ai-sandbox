/**
 * Fetches a Songsterr chord page (e.g.
 * https://www.songsterr.com/a/wsa/spitz-cherry-chords-s249289) and extracts
 * the chord+lyric structure. The chord content is server-side rendered into
 * the HTML response, so no JS execution is required.
 */

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

export interface ChordSegment {
  chord?: string;
  text?: string;
}

export interface ChordLine {
  /** "plain" = chord-only header line, "lyric" = mixed chord+text, "tuning" = "Standard (EADGBE)" */
  kind: 'plain' | 'lyric' | 'tuning';
  segments: ChordSegment[];
}

export interface ChordPageMeta {
  songId: number;
  chordsRevisionId: number;
  chordpro: string;
  artist: string;
  title: string;
  /** Tuning string like "Standard (EADGBE)" if present */
  tuning?: string;
}

export interface ChordPageResult {
  meta: ChordPageMeta;
  lines: ChordLine[];
  /** Distinct chord names referenced in the page (in first-encountered order) */
  uniqueChords: string[];
}

export async function fetchSongsterrChordPage(
  url: string
): Promise<ChordPageResult> {
  const res = await fetch(url, { headers: browserHeaders });
  if (!res.ok) {
    throw new Error(`Chord page fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return parseChordPage(html);
}

export function parseChordPage(html: string): ChordPageResult {
  const meta = extractMeta(html);
  const lines = extractLines(html);
  const uniqueChords: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const seg of line.segments) {
      if (seg.chord && !seen.has(seg.chord)) {
        seen.add(seg.chord);
        uniqueChords.push(seg.chord);
      }
    }
  }
  return { meta, lines, uniqueChords };
}

function extractMeta(html: string): ChordPageMeta {
  const m = html.match(
    /<script[^>]*id=["']state["'][^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) throw new Error('No state script in chord page');
  const state = JSON.parse(m[1]);
  const current = state?.chords?.current;
  if (!current) {
    throw new Error('chords.current missing — is this a chord page?');
  }
  if (
    typeof current.songId !== 'number' ||
    typeof current.chordsRevisionId !== 'number' ||
    typeof current.chordpro !== 'string'
  ) {
    throw new Error('chord meta missing required fields');
  }

  // Tuning is rendered into a paragraph with class JCGqHW_lineText yy3nYW_tuning
  const tuningMatch = html.match(
    /<p class="JCGqHW_lineText[^"]*yy3nYW_tuning[^"]*"[^>]*>([\s\S]*?)<\/p>/
  );
  const tuning = tuningMatch ? stripTags(tuningMatch[1]).trim() : undefined;

  return {
    songId: current.songId,
    chordsRevisionId: current.chordsRevisionId,
    chordpro: current.chordpro,
    artist: current.artist || 'Unknown Artist',
    title: current.title || 'Song',
    tuning
  };
}

function extractLines(html: string): ChordLine[] {
  const lines: ChordLine[] = [];
  // <p class="JCGqHW_line">...</p>      — chord+text mix
  // <p class="JCGqHW_plainLine">...</p> — chord-only header
  // <p class="JCGqHW_lineText ...">...</p> — pure text (e.g. tuning, Verse markers)
  const lineRe =
    /<p\s+class="JCGqHW_(line|plainLine|lineText)[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(html)) !== null) {
    const variant = m[1];
    const inner = m[2];
    const segments = parseLineSegments(inner);
    if (segments.length === 0) continue;
    if (variant === 'lineText') {
      // Skip tuning paragraph here — handled in meta. Other plain text lines
      // keep as 'lyric' style with a single text segment.
      const isTuning = inner.includes('yy3nYW_tuning');
      if (isTuning) continue;
      lines.push({ kind: 'lyric', segments });
    } else if (variant === 'plainLine') {
      lines.push({ kind: 'plain', segments });
    } else {
      lines.push({ kind: 'lyric', segments });
    }
  }
  return lines;
}

function parseLineSegments(html: string): ChordSegment[] {
  // Each block is one of:
  //   <span class="JCGqHW_block JCGqHW_blockChord">...chord+optional text...</span>
  //   <span class="JCGqHW_block JCGqHW_blockText">...text only...</span>
  //   <span class="JCGqHW_block JCGqHW_blockPlain">...chord-or-text...</span>
  const blockRe =
    /<span\s+class="JCGqHW_block\s+JCGqHW_block(Chord|Text|Plain)[^"]*"[^>]*>([\s\S]*?)<\/span>(?=\s*(?:<span\s+class="JCGqHW_block|<\/p|$))/g;
  const segments: ChordSegment[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const inner = m[2];
    const chord = extractChord(inner);
    const text = extractText(inner);
    if (chord || text) segments.push({ chord, text });
  }
  if (segments.length === 0) {
    // Fallback: simple text-only paragraph (verse markers etc.)
    const text = stripTags(html).trim();
    if (text) segments.push({ text });
  }
  return segments;
}

function extractChord(html: string): string | undefined {
  // <label ... data-chord="Am">...<span class="o2eIFa_middle">Am</span></label>
  const m = html.match(/data-chord="([^"]+)"/);
  return m ? decodeHtml(m[1]) : undefined;
}

function extractText(html: string): string | undefined {
  // The text content is in <span class="JCGqHW_text">...</span> within blockText
  // and immediately after the label inside blockChord.
  const textMatches = [...html.matchAll(
    /<span class="JCGqHW_text[^"]*">([\s\S]*?)<\/span>/g
  )];
  if (textMatches.length === 0) return undefined;
  const combined = textMatches.map((m) => stripTags(m[1])).join('');
  const decoded = decodeHtml(combined);
  return decoded || undefined;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
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
