/**
 * Pure music-theory utilities. No DOM, no IO.
 *
 *  - 12-tone equal temperament; pitch-class indices 0..11 (C..B).
 *  - Standard guitar tuning, low-E first: [40, 45, 50, 55, 59, 64].
 *  - Scale = list of intervals from root in semitones.
 *  - Key = (rootClass, mode); mode is 'major' | 'minor'.
 *
 * Used by the fretboard panel to overlay scales on the neck and to
 * auto-detect the key of a chord+lyric song.
 */

export type Mode = 'major' | 'minor';
export type Accidental = 'sharp' | 'flat';
export type ScaleId =
  | 'major' | 'natural_minor' | 'harmonic_minor' | 'melodic_minor'
  | 'pentatonic_major' | 'pentatonic_minor' | 'blues'
  | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'locrian';

export type Display =
  | 'name-sharp'    // C C# D D# E F F# G G# A A# B
  | 'name-flat'     // C Db D Eb E F Gb G Ab A Bb B
  | 'doremi-fixed'  // 固定ド: ド ド# レ レ# ミ ファ ファ# ソ ソ# ラ ラ# シ
  | 'doremi-movable'// 移動ド: scale-relative ド レ ミ ファ ソ ラ シ
  | 'degree'        // 1 ♭2 2 ♭3 3 4 ♭5 5 ♭6 6 ♭7 7
  | 'interval';     // R ♭2 M2 m3 M3 P4 TT P5 m6 M6 m7 M7

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const DOREMI_FIXED = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'] as const;
/** Movable-do letters indexed by *scale step* (not chromatic). */
export const DOREMI_MOVABLE = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'] as const;
/** Degree numerals indexed by chromatic distance from root. */
export const DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'] as const;
export const INTERVAL_LABELS = ['R', '♭2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'] as const;

export const NOTE_INDEX: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11, 'B#': 0,
};

/** Standard guitar tuning, by string index (0 = low E (string 6), 5 = high E (string 1)). */
export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];

export const SCALES: Record<ScaleId, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  natural_minor:    [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor:   [0, 2, 3, 5, 7, 8, 11],
  melodic_minor:    [0, 2, 3, 5, 7, 9, 11],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  aeolian:          [0, 2, 3, 5, 7, 8, 10], // == natural minor
  locrian:          [0, 1, 3, 5, 6, 8, 10],
};

export const SCALE_LABELS_JA: Record<ScaleId, string> = {
  major:            'メジャー',
  natural_minor:    'ナチュラルマイナー',
  harmonic_minor:   'ハーモニックマイナー',
  melodic_minor:    'メロディックマイナー',
  pentatonic_major: 'メジャーペンタ',
  pentatonic_minor: 'マイナーペンタ',
  blues:            'ブルース',
  dorian:           'ドリアン',
  phrygian:         'フリジアン',
  lydian:           'リディアン',
  mixolydian:       'ミクソリディアン',
  aeolian:          'エオリアン',
  locrian:          'ロクリアン',
};

/** Pitch class 0..11 → display string for the chosen mode. */
export function noteLabel(
  pc: number,
  display: Display,
  rootClass: number,
  scale: number[]
): string {
  const class0 = ((pc % 12) + 12) % 12;
  const distFromRoot = ((class0 - rootClass) + 12) % 12;
  switch (display) {
    case 'name-sharp':    return SHARP_NAMES[class0];
    case 'name-flat':     return FLAT_NAMES[class0];
    case 'doremi-fixed':  return DOREMI_FIXED[class0];
    case 'doremi-movable': {
      const stepIdx = scale.indexOf(distFromRoot);
      if (stepIdx >= 0 && stepIdx < DOREMI_MOVABLE.length) return DOREMI_MOVABLE[stepIdx];
      // Non-diatonic: fall back to nearest diatonic step with sharp/flat indication.
      // Pick the closest scale degree below and label as ♯ of that degree.
      let prev = -1;
      for (let s = 0; s < scale.length; s++) {
        if (scale[s] < distFromRoot) prev = s;
      }
      if (prev >= 0 && prev < DOREMI_MOVABLE.length) return DOREMI_MOVABLE[prev] + '♯';
      return '♭' + DOREMI_MOVABLE[0];
    }
    case 'degree':        return DEGREE_LABELS[distFromRoot];
    case 'interval':      return INTERVAL_LABELS[distFromRoot];
  }
}

/** True iff the given pitch class is in the (root + scale). */
export function inScale(pc: number, rootClass: number, scale: number[]): boolean {
  const dist = ((pc - rootClass) % 12 + 12) % 12;
  return scale.includes(dist);
}

/* =========================== Key detection =========================== */

/** Diatonic chord qualities for major and minor keys.
 * Encoded as the chord *root* (semitones from key root) + 'M' (major) | 'm' (minor) | 'd' (dim). */
const MAJOR_DIATONIC = [
  { interval: 0, q: 'M' }, // I
  { interval: 2, q: 'm' }, // ii
  { interval: 4, q: 'm' }, // iii
  { interval: 5, q: 'M' }, // IV
  { interval: 7, q: 'M' }, // V
  { interval: 9, q: 'm' }, // vi
  { interval: 11, q: 'd' },// vii°
] as const;

const MINOR_DIATONIC = [
  { interval: 0, q: 'm' }, // i
  { interval: 2, q: 'd' }, // ii°
  { interval: 3, q: 'M' }, // III
  { interval: 5, q: 'm' }, // iv
  { interval: 7, q: 'm' }, // v  (also commonly major V from harmonic minor)
  { interval: 7, q: 'M' }, // V  (harmonic minor)
  { interval: 8, q: 'M' }, // VI
  { interval: 10, q: 'M' },// VII
] as const;

