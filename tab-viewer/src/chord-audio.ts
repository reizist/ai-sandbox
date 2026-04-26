/**
 * Web Audio API based chord synthesis. We don't need realistic guitar tone —
 * just pluck/strum-like feedback so users can hear what a chord sounds like
 * when they click a diagram.
 *
 * Per string:
 *   - triangle oscillator at the fundamental (warm, body)
 *   - sawtooth oscillator at half amplitude (gives the bite)
 *   - one shared lowpass filter (cuts the saw to a guitar-ish formant)
 *   - ADSR-shaped gain envelope (5ms attack, ~1.6s release)
 *
 * Strings start with a small per-string offset (~9ms) so a downstrum has
 * the natural top-to-bottom (low-E → high-e) spread.
 *
 * The AudioContext is lazily created on first play, since browsers require
 * a user-gesture before audio can start.
 */

import type { ChordShape } from './chord-shapes';
import { findShape, type ChordShape as Shape } from './chord-shapes';
import { parseChord } from './chord-utils';

// Standard tuning, MIDI numbers of open strings (string 0 = low E).
const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (audioCtx) return audioCtx;
  // Use webkit-prefixed Safari fallback if needed.
  const Ctor = (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  audioCtx = new Ctor();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.18;
  masterGain.connect(audioCtx.destination);
  return audioCtx;
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

interface PlayChordOptions {
  /** "down" = low-to-high (default), "up" = reverse, "block" = simultaneous. */
  direction?: 'down' | 'up' | 'block';
  /** Per-string stagger in ms for strum feel. Default 9. */
  staggerMs?: number;
  /** Master volume multiplier (0..1). Default 1. */
  volume?: number;
  /** Length of sustain hold in seconds. Default 1.6. */
  durationSec?: number;
}

export function playChordShape(shape: Shape, opts: PlayChordOptions = {}): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    // Browsers may keep the context suspended until the next user gesture.
    void ctx.resume();
  }
  const direction = opts.direction ?? 'down';
  const stagger = (opts.staggerMs ?? 9) / 1000;
  const vol = opts.volume ?? 1;
  const duration = opts.durationSec ?? 1.6;
  const master = masterGain!;

  // Build the list of (stringIndex, fret) we need to sound.
  const playable: { stringIdx: number; fret: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const f = shape.frets[i];
    if (f >= 0) playable.push({ stringIdx: i, fret: f });
  }
  if (playable.length === 0) return;

  // Order based on strum direction. We index by stringIdx 0..5 (low → high).
  const ordered = playable.slice();
  if (direction === 'up') ordered.reverse();
  // 'block' keeps the array order but uses 0 stagger.

  const now = ctx.currentTime + 0.005; // tiny lead-in to avoid clicks
  ordered.forEach((p, idx) => {
    const startAt = direction === 'block' ? now : now + idx * stagger;
    const midi = STANDARD_TUNING_MIDI[p.stringIdx] + p.fret;
    const freq = midiToFreq(midi);
    pluckOnce(ctx, master, freq, startAt, duration, vol);
  });
}

/**
 * If we don't have a hard-coded shape, synthesize the root + a major/minor
 * triad as a fallback, so the click still produces a distinguishable sound.
 */
export function playChordByName(name: string, opts: PlayChordOptions = {}): void {
  const shape = findShape(name);
  if (shape) {
    playChordShape(shape, opts);
    return;
  }
  // Fallback: triad based on parsed root + quality.
  const p = parseChord(name);
  if (!p) return;
  const NOTE_INDEX: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11,
  };
  const rootIdx = NOTE_INDEX[p.root];
  if (rootIdx === undefined) return;
  // Root in 3rd octave.
  const root = 48 + rootIdx;
  const isMinor = /^(m|min|m7|m9|dim|m7-5|m7b5|mdim)/i.test(p.quality);
  const third = root + (isMinor ? 3 : 4);
  const fifth = root + 7;
  const seventh = root + (isMinor ? 10 : (/(maj|major)/i.test(p.quality) ? 11 : 10));
  const includeSeventh = /7|9|11|13/.test(p.quality);
  const notes = [root, third, fifth, root + 12];
  if (includeSeventh) notes.push(seventh);

  const ctx = getCtx();
  if (ctx.state === 'suspended') void ctx.resume();
  const master = masterGain!;
  const now = ctx.currentTime + 0.005;
  const stagger = (opts.staggerMs ?? 9) / 1000;
  const dir = opts.direction ?? 'down';
  const ordered = dir === 'up' ? notes.slice().reverse() : notes.slice();
  ordered.forEach((midi, idx) => {
    const startAt = dir === 'block' ? now : now + idx * stagger;
    pluckOnce(ctx, master, midiToFreq(midi), startAt, opts.durationSec ?? 1.4, opts.volume ?? 0.85);
  });
}

function pluckOnce(
  ctx: AudioContext, master: GainNode, freq: number,
  startAt: number, duration: number, vol: number
): void {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc2.type = 'sawtooth';
  osc1.frequency.value = freq;
  osc2.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1;
  // Higher-frequency strings get a brighter cutoff.
  filter.frequency.setValueAtTime(Math.min(6000, freq * 6 + 800), startAt);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2), startAt + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(0.32 * vol, startAt + 0.005);   // attack
  env.gain.exponentialRampToValueAtTime(0.18 * vol, startAt + 0.08);    // initial decay
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);    // release

  // Slightly attenuate the sawtooth to keep things from sounding harsh.
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.45;

  osc1.connect(filter);
  osc2.connect(sawGain).connect(filter);
  filter.connect(env).connect(master);

  osc1.start(startAt);
  osc2.start(startAt);
  osc1.stop(startAt + duration + 0.05);
  osc2.stop(startAt + duration + 0.05);
}

/** Toggle global audio output. Returns the new enabled state. */
export function setAudioEnabled(enabled: boolean): boolean {
  if (!audioCtx) return enabled;
  masterGain!.gain.value = enabled ? 0.18 : 0;
  return enabled;
}

export type { ChordShape };
