/**
 * Hand-curated guitar chord-shape data for the most common chord names.
 *
 * Conventions:
 * - frets[0..5] correspond to strings low-E, A, D, G, B, high-E.
 * - 0 = open, -1 = muted (don't play), n>=1 = press fret n.
 * - fingers[0..5] correspond 1:1 to frets[0..5]. 0 = no finger, 1..4 = index..pinky.
 * - barre is optional: { fret, fromString, toString } where strings are 0-indexed
 *   from low-E. fromString is the lower-pitched string (low-E side).
 * - When `baseFret` > 1, the diagram should show a fret position label and
 *   render relative positions (frets - baseFret + 1) on a 4-fret window.
 *
 * Coverage goal: open chords for all 12 roots in major/minor (with realistic
 * barre shapes where opens don't exist), plus 7 / m7 / maj7 for naturals.
 * Aim is "U-FRET-ish quick reference", not encyclopedic.
 */

export interface ChordShape {
  name: string;
  frets: number[];     // length 6: low-E .. high-E
  fingers: number[];   // length 6, 0..4
  baseFret?: number;   // default 1; if >1, frets are absolute fret numbers
  barre?: { fret: number; fromString: number; toString: number };
}

const SHAPES: ChordShape[] = [
  // --- Major opens ---
  { name: 'C',  frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { name: 'D',  frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  { name: 'E',  frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  { name: 'F',  frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 } },
  { name: 'G',  frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] },
  { name: 'A',  frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  { name: 'B',  frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 2, fromString: 1, toString: 5 } },

  // --- Minor opens ---
  { name: 'Cm', frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 3, fromString: 1, toString: 5 } },
  { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  { name: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { name: 'Fm', frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 } },
  { name: 'Gm', frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 3, fromString: 0, toString: 5 } },
  { name: 'Am', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  { name: 'Bm', frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, fromString: 1, toString: 5 } },

  // --- Dominant 7 ---
  { name: 'C7', frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  { name: 'D7', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  { name: 'E7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  { name: 'F7', frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 } },
  { name: 'G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { name: 'A7', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  { name: 'B7', frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },

  // --- Major 7 ---
  { name: 'Cmaj7', frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  { name: 'Dmaj7', frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3] },
  { name: 'Emaj7', frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] },
  { name: 'Fmaj7', frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  { name: 'Gmaj7', frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  { name: 'Amaj7', frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
  { name: 'Bmaj7', frets: [-1, 2, 4, 3, 4, -1], fingers: [0, 1, 3, 2, 4, 0] },

  // --- Minor 7 ---
  { name: 'Cm7', frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1], barre: { fret: 3, fromString: 1, toString: 5 } },
  { name: 'Dm7', frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  { name: 'Em7', frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  { name: 'Fm7', frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 } },
  { name: 'Gm7', frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], barre: { fret: 3, fromString: 0, toString: 5 } },
  { name: 'Am7', frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  { name: 'Bm7', frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 2, 0, 3, 0, 4] },

  // --- Sharps/flats (common barre shapes) ---
  { name: 'C#',  frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 4, fromString: 1, toString: 5 } },
  { name: 'C#m', frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 4, fromString: 1, toString: 5 } },
  { name: 'D#',  frets: [-1, 6, 5, 3, 4, 3], fingers: [0, 4, 3, 1, 2, 1] },
  { name: 'D#m', frets: [-1, -1, 4, 3, 4, 2], fingers: [0, 0, 3, 1, 4, 1] },
  { name: 'F#',  frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 } },
  { name: 'F#m', frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 } },
  { name: 'F#m7',frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 } },
  { name: 'G#',  frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 } },
  { name: 'G#m', frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 } },
  { name: 'A#',  frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 } },
  { name: 'A#m', frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 1, fromString: 1, toString: 5 } },

  // --- Slash / inversion staples ---
  { name: 'G/B',  frets: [-1, 2, 0, 0, 0, 3], fingers: [0, 2, 0, 0, 0, 4] },
  { name: 'D/F#', frets: [2, 0, 0, 2, 3, 2],  fingers: [2, 0, 0, 1, 4, 3] },
  { name: 'C/E',  frets: [0, 3, 2, 0, 1, 0],  fingers: [0, 3, 2, 0, 1, 0] },
  { name: 'C/G',  frets: [3, 3, 2, 0, 1, 0],  fingers: [3, 4, 2, 0, 1, 0] },
  { name: 'F/C',  frets: [-1, 3, 3, 2, 1, 1], fingers: [0, 3, 4, 2, 1, 1] },
  { name: 'Am/G', frets: [3, 0, 2, 2, 1, 0],  fingers: [3, 0, 2, 4, 1, 0] },

  // --- sus / add staples ---
  { name: 'Csus4', frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 2] },
  { name: 'Dsus4', frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
  { name: 'Esus4', frets: [0, 2, 2, 2, 0, 0],   fingers: [0, 1, 2, 3, 0, 0] },
  { name: 'Asus4', frets: [-1, 0, 2, 2, 3, 0],  fingers: [0, 0, 1, 2, 4, 0] },
  { name: 'Dadd9', frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] },
  { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 0],  fingers: [0, 2, 1, 0, 3, 0] },

  // --- Common flats (alias names) ---
  { name: 'Bb',  frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 } },
  { name: 'Bbm', frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 1, fromString: 1, toString: 5 } },
  { name: 'Eb',  frets: [-1, 6, 5, 3, 4, 3], fingers: [0, 4, 3, 1, 2, 1] },
  { name: 'Ebm', frets: [-1, -1, 4, 3, 4, 2], fingers: [0, 0, 3, 1, 4, 1] },
  { name: 'Ab',  frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 } },
  { name: 'Abm', frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 } },
  { name: 'Db',  frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 4, fromString: 1, toString: 5 } },
  { name: 'Gb',  frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 } },
];

const SHAPE_INDEX = new Map<string, ChordShape>();
for (const s of SHAPES) SHAPE_INDEX.set(s.name, s);

/**
 * Look up a chord shape by name. Performs minor enharmonic equivalence
 * (e.g. requesting Db falls back to C# if not found, and vice versa).
 */
export function findShape(name: string): ChordShape | undefined {
  if (SHAPE_INDEX.has(name)) return SHAPE_INDEX.get(name);

  // Strip slash bass: best effort fall back to root-only shape.
  const slashIdx = name.indexOf('/');
  if (slashIdx >= 0) {
    const rootOnly = name.slice(0, slashIdx);
    const fallback = SHAPE_INDEX.get(rootOnly);
    if (fallback) return { ...fallback, name }; // keep original display label
  }

  // Enharmonic fall back via simple substitution table.
  const enh: Record<string, string> = {
    'C#': 'Db', 'Db': 'C#', 'D#': 'Eb', 'Eb': 'D#',
    'F#': 'Gb', 'Gb': 'F#', 'G#': 'Ab', 'Ab': 'G#',
    'A#': 'Bb', 'Bb': 'A#',
  };
  const m = name.match(/^([A-G](?:#|b)?)(.*)$/);
  if (m) {
    const swap = enh[m[1]];
    if (swap) {
      const alt = swap + m[2];
      if (SHAPE_INDEX.has(alt)) return { ...SHAPE_INDEX.get(alt)!, name };
    }
  }
  return undefined;
}
