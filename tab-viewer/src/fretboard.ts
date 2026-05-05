/**
 * SVG fretboard renderer. Produces an inline-SVG string with notes overlaid
 * for the chosen scale + display mode + visible string-pair layers.
 *
 *  - String index 0 = low E (string 6); index 5 = high E (string 1).
 *  - Visually we put the high-E string on TOP (guitarist's-view convention),
 *    so we draw rows in reverse order.
 *  - Frets: 0 = open string (label area), 1..endFret as fret cells.
 */

import {
  STANDARD_TUNING_MIDI, SCALES, noteLabel, inScale,
  type ScaleId, type Display,
} from './music-theory';

export type LayerKey = 'treble' | 'mid' | 'bass';

/** Map each string index (0=low E .. 5=high E) to its layer pair. */
const STRING_LAYER: Record<number, LayerKey> = {
  0: 'bass',  1: 'bass',   // low E, A  (strings 6, 5)
  2: 'mid',   3: 'mid',    // D, G      (strings 4, 3)
  4: 'treble',5: 'treble', // B, high E (strings 2, 1)
};

export interface FretboardOptions {
  /** Inclusive fret range. Default 0..15. */
  startFret?: number;
  endFret?: number;
  /** Scale root, 0..11. */
  rootClass: number;
  /** Scale identifier, used to compute which notes light up. */
  scale: ScaleId;
  /** How notes are labelled (name / doremi / degree / interval). */
  display: Display;
  /** Layers visible. */
  layers: { treble: boolean; mid: boolean; bass: boolean };
  /** Show non-diatonic notes too (greyed). Default false. */
  showAllNotes?: boolean;
  /** Optional chord overlay: highlight these pitch classes as chord tones (root, 3rd, 5th, 7th). */
  chordTones?: { root: number; third?: number; fifth?: number; seventh?: number };
}

const FRET_INLAY_SINGLE = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const FRET_INLAY_DOUBLE = new Set([12, 24]);