export interface ChordToken {
  rootClass: number;     // 0..11
  quality: 'M' | 'm' | 'd' | 'aug' | 'sus' | 'dom7' | 'unknown';
}

const ROOT_RE = /^([A-G](?:#|b)?)/;

/** Tokenize a chord symbol into (rootClass, quality). Tolerant of slash bass,
 * sus, add, 7/9/11/13, dim, aug. */
export function parseChordSymbol(sym: string): ChordToken | null {
  const s = sym.trim();
  const m = s.match(ROOT_RE);
  if (!m) return null;
  const root = m[1];
  const idx = NOTE_INDEX[root];
  if (idx === undefined) return null;
  const rest = s.slice(root.length).split('/')[0]; // drop slash bass
  const lower = rest.toLowerCase();
  let quality: ChordToken['quality'] = 'M';
  if (lower === '' || lower.startsWith('maj') || lower.startsWith('major')) {
    quality = 'M';
  } else if (lower.startsWith('m7-5') || lower.startsWith('m7b5')) {
    quality = 'd';
  } else if (lower.startsWith('m')) {
    quality = 'm';
  } else if (lower.startsWith('dim')) {
    quality = 'd';
  } else if (lower.startsWith('aug') || lower.startsWith('+')) {
    quality = 'aug';
  } else if (lower.startsWith('sus')) {
    quality = 'sus';
  } else if (lower.startsWith('7') || lower.startsWith('9') || lower.startsWith('11') || lower.startsWith('13')) {
    quality = 'dom7';
  }
  return { rootClass: idx, quality };
}

export interface KeyCandidate {
  rootClass: number;
  mode: Mode;
  score: number;
}

/**
 * Score 24 candidate keys by how well a chord progression fits each.
 *
 * Scoring rules:
 *  - +2 per chord whose (root, quality) is diatonic to the candidate key
 *  - +1 per chord whose root is diatonic but quality differs (common in pop)
 *  - +0.5 per chord whose root is in the scale but quality is exotic
 *  - Tonic bonuses: first or last chord matching tonic of the key → +2 each
 *  - Mode disambiguation: if I and IV are present (major) → strong major;
 *    i and iv present → strong minor.
 *
 * Returns all 24 candidates ranked by score desc.
 */
export function detectKey(chordSymbols: string[]): KeyCandidate[] {
  const tokens = chordSymbols
    .map(parseChordSymbol)
    .filter((c): c is ChordToken => c !== null);
  if (!tokens.length) return [];

  const scoreCandidate = (rootClass: number, mode: Mode): number => {
    const diatonic = mode === 'major' ? MAJOR_DIATONIC : MINOR_DIATONIC;
    const scale = SCALES[mode === 'major' ? 'major' : 'natural_minor'];
    let s = 0;
    for (const t of tokens) {
      const intervalFromKey = ((t.rootClass - rootClass) % 12 + 12) % 12;
      const fits = diatonic.find((d) => d.interval === intervalFromKey && d.q === t.quality);
      if (fits) {
        s += 2;
        continue;
      }
      const rootFits = diatonic.some((d) => d.interval === intervalFromKey);
      if (rootFits) {
        s += 1;
        continue;
      }
      if (scale.includes(intervalFromKey)) s += 0.5;
    }
    // Tonic chord bonus.
    const tonicQ: ChordToken['quality'] = mode === 'major' ? 'M' : 'm';
    if (tokens[0]?.rootClass === rootClass && tokens[0]?.quality === tonicQ) s += 2;
    if (tokens[tokens.length - 1]?.rootClass === rootClass && tokens[tokens.length - 1]?.quality === tonicQ) s += 2;
    // Mode hints.
    if (mode === 'major') {
      const hasI = tokens.some((t) => t.rootClass === rootClass && t.quality === 'M');
      const hasIV = tokens.some((t) => ((t.rootClass - rootClass) + 12) % 12 === 5 && t.quality === 'M');
      if (hasI && hasIV) s += 1;
    } else {
      const hasi = tokens.some((t) => t.rootClass === rootClass && t.quality === 'm');
      const hasiv = tokens.some((t) => ((t.rootClass - rootClass) + 12) % 12 === 5 && t.quality === 'm');
      if (hasi && hasiv) s += 1;
    }
    return s;
  };

  const out: KeyCandidate[] = [];
  for (let r = 0; r < 12; r++) {
    out.push({ rootClass: r, mode: 'major', score: scoreCandidate(r, 'major') });
    out.push({ rootClass: r, mode: 'minor', score: scoreCandidate(r, 'minor') });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Convenience: return only the top-1 key, or null if no chords. */
export function bestKey(chordSymbols: string[]): KeyCandidate | null {
  const all = detectKey(chordSymbols);
  return all.length ? all[0] : null;
}

export function keyLabel(k: KeyCandidate, accidental: Accidental = 'sharp'): string {
  const root = (accidental === 'flat' ? FLAT_NAMES : SHARP_NAMES)[k.rootClass];
  return `${root} ${k.mode === 'major' ? 'major' : 'minor'}`;
}

/** Return the recommended scale id for a detected key. Major key → major
 * scale; minor key → natural minor (aeolian). Callers can override. */
export function defaultScaleForKey(k: KeyCandidate): ScaleId {
  return k.mode === 'major' ? 'major' : 'natural_minor';
}
