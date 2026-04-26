import type { ChordShape } from './chord-shapes';
import { findShape } from './chord-shapes';

/**
 * Render a guitar chord as an inline SVG (4-fret window).
 * Returns an HTML string suitable for innerHTML insertion.
 */
export function renderChordDiagram(chordName: string, opts?: { width?: number }): string {
  const shape = findShape(chordName);
  const w = opts?.width ?? 80;
  if (!shape) return renderUnknownDiagram(chordName, w);
  return renderShape(shape, w);
}

function renderUnknownDiagram(name: string, w: number): string {
  const h = Math.round(w * 1.35);
  return `
    <svg class="chord-diagram chord-diagram-unknown" width="${w}" height="${h}" viewBox="0 0 100 135" role="img" aria-label="${escape(name)}">
      <text x="50" y="14" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">${escape(name)}</text>
      <rect x="15" y="30" width="70" height="80" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="3 3"/>
      <text x="50" y="78" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.5">no diagram</text>
    </svg>
  `;
}

function renderShape(shape: ChordShape, w: number): string {
  const h = Math.round(w * 1.35);
  // Determine fret window.
  const sounded = shape.frets.filter((f) => f > 0);
  const minFret = sounded.length ? Math.min(...sounded) : 1;
  const maxFret = sounded.length ? Math.max(...sounded) : 1;
  const baseFret = maxFret <= 4 ? 1 : minFret; // open-position vs barre-position

  // SVG layout (viewBox 100x135).
  const left = 15, right = 85;
  const top = 30, bottom = 110;
  const stringCount = 6;
  const fretRowCount = 5; // 4 frets + nut
  const stringX = (i: number) => left + (i * (right - left)) / (stringCount - 1);
  const fretY = (i: number) => top + (i * (bottom - top)) / (fretRowCount - 1);

  // Strings (vertical).
  let svg = '';
  for (let i = 0; i < stringCount; i++) {
    svg += `<line x1="${stringX(i)}" y1="${top}" x2="${stringX(i)}" y2="${bottom}" stroke="currentColor" stroke-width="1"/>`;
  }
  // Frets (horizontal). Top one is the "nut" if baseFret == 1, drawn thicker.
  for (let i = 0; i < fretRowCount; i++) {
    const isNut = baseFret === 1 && i === 0;
    svg += `<line x1="${left}" y1="${fretY(i)}" x2="${right}" y2="${fretY(i)}" stroke="currentColor" stroke-width="${isNut ? 3 : 1}"/>`;
  }

  // Open / muted markers above the nut.
  for (let i = 0; i < 6; i++) {
    const f = shape.frets[i];
    const cx = stringX(i);
    const cy = top - 8;
    if (f === 0) {
      svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
    } else if (f === -1) {
      svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="9" fill="currentColor">×</text>`;
    }
  }

  // Barre arc (single-fret barre rendered as a rounded line).
  if (shape.barre) {
    const { fret, fromString, toString } = shape.barre;
    const yIdx = fret - baseFret + 1;
    if (yIdx >= 1 && yIdx <= 4) {
      const yMid = (fretY(yIdx - 1) + fretY(yIdx)) / 2;
      const x1 = stringX(fromString);
      const x2 = stringX(toString);
      svg += `<line x1="${x1}" y1="${yMid}" x2="${x2}" y2="${yMid}" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.85"/>`;
    }
  }

  // Finger dots.
  for (let i = 0; i < 6; i++) {
    const f = shape.frets[i];
    if (f <= 0) continue;
    const yIdx = f - baseFret + 1;
    if (yIdx < 1 || yIdx > 4) continue;
    const cx = stringX(i);
    const cy = (fretY(yIdx - 1) + fretY(yIdx)) / 2;
    const finger = shape.fingers[i];
    const inBarre =
      shape.barre &&
      f === shape.barre.fret &&
      i >= shape.barre.fromString &&
      i <= shape.barre.toString;
    if (inBarre) continue; // already drawn by barre line
    svg += `<circle cx="${cx}" cy="${cy}" r="6" fill="currentColor"/>`;
    if (finger) {
      svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="8" fill="white" font-weight="600">${finger}</text>`;
    }
  }

  // Position indicator on the left if baseFret > 1.
  if (baseFret > 1) {
    svg += `<text x="${left - 4}" y="${fretY(0) + 12}" text-anchor="end" font-size="9" fill="currentColor">${baseFret}fr</text>`;
  }

  // Title.
  svg += `<text x="50" y="14" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">${escape(shape.name)}</text>`;

  return `<svg class="chord-diagram" width="${w}" height="${h}" viewBox="0 0 100 135" role="img" aria-label="${escape(shape.name)}">${svg}</svg>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}