export function renderFretboard(opts: FretboardOptions): string {
  const startFret = opts.startFret ?? 0;
  const endFret = opts.endFret ?? 15;
  const fretCount = endFret - startFret + 1; // includes the open-string column when startFret==0
  const scaleIntervals = SCALES[opts.scale];

  // Layout constants. Tuned so a 0..15 fretboard sits comfortably ~1100px wide.
  const cellW = 64;          // width per fret cell
  const openColW = 44;       // open-string column at the left
  const stringSpace = 32;    // vertical pixels per string
  const padTop = 28;         // header (fret numbers)
  const padBottom = 14;
  const padLeft = 12;
  const padRight = 16;

  const fretAreaW = (fretCount - (startFret === 0 ? 1 : 0)) * cellW + (startFret === 0 ? openColW : 0);
  const totalW = padLeft + fretAreaW + padRight;
  const totalH = padTop + 6 * stringSpace + padBottom;

  const stringY = (visibleIdx: number) => padTop + visibleIdx * stringSpace + stringSpace / 2;
  const fretX = (fretAbs: number): number => {
    if (startFret === 0) {
      if (fretAbs === 0) return padLeft + openColW / 2;
      return padLeft + openColW + (fretAbs - 1) * cellW + cellW / 2;
    }
    return padLeft + (fretAbs - startFret) * cellW + cellW / 2;
  };
  const fretLineX = (fretAbs: number): number => {
    if (startFret === 0) {
      if (fretAbs === 0) return padLeft + openColW;
      return padLeft + openColW + (fretAbs - startFret) * cellW;
    }
    return padLeft + (fretAbs - startFret + 1) * cellW;
  };

  const parts: string[] = [];

  // Background
  parts.push(`<rect x="${padLeft}" y="${padTop - 4}" width="${fretAreaW}" height="${6 * stringSpace + 8}" fill="var(--fb-bg, #0d1117)" rx="4"/>`);

  // Inlay dots
  for (let f = Math.max(1, startFret); f <= endFret; f++) {
    const cx = fretX(f);
    const midY = padTop + 3 * stringSpace;
    if (FRET_INLAY_SINGLE.has(f)) {
      parts.push(`<circle cx="${cx}" cy="${midY}" r="6" fill="rgba(255,255,255,0.08)"/>`);
    } else if (FRET_INLAY_DOUBLE.has(f)) {
      parts.push(`<circle cx="${cx}" cy="${padTop + 1.5 * stringSpace}" r="6" fill="rgba(255,255,255,0.10)"/>`);
      parts.push(`<circle cx="${cx}" cy="${padTop + 4.5 * stringSpace}" r="6" fill="rgba(255,255,255,0.10)"/>`);
    }
  }

  // Fret lines (vertical). Nut is special — thicker if startFret == 0.
  for (let f = startFret; f <= endFret + 1; f++) {
    if (startFret === 0 && f === 0) continue;
    const x = fretLineX(f - 1) || fretLineX(f);
    // Compute precise x for this fret line.
    const lineX = startFret === 0
      ? (f === 0 ? padLeft + openColW : padLeft + openColW + (f - 1) * cellW + cellW)
      : padLeft + (f - startFret + 1) * cellW;
    const isNutColumn = startFret === 0 && f === 1;
    const w = isNutColumn ? 4 : 1.4;
    const stroke = isNutColumn ? 'rgba(220, 220, 230, 0.85)' : 'rgba(180, 180, 200, 0.45)';
    parts.push(`<line x1="${lineX - w / 2}" y1="${padTop}" x2="${lineX - w / 2}" y2="${padTop + 6 * stringSpace}" stroke="${stroke}" stroke-width="${w}"/>`);
    void x;
  }

  // Strings (horizontal). Top = high E (string 5 in our index).
  for (let i = 0; i < 6; i++) {
    const visibleIdx = i; // visible row index 0=top
    const stringIdx = 5 - i; // pitch index: row 0 → high E (idx 5)
    const layer = STRING_LAYER[stringIdx];
    const isVisible = opts.layers[layer];
    const y = stringY(visibleIdx);
    const opacity = isVisible ? 1 : 0.18;
    const strokeWidth = 0.9 + (5 - stringIdx) * 0.18; // thicker for low strings
    parts.push(
      `<line x1="${padLeft + 4}" y1="${y}" x2="${padLeft + fretAreaW - 4}" y2="${y}" stroke="rgba(220,220,230,0.85)" stroke-width="${strokeWidth.toFixed(2)}" opacity="${opacity}"/>`
    );
  }

  // Fret number labels
  for (let f = startFret; f <= endFret; f++) {
    if (startFret === 0 && f === 0) continue;
    const cx = fretX(f);
    parts.push(`<text x="${cx}" y="${padTop - 10}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.55)" font-weight="600">${f}</text>`);
  }

  // Note circles
  for (let i = 0; i < 6; i++) {
    const stringIdx = 5 - i;
    const layer = STRING_LAYER[stringIdx];
    if (!opts.layers[layer]) continue;
    const y = stringY(i);
    const baseMidi = STANDARD_TUNING_MIDI[stringIdx];
    for (let f = startFret; f <= endFret; f++) {
      const pc = (baseMidi + f) % 12;
      const inScaleNote = inScale(pc, opts.rootClass, scaleIntervals);
      if (!inScaleNote && !opts.showAllNotes) continue;
      const distFromRoot = ((pc - opts.rootClass) + 12) % 12;
      const isRoot = distFromRoot === 0;
      const isThird = distFromRoot === 3 || distFromRoot === 4;
      const isFifth = distFromRoot === 6 || distFromRoot === 7;
      let fill = 'rgba(120,120,135,0.55)';
      let textColor = 'rgba(255,255,255,0.75)';
      if (inScaleNote) {
        fill = 'rgba(74, 142, 255, 0.88)';   // blue — scale tone
        textColor = '#ffffff';
        if (isThird) fill = 'rgba(168, 85, 247, 0.88)';  // purple — third
        if (isFifth) fill = 'rgba(34, 197, 94, 0.88)';   // green — fifth
        if (isRoot)  fill = 'rgba(244, 63, 94, 0.95)';   // red/pink — root (highest priority)
      }
      const cx = fretX(f);
      const r = 13;
      const label = noteLabel(pc, opts.display, opts.rootClass, scaleIntervals);
      // Slightly smaller text for 2-char labels, smaller still for ♯ ♭ versions
      const fontSize = label.length >= 3 ? 9 : (label.length === 2 ? 10.5 : 12);
      parts.push(`<circle cx="${cx}" cy="${y}" r="${r}" fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>`);
      parts.push(`<text x="${cx}" y="${y + 3.5}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${textColor}" font-family="system-ui, -apple-system, sans-serif">${escapeXml(label)}</text>`);
    }
  }

  // Chord tones overlay (if any) — outline ring around chord tone circles.
  // We just draw a slightly larger ring where the pitch class equals one of root/third/fifth/seventh.

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="100%" height="${totalH}" style="display:block; max-width: 100%;">
${parts.join('\n')}
  </svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}
