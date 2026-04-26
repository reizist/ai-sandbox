/**
 * Pure chord-name utilities: parse / transpose / capo / simplify.
 * These operate on chord *symbols* (e.g. "G/B", "Am7", "F#m7-5") and
 * have no DOM/IO dependencies so they can be unit-tested trivially.
 */

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES =  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11, 'B#': 0,
};

export type Accidental = 'sharp' | 'flat';

export interface ParsedChord {
  root: string;       // e.g. "F#"
  quality: string;    // e.g. "m7", "maj7", "sus4", "" for major
  bass?: string;      // e.g. "B"
  /** Source chord, kept verbatim for round-trip when transformations don't apply. */
  raw: string;
}

const ROOT_RE = /^([A-G](?:#|b)?)/;

export function parseChord(input: string): ParsedChord | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(ROOT_RE);
  if (!m) return null;
  const root = m[1];
  const rest = s.slice(root.length);
  const slash = rest.indexOf('/');
  let quality = rest;
  let bass: string | undefined;
  if (slash >= 0) {
    quality = rest.slice(0, slash);
    const bm = rest.slice(slash + 1).match(ROOT_RE);
    if (bm) bass = bm[1];
  }
  return { root, quality, bass, raw: s };
}

function noteToIndex(note: string): number | null {
  const v = NOTE_INDEX[note];
  return v === undefined ? null : v;
}

function indexToNote(i: number, prefer: Accidental): string {
  const idx = ((i % 12) + 12) % 12;
  return prefer === 'flat' ? FLAT_NAMES[idx] : SHARP_NAMES[idx];
}

export function transposeChord(
  input: string,
  semitones: number,
  prefer: Accidental = 'sharp'
): string {
  const p = parseChord(input);
  if (!p) return input;
  const ri = noteToIndex(p.root);
  if (ri === null) return input;
  const newRoot = indexToNote(ri + semitones, prefer);
  let result = newRoot + p.quality;
  if (p.bass) {
    const bi = noteToIndex(p.bass);
    if (bi !== null) {
      const newBass = indexToNote(bi + semitones, prefer);
      result += '/' + newBass;
    } else {
      result += '/' + p.bass;
    }
  }
  return result;
}

/**
 * Capo display.
 *
 * Real-world convention: when a player puts the capo at fret N, they want to
 * see the chord *shape* they need to finger (which is the original chord
 * transposed DOWN by N semitones). The original chord remains the sounding
 * chord. This function returns the fingering chord for the given capo fret.
 */
export function applyCapo(input: string, capoFret: number): string {
  if (!capoFret) return input;
  return transposeChord(input, -capoFret);
}

/**
 * Heuristic chord simplification (U-FRET "簡単弾き" relative).
 * - 7 / maj7 / m7 / 9 / 11 / 13 / add9 → strip the extension
 * - sus2 / sus4 → base major
 * - dim / dim7 / m7-5 / m7b5 → minor
 * - aug / + → major
 * - / bass → drop slash
 *
 * Caveats: this is intentionally aggressive. We keep `m` (minor) because that
 * fundamentally changes feel; everything else collapses toward a clean
 * major / minor open-chord shape.
 */
export function simplifyChord(input: string): string {
  const p = parseChord(input);
  if (!p) return input;
  const q = p.quality.toLowerCase();
  // Order matters: check "maj" / "major" before generic "m..." since both share the m prefix.
  let simpleQuality: string;
  if (q === '' || q.startsWith('maj') || q.startsWith('major')) {
    simpleQuality = '';
  } else if (q.startsWith('m')) {
    // Includes m, m6, m7, m9, m11, m13, m7-5, m7b5, mb5, mdim, mMaj7 — all minor-flavored.
    simpleQuality = 'm';
  } else if (q.startsWith('dim') || q.startsWith('°')) {
    simpleQuality = 'm';
  } else if (q.startsWith('aug') || q.startsWith('+')) {
    simpleQuality = '';
  } else {
    // 7, 9, 11, 13, sus2, sus4, add9, 6 → all reduce to plain major.
    simpleQuality = '';
  }
  return p.root + simpleQuality;
}

export interface ChordTransformOptions {
  capo?: number;          // 0..12; capo fret for fingering display
  transpose?: number;     // semitones, applied to original key (changes sounding key)
  simplify?: boolean;     // collapse to plain M/m
  accidental?: Accidental;
}

/**
 * Apply transformations in a stable order:
 *   1. transpose (sounding-key change)
 *   2. capo (shape derivation; reduces displayed fret position)
 *   3. simplify (shape ergonomics)
 */
export function transformChord(input: string, opts: ChordTransformOptions): string {
  const { capo = 0, transpose = 0, simplify = false, accidental = 'sharp' } = opts;
  let out = input;
  if (transpose) out = transposeChord(out, transpose, accidental);
  if (capo)      out = applyCapo(out, capo);
  if (simplify)  out = simplifyChord(out);
  return out;
}
