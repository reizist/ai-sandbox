/**
 * Lightweight runtime tests for chord-utils. Run with `tsx scripts/test-chord-utils.ts`.
 * Uses no test framework; exits non-zero on first failure.
 */
import { parseChord, transposeChord, applyCapo, simplifyChord, transformChord } from '../src/chord-utils.js';

let failed = 0;
function eq<T>(label: string, got: T, want: T): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failed++;
    console.error(`✗ ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

// --- parseChord ---
eq('parse C',     parseChord('C'),     { root: 'C', quality: '', raw: 'C' });
eq('parse Am7',   parseChord('Am7'),   { root: 'A', quality: 'm7', raw: 'Am7' });
eq('parse F#m7',  parseChord('F#m7'),  { root: 'F#', quality: 'm7', raw: 'F#m7' });
eq('parse G/B',   parseChord('G/B'),   { root: 'G', quality: '', bass: 'B', raw: 'G/B' });
eq('parse Bb7/D', parseChord('Bb7/D'), { root: 'Bb', quality: '7', bass: 'D', raw: 'Bb7/D' });

// --- transposeChord ---
eq('C +2 = D',         transposeChord('C', 2),         'D');
eq('Am7 +3 = Cm7',     transposeChord('Am7', 3),       'Cm7');
eq('G/B +5 = C/E',     transposeChord('G/B', 5),       'C/E');
eq('C -1 = B',         transposeChord('C', -1),        'B');
eq('C -1 (flat) = B',  transposeChord('C', -1, 'flat'),'B');
eq('D -1 (flat) = Db', transposeChord('D', -1, 'flat'),'Db');
eq('D -1 (sharp) = C#',transposeChord('D', -1, 'sharp'),'C#');

// --- applyCapo ---
// capo 5: original C → fingering shape G (5 semitones below)
eq('capo 5 C → G',   applyCapo('C', 5),   'G');
eq('capo 5 Am → Em', applyCapo('Am', 5),  'Em');
eq('capo 0 C → C',   applyCapo('C', 0),   'C');
eq('capo 3 F → D',   applyCapo('F', 3),   'D');

// --- simplifyChord ---
eq('simplify Am7 → Am',   simplifyChord('Am7'),    'Am');
eq('simplify Cmaj7 → C',  simplifyChord('Cmaj7'),  'C');
eq('simplify G/B → G',    simplifyChord('G/B'),    'G');
eq('simplify Fdim → Fm',  simplifyChord('Fdim'),   'Fm');
eq('simplify Faug → F',   simplifyChord('Faug'),   'F');
eq('simplify Csus4 → C',  simplifyChord('Csus4'),  'C');
eq('simplify F#m7-5 → F#m', simplifyChord('F#m7-5'), 'F#m');
eq('simplify C → C',      simplifyChord('C'),      'C');
eq('simplify Em7 → Em',   simplifyChord('Em7'),    'Em');

// --- transformChord composite ---
eq('compose: capo 2 + simplify on Am7',
   transformChord('Am7', { capo: 2, simplify: true }),
   'Gm');
eq('compose: transpose -1 on C',
   transformChord('C', { transpose: -1, accidental: 'flat' }),
   'B');

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
