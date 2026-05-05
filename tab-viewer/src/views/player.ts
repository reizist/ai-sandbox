import * as alphaTab from '@coderline/alphatab';
import { findArtist, findSong, loadCatalog } from '../catalog';
import { escapeHtml } from '../router';
import type {
  ChordsFile, ChordLine, ChordSegment, CatalogArtist, CatalogSong,
} from '../types';
import {
  preferredTabUrl, legacyTabUrl,
  preferredChordsUrl, legacyChordsUrl, resolveAssetUrl,
} from '../paths';
import { transformChord, type ChordTransformOptions, type Accidental } from '../chord-utils';
import { renderChordDiagram } from '../chord-diagram';
import { playChordByName, setAudioEnabled } from '../chord-audio';
import { searchYouTubeAdHoc, type RankedRef } from '../youtube-search';
import { renderFretboard, type LayerKey } from '../fretboard';
import {
  bestKey, defaultScaleForKey, keyLabel, SCALE_LABELS_JA,
  SHARP_NAMES, FLAT_NAMES,
  type ScaleId, type Display as NoteDisplay, type Mode as KeyMode,
} from '../music-theory';

let activeApi: alphaTab.AlphaTabApi | null = null;

type LayoutMode = 'tab' | 'chords' | 'both' | 'videos' | 'fretboard';

interface ChordSettings {
  capo: number;
  transpose: number;
  simplify: boolean;
  accidental: Accidental;
  audio: boolean;
}

const DEFAULT_CHORD_SETTINGS: ChordSettings = {
  capo: 0,
  transpose: 0,
  simplify: false,
  accidental: 'sharp',
  audio: true,
};

const SETTINGS_KEY = 'tab-viewer.chord-settings.v1';
const LAYOUT_KEY = 'tab-viewer.layout.v1';

function loadChordSettings(): ChordSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_CHORD_SETTINGS, ...JSON.parse(raw) };
  } catch { /* noop */ }
  return { ...DEFAULT_CHORD_SETTINGS };
}

function saveChordSettings(s: ChordSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

function loadLayoutPref(): LayoutMode | null {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (v === 'tab' || v === 'chords' || v === 'both') return v;
  } catch { /* noop */ }
  return null;
}

function saveLayoutPref(m: LayoutMode): void {
  try { localStorage.setItem(LAYOUT_KEY, m); } catch { /* noop */ }
}

interface FretboardSettings {
  rootClass: number;       // 0..11
  mode: KeyMode;           // major / minor (used for default-scale-for-key)
  scale: ScaleId;
  display: NoteDisplay;
  layers: { treble: boolean; mid: boolean; bass: boolean };
  showAllNotes: boolean;
  startFret: number;
  endFret: number;
  /** True iff the current settings should auto-update from the song's
   * detected key. False once the user has overridden the key picker. */
  autoFollowKey: boolean;
}

const DEFAULT_FRETBOARD: FretboardSettings = {
  rootClass: 0,
  mode: 'major',
  scale: 'major',
  display: 'doremi-fixed',
  layers: { treble: true, mid: true, bass: true },
  showAllNotes: false,
  startFret: 0,
  endFret: 15,
  autoFollowKey: true,
};

const FB_KEY = 'tab-viewer.fretboard.v1';

function loadFretboardSettings(): FretboardSettings {
  try {
    const raw = localStorage.getItem(FB_KEY);
    if (raw) return { ...DEFAULT_FRETBOARD, ...JSON.parse(raw) };
  } catch { /* noop */ }
  return { ...DEFAULT_FRETBOARD };
}

function saveFretboardSettings(s: FretboardSettings): void {
  try { localStorage.setItem(FB_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

interface PlayerState {
  artist: CatalogArtist;
  song: CatalogSong;
  chords: ChordsFile | null;
  chordsUrl: string | null;
  tabUrl: string | null;
  layout: LayoutMode;
  settings: ChordSettings;
  fretboard: FretboardSettings;
  /** Auto-detected key from chord progression, or null if unknown. */
  detectedKey: { rootClass: number; mode: KeyMode } | null;
  /** Auto-scroll state. */
  transport: {
    playing: boolean;
    /** Base scroll speed in px/sec at 1×. */
    basePxPerSec: number;
    /** Multiplier applied on top of base (e.g. 0.5, 1, 1.25, 2, 3). */
    speedMultiplier: number;
    rafId: number | null;
    lastTs: number | null;
    miniPlayerOpen: boolean;
  };
}

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const DEFAULT_BASE_PX_PER_SEC = 60;

const TRANSPORT_KEY = 'tab-viewer.transport.v2';

function loadTransportSettings(): { basePxPerSec: number; speedMultiplier: number } {
  try {
    const raw = localStorage.getItem(TRANSPORT_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return {
        basePxPerSec: typeof v?.basePxPerSec === 'number' ? v.basePxPerSec : DEFAULT_BASE_PX_PER_SEC,
        speedMultiplier: typeof v?.speedMultiplier === 'number' ? v.speedMultiplier : 1,
      };
    }
  } catch { /* ignore */ }
  return { basePxPerSec: DEFAULT_BASE_PX_PER_SEC, speedMultiplier: 1 };
}

function saveTransportSettings(basePxPerSec: number, speedMultiplier: number): void {
  try { localStorage.setItem(TRANSPORT_KEY, JSON.stringify({ basePxPerSec, speedMultiplier })); } catch { /* ignore */ }
}

export async function renderPlayer(
  view: HTMLElement,
  artistSlug: string,
  songSlug: string
): Promise<void> {
  if (activeApi) {
    activeApi.destroy();
    activeApi = null;
  }

  view.innerHTML = `<div class="loading">Loading…</div>`;
  const catalog = await loadCatalog();
  const artist = findArtist(catalog, artistSlug);
  const song = findSong(artist, songSlug);

  if (!artist || !song) {
    view.innerHTML = `
      <section class="page">
        <p class="error">Song not found.</p>
        <p><a href="#/">← Back to artists</a></p>
      </section>`;
    return;
  }

  // Resolve actual asset URLs (preferred new naming or legacy fallback).
  const [tabUrl, chordsUrl] = await Promise.all([
    song.hasTab
      ? resolveAssetUrl(preferredTabUrl(artist.slug, song.slug), legacyTabUrl(artist.slug, song.slug))
      : Promise.resolve(null),
    song.hasChords
      ? resolveAssetUrl(preferredChordsUrl(artist.slug, song.slug), legacyChordsUrl(artist.slug, song.slug))
      : Promise.resolve(null),
  ]);

  // Load chord data eagerly if available; alphaTab loads on demand.
  let chords: ChordsFile | null = null;
  if (chordsUrl) {
    try {
      const r = await fetch(chordsUrl, { cache: 'no-cache' });
      if (r.ok) chords = (await r.json()) as ChordsFile;
    } catch { /* noop */ }
  }

  const hasVideos = !!song.youtubeRefs && song.youtubeRefs.length > 0;

  const initialLayout: LayoutMode = (() => {
    const pref = loadLayoutPref();
    if (pref) {
      // Validate against actual availability.
      if (pref === 'tab' && !tabUrl) return chords ? 'chords' : (hasVideos ? 'videos' : 'both');
      if (pref === 'chords' && !chords) return tabUrl ? 'tab' : (hasVideos ? 'videos' : 'tab');
      if (pref === 'both' && (!tabUrl || !chords)) return tabUrl ? 'tab' : (chords ? 'chords' : (hasVideos ? 'videos' : 'tab'));
      if (pref === 'videos' && !hasVideos) return chords ? 'chords' : (tabUrl ? 'tab' : 'tab');
      return pref;
    }
    if (tabUrl && chords) return 'both';
    if (chords) return 'chords';
    if (tabUrl) return 'tab';
    if (hasVideos) return 'videos';
    return 'tab';
  })();

  const transportInit = loadTransportSettings();
  const fretboardInit = loadFretboardSettings();
  // Auto-detect the song's key from its chord progression, if any.
  const chordList = chords ? collectChordSymbols(chords) : [];
  const detected = chordList.length ? bestKey(chordList) : null;
  if (detected && fretboardInit.autoFollowKey) {
    fretboardInit.rootClass = detected.rootClass;
    fretboardInit.mode = detected.mode;
    fretboardInit.scale = defaultScaleForKey(detected);
  }

  const state: PlayerState = {
    artist,
    song,
    chords,
    chordsUrl,
    tabUrl,
    layout: initialLayout,
    settings: loadChordSettings(),
    fretboard: fretboardInit,
    detectedKey: detected ? { rootClass: detected.rootClass, mode: detected.mode } : null,
    transport: {
      playing: false,
      basePxPerSec: transportInit.basePxPerSec,
      speedMultiplier: transportInit.speedMultiplier,
      rafId: null,
      lastTs: null,
      miniPlayerOpen: false,
    },
  };

  renderShell(view, state);
  wireControls(view, state);
  wireFretboardPanel(view, state);
  applyLayout(view, state);
  refreshChords(view, state);
  if (tabUrl) mountTab(view, state);

  // Clean up any mini-player from a previous song page first.
  document.querySelector('#mini-player')?.remove();

  // Auto-open the mini player on song-page entry, unless the user explicitly
  // closed it earlier in this session.
  const hasContent = !!tabUrl || !!chords;
  if (hasContent && !userHasClosedMiniPlayer()) {
    const ytBtn = view.querySelector<HTMLButtonElement>('#tr-yt');
    if (ytBtn) {
      queueMicrotask(() => { void toggleMiniPlayer(view, state, ytBtn); });
    }
  }
}

function renderShell(view: HTMLElement, state: PlayerState): void {
  const { artist, song, chords, tabUrl } = state;
  const hasVideos = !!song.youtubeRefs && song.youtubeRefs.length > 0;
  const tabBtn = tabUrl
    ? `<button data-layout="tab"  class="${state.layout === 'tab' ? 'active' : ''}">TAB</button>` : '';
  const chBtn = chords
    ? `<button data-layout="chords" class="${state.layout === 'chords' ? 'active' : ''}">Chord</button>` : '';
  const bothBtn = (tabUrl && chords)
    ? `<button data-layout="both" class="${state.layout === 'both' ? 'active' : ''}">Both</button>` : '';
  const videosBtn = hasVideos
    ? `<button data-layout="videos" class="${state.layout === 'videos' ? 'active' : ''}">Videos</button>` : '';
  const scaleBtn = `<button data-layout="fretboard" class="${state.layout === 'fretboard' ? 'active' : ''}" title="指板スケール表示">Scale</button>`;

  const credit = song.originalArtist && song.originalArtist !== artist.name
    ? ` · 原曲: ${escapeHtml(song.originalArtist)}` : '';

  view.innerHTML = `
    <section class="page player-page">
      <nav class="breadcrumb">
        <a href="#/">Artists</a> /
        <a href="#/artist/${encodeURIComponent(artist.slug)}">${escapeHtml(artist.name)}</a> /
        <span>${escapeHtml(song.title)}</span>
      </nav>
      <header class="player-controls">
        <div class="player-meta">
          <h2>${escapeHtml(song.title)}</h2>
          <p class="muted">${escapeHtml(artist.name)}${song.trackCount ? ` · ${song.trackCount} tracks` : ''}${credit}</p>
        </div>
        <div class="layout-switch">${tabBtn}${chBtn}${bothBtn}${scaleBtn}${videosBtn}</div>
      </header>

      ${chords ? renderChordControlsBar(state) : ''}
      ${(tabUrl || chords) ? renderTransportBar(state) : ''}

      <div class="player-body" data-layout="${state.layout}">
        <div class="pane pane-tab" data-visible="${state.layout === 'tab' || state.layout === 'both'}">
          <div class="pane-header">TAB / 五線譜</div>
          <div class="pane-content">
            <div id="tab-status" class="player-status">${tabUrl ? 'Loading score…' : 'No tab data.'}</div>
            <div id="alphaTab" class="alphatab-host"></div>
          </div>
        </div>
        <div class="pane pane-chords" data-visible="${state.layout === 'chords' || state.layout === 'both'}">
          <div class="pane-header">コード / 歌詞</div>
          <div class="pane-content">
            <div id="chord-diagrams" class="chord-diagrams" role="toolbar" aria-label="使用コード一覧"></div>
            <div id="chord-body" class="chord-host">
              ${chords ? '' : '<div class="error">No chord data.</div>'}
            </div>
            <div id="chord-popover" class="chord-popover" hidden></div>
          </div>
        </div>
        <div class="pane pane-videos" data-visible="${state.layout === 'videos'}">
          <div class="pane-header">YouTube 参考演奏 / TAB</div>
          <div class="pane-content">
            <div id="videos-host" class="videos-host">${renderVideos(song.youtubeRefs ?? [])}</div>
          </div>
        </div>
        <div class="pane pane-fretboard" data-visible="${state.layout === 'fretboard'}">
          <div class="pane-header">SCALE / 指板</div>
          <div class="pane-content">
            ${renderFretboardPanel(state)}
          </div>
        </div>
      </div>
    </section>
  `;
}

/* =============== Fretboard panel (Scale layout) =============== */

function collectChordSymbols(chords: ChordsFile): string[] {
  const out: string[] = [];
  for (const line of chords.lines) {
    for (const seg of line.segments) {
      if (seg.chord) out.push(seg.chord);
    }
  }
  return out;
}

const SCALE_OPTIONS: ScaleId[] = [
  'major', 'natural_minor', 'harmonic_minor', 'melodic_minor',
  'pentatonic_major', 'pentatonic_minor', 'blues',
  'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
];

const DISPLAY_OPTIONS: { id: NoteDisplay; label: string }[] = [
  { id: 'doremi-fixed',   label: 'ドレミ (固定ド)' },
  { id: 'doremi-movable', label: 'ドレミ (移動ド)' },
  { id: 'name-sharp',     label: 'ノート名 (♯)' },
  { id: 'name-flat',      label: 'ノート名 (♭)' },
  { id: 'degree',         label: '度数' },
  { id: 'interval',       label: 'インターバル' },
];

function renderFretboardPanel(state: PlayerState): string {
  const fb = state.fretboard;
  const detectedLabel = state.detectedKey
    ? keyLabel({ ...state.detectedKey, score: 0 })
    : '— (コード情報なし)';
  const rootName = SHARP_NAMES[fb.rootClass];

  const rootOptions = SHARP_NAMES.map((n, i) => `<option value="${i}" ${i === fb.rootClass ? 'selected' : ''}>${n}${FLAT_NAMES[i] !== n ? ` / ${FLAT_NAMES[i]}` : ''}</option>`).join('');
  const scaleOptions = SCALE_OPTIONS.map((s) => `<option value="${s}" ${s === fb.scale ? 'selected' : ''}>${SCALE_LABELS_JA[s]}</option>`).join('');
  const dispOptions = DISPLAY_OPTIONS.map((d) => `<option value="${d.id}" ${d.id === fb.display ? 'selected' : ''}>${d.label}</option>`).join('');

  return `
    <div class="fb-panel flex flex-col grow min-h-0">
      <div class="fb-controls flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-soft)]">
        <div class="fb-key-info flex items-center gap-2 text-[13px]">
          <span class="text-[var(--color-fg-soft)]">推定キー:</span>
          <span class="font-bold text-[var(--color-accent)]">${escapeHtml(detectedLabel)}</span>
          ${state.detectedKey ? `<button id="fb-use-detected" type="button" class="text-[11.5px] px-2 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors">推定値を反映</button>` : ''}
        </div>
        <label class="fb-ctl flex items-center gap-1.5 text-[13px]">
          <span class="text-[var(--color-fg-soft)]">ルート</span>
          <select id="fb-root" class="px-2 py-1 rounded border border-[var(--color-border)] bg-transparent text-[13px]">${rootOptions}</select>
        </label>
        <label class="fb-ctl flex items-center gap-1.5 text-[13px]">
          <span class="text-[var(--color-fg-soft)]">スケール</span>
          <select id="fb-scale" class="px-2 py-1 rounded border border-[var(--color-border)] bg-transparent text-[13px]">${scaleOptions}</select>
        </label>
        <label class="fb-ctl flex items-center gap-1.5 text-[13px]">
          <span class="text-[var(--color-fg-soft)]">表記</span>
          <select id="fb-display" class="px-2 py-1 rounded border border-[var(--color-border)] bg-transparent text-[13px]">${dispOptions}</select>
        </label>
        <div class="fb-layers flex items-center gap-1.5 text-[13px]">
          <span class="text-[var(--color-fg-soft)]">レイヤー</span>
          <button data-layer="treble" type="button" class="fb-layer-btn px-2.5 py-1 rounded text-[12px] border ${fb.layers.treble ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white font-semibold' : 'border-[var(--color-border)] text-[var(--color-fg-soft)]'}">Treble (1-2)</button>
          <button data-layer="mid"    type="button" class="fb-layer-btn px-2.5 py-1 rounded text-[12px] border ${fb.layers.mid ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white font-semibold' : 'border-[var(--color-border)] text-[var(--color-fg-soft)]'}">Mid (3-4)</button>
          <button data-layer="bass"   type="button" class="fb-layer-btn px-2.5 py-1 rounded text-[12px] border ${fb.layers.bass ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white font-semibold' : 'border-[var(--color-border)] text-[var(--color-fg-soft)]'}">Bass (5-6)</button>
        </div>
        <label class="fb-ctl flex items-center gap-1.5 text-[13px] cursor-pointer">
          <input id="fb-all" type="checkbox" ${fb.showAllNotes ? 'checked' : ''}/>
          <span class="text-[var(--color-fg-soft)]">スケール外も表示</span>
        </label>
        <div class="ml-auto text-[12px] text-[var(--color-fg-muted)]">
          ${escapeHtml(rootName)} ${escapeHtml(SCALE_LABELS_JA[fb.scale])} · ${fb.endFret - fb.startFret + 1}フレット
        </div>
      </div>

      <div class="fb-legend flex items-center gap-4 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[11.5px] text-[var(--color-fg-soft)]">
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-full" style="background:rgba(244,63,94,0.95)"></span>ルート</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-full" style="background:rgba(168,85,247,0.88)"></span>3度</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-full" style="background:rgba(34,197,94,0.88)"></span>5度</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-full" style="background:rgba(74,142,255,0.88)"></span>その他スケール内</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-full" style="background:rgba(120,120,135,0.55)"></span>スケール外</span>
      </div>

      <div id="fb-host" class="fb-host grow min-h-0 overflow-auto bg-[var(--color-surface)] p-4"
        style="--fb-bg: var(--color-surface-muted);">
        ${renderFretboard({
          startFret: fb.startFret, endFret: fb.endFret,
          rootClass: fb.rootClass, scale: fb.scale, display: fb.display,
          layers: fb.layers, showAllNotes: fb.showAllNotes,
        })}
      </div>
    </div>
  `;
}

function refreshFretboard(view: HTMLElement, state: PlayerState): void {
  const host = view.querySelector<HTMLElement>('#fb-host');
  if (!host) return;
  host.innerHTML = renderFretboard({
    startFret: state.fretboard.startFret,
    endFret: state.fretboard.endFret,
    rootClass: state.fretboard.rootClass,
    scale: state.fretboard.scale,
    display: state.fretboard.display,
    layers: state.fretboard.layers,
    showAllNotes: state.fretboard.showAllNotes,
  });
}

function wireFretboardPanel(view: HTMLElement, state: PlayerState): void {
  const root = view.querySelector<HTMLSelectElement>('#fb-root');
  const scale = view.querySelector<HTMLSelectElement>('#fb-scale');
  const display = view.querySelector<HTMLSelectElement>('#fb-display');
  const all = view.querySelector<HTMLInputElement>('#fb-all');
  const useDetected = view.querySelector<HTMLButtonElement>('#fb-use-detected');

  root?.addEventListener('change', () => {
    state.fretboard.rootClass = parseInt(root.value, 10);
    state.fretboard.autoFollowKey = false;
    saveFretboardSettings(state.fretboard);
    refreshFretboard(view, state);
  });
  scale?.addEventListener('change', () => {
    state.fretboard.scale = scale.value as ScaleId;
    state.fretboard.autoFollowKey = false;
    saveFretboardSettings(state.fretboard);
    refreshFretboard(view, state);
  });
  display?.addEventListener('change', () => {
    state.fretboard.display = display.value as NoteDisplay;
    saveFretboardSettings(state.fretboard);
    refreshFretboard(view, state);
  });
  all?.addEventListener('change', () => {
    state.fretboard.showAllNotes = all.checked;
    saveFretboardSettings(state.fretboard);
    refreshFretboard(view, state);
  });
  useDetected?.addEventListener('click', () => {
    if (!state.detectedKey) return;
    state.fretboard.rootClass = state.detectedKey.rootClass;
    state.fretboard.mode = state.detectedKey.mode;
    state.fretboard.scale = state.detectedKey.mode === 'major' ? 'major' : 'natural_minor';
    state.fretboard.autoFollowKey = true;
    saveFretboardSettings(state.fretboard);
    if (root) root.value = String(state.fretboard.rootClass);
    if (scale) scale.value = state.fretboard.scale;
    refreshFretboard(view, state);
  });
  view.querySelectorAll<HTMLButtonElement>('.fb-layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.layer as LayerKey;
      state.fretboard.layers[key] = !state.fretboard.layers[key];
      saveFretboardSettings(state.fretboard);
      // Toggle button visual
      const on = state.fretboard.layers[key];
      btn.className = `fb-layer-btn px-2.5 py-1 rounded text-[12px] border ${on
        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white font-semibold'
        : 'border-[var(--color-border)] text-[var(--color-fg-soft)]'}`;
      refreshFretboard(view, state);
    });
  });
}

function renderTransportBar(state: PlayerState): string {
  const cur = state.transport.speedMultiplier;
  const presets = SPEED_PRESETS
    .map((m) => `<button type="button" class="tr-preset${m === cur ? ' active' : ''}" data-mul="${m}">${m === Math.floor(m) ? m : m.toFixed(2)}×</button>`)
    .join('');
  return `
    <div class="transport" role="toolbar" aria-label="自動スクロール">
      <button id="tr-play" type="button" class="tr-btn tr-play" aria-label="再生 / 停止">▶</button>
      <div class="tr-speeds">
        <span class="tr-label">速度</span>
        <div class="tr-presets">${presets}</div>
        <span id="tr-speed-val" class="tr-speed-val">${effectiveLabel(state)}</span>
      </div>
      <button id="tr-base-down" type="button" class="tr-btn tr-aux" title="基準速度を下げる (現在 ${state.transport.basePxPerSec} px/s @1×)">−</button>
      <button id="tr-base-up"   type="button" class="tr-btn tr-aux" title="基準速度を上げる (現在 ${state.transport.basePxPerSec} px/s @1×)">+</button>
      <button id="tr-rewind" type="button" class="tr-btn" title="先頭へ">⏮</button>
      <button id="tr-yt" type="button" class="tr-btn" title="動画ミニプレイヤー (この曲の YouTube 参照を開く)">🎬</button>
    </div>
  `;
}

function effectiveLabel(state: PlayerState): string {
  const eff = Math.round(state.transport.basePxPerSec * state.transport.speedMultiplier);
  const m = state.transport.speedMultiplier;
  return `${m === Math.floor(m) ? m : m.toFixed(2)}× · ${eff} px/s`;
}

function renderVideos(refs: { videoId: string; title: string; channel: string; duration?: string; embedUrl: string; url: string }[]): string {
  if (!refs.length) return '<div class="error">No videos.</div>';
  return refs.map((r) => `
    <div class="video-card">
      <div class="video-frame">
        <iframe loading="lazy" src="${escapeHtml(r.embedUrl)}"
          title="${escapeHtml(r.title)}"
          frameborder="0"
          allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen></iframe>
      </div>
      <div class="video-meta">
        <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="video-title">${escapeHtml(r.title)}</a>
        <div class="video-sub">${escapeHtml(r.channel)}${r.duration ? ` · ${escapeHtml(r.duration)}` : ''}</div>
      </div>
    </div>
  `).join('');
}

function renderChordControlsBar(state: PlayerState): string {
  const { capo, transpose, simplify, accidental } = state.settings;
  return `
    <div class="chord-controls" role="region" aria-label="Chord controls">
      <label class="cc-group">
        <span>Capo</span>
        <select id="cc-capo">
          ${Array.from({ length: 13 }, (_, i) => `<option value="${i}" ${i === capo ? 'selected' : ''}>${i === 0 ? '0 (なし)' : i + 'F'}</option>`).join('')}
        </select>
      </label>
      <div class="cc-group">
        <span>Transpose</span>
        <button id="cc-tr-down" type="button" aria-label="-1 semitone">−</button>
        <span id="cc-tr-val" class="cc-val">${transpose >= 0 ? '+' : ''}${transpose}</span>
        <button id="cc-tr-up"   type="button" aria-label="+1 semitone">＋</button>
        <button id="cc-tr-reset" type="button" class="link" title="Reset transpose">reset</button>
      </div>
      <label class="cc-group">
        <span>表記</span>
        <select id="cc-acc">
          <option value="sharp" ${accidental === 'sharp' ? 'selected' : ''}>♯</option>
          <option value="flat"  ${accidental === 'flat'  ? 'selected' : ''}>♭</option>
        </select>
      </label>
      <label class="cc-group cc-toggle">
        <input id="cc-simplify" type="checkbox" ${simplify ? 'checked' : ''}/>
        <span>初心者モード (簡易コード)</span>
      </label>
      <label class="cc-group cc-toggle">
        <input id="cc-audio" type="checkbox" ${state.settings.audio ? 'checked' : ''}/>
        <span>🔈 クリックで音を鳴らす</span>
      </label>
      <button id="cc-diagrams-toggle" type="button" class="cc-aux">指板図を隠す</button>
    </div>
  `;
}

function wireControls(view: HTMLElement, state: PlayerState): void {
  view.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.layout as LayoutMode;
      state.layout = next;
      saveLayoutPref(next);
      view.querySelectorAll<HTMLButtonElement>('.layout-switch [data-layout]').forEach((b) => {
        b.classList.toggle('active', b.dataset.layout === next);
      });
      applyLayout(view, state);
      // alphaTab needs a layout nudge if the pane just became visible.
      if (activeApi && (next === 'tab' || next === 'both')) {
        queueMicrotask(() => activeApi?.render());
      }
    });
  });

  const capoSel = view.querySelector<HTMLSelectElement>('#cc-capo');
  capoSel?.addEventListener('change', () => {
    state.settings.capo = parseInt(capoSel.value, 10) || 0;
    saveChordSettings(state.settings);
    refreshChords(view, state);
  });

  const updateTranspose = (delta: number) => {
    state.settings.transpose = Math.max(-11, Math.min(11, state.settings.transpose + delta));
    const val = view.querySelector<HTMLSpanElement>('#cc-tr-val');
    if (val) val.textContent = `${state.settings.transpose >= 0 ? '+' : ''}${state.settings.transpose}`;
    saveChordSettings(state.settings);
    refreshChords(view, state);
  };
  view.querySelector('#cc-tr-down')?.addEventListener('click', () => updateTranspose(-1));
  view.querySelector('#cc-tr-up')?.addEventListener('click', () => updateTranspose(+1));
  view.querySelector('#cc-tr-reset')?.addEventListener('click', () => {
    state.settings.transpose = 0;
    const val = view.querySelector<HTMLSpanElement>('#cc-tr-val');
    if (val) val.textContent = '+0';
    saveChordSettings(state.settings);
    refreshChords(view, state);
  });

  const accSel = view.querySelector<HTMLSelectElement>('#cc-acc');
  accSel?.addEventListener('change', () => {
    state.settings.accidental = (accSel.value as Accidental) || 'sharp';
    saveChordSettings(state.settings);
    refreshChords(view, state);
  });

  const simpToggle = view.querySelector<HTMLInputElement>('#cc-simplify');
  simpToggle?.addEventListener('change', () => {
    state.settings.simplify = simpToggle.checked;
    saveChordSettings(state.settings);
    refreshChords(view, state);
  });

  const audioToggle = view.querySelector<HTMLInputElement>('#cc-audio');
  audioToggle?.addEventListener('change', () => {
    state.settings.audio = audioToggle.checked;
    setAudioEnabled(state.settings.audio);
    saveChordSettings(state.settings);
  });

  const diagToggle = view.querySelector<HTMLButtonElement>('#cc-diagrams-toggle');
  diagToggle?.addEventListener('click', () => {
    const el = view.querySelector<HTMLElement>('#chord-diagrams');
    if (!el) return;
    const hidden = el.classList.toggle('hidden');
    diagToggle.textContent = hidden ? '指板図を表示' : '指板図を隠す';
  });

  wireTransport(view, state);
  wireChordPopover(view, state);
}

/* ============================== Transport ============================== */

function wireTransport(view: HTMLElement, state: PlayerState): void {
  const playBtn = view.querySelector<HTMLButtonElement>('#tr-play');
  const speedVal = view.querySelector<HTMLSpanElement>('#tr-speed-val');
  const rewindBtn = view.querySelector<HTMLButtonElement>('#tr-rewind');
  const ytBtn = view.querySelector<HTMLButtonElement>('#tr-yt');
  const baseDown = view.querySelector<HTMLButtonElement>('#tr-base-down');
  const baseUp = view.querySelector<HTMLButtonElement>('#tr-base-up');

  const refreshSpeedDisplay = () => {
    if (speedVal) speedVal.textContent = effectiveLabel(state);
    view.querySelectorAll<HTMLButtonElement>('.tr-preset').forEach((b) => {
      const m = Number(b.dataset.mul);
      b.classList.toggle('active', Math.abs(m - state.transport.speedMultiplier) < 1e-6);
    });
  };

  view.querySelectorAll<HTMLButtonElement>('.tr-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = Number(btn.dataset.mul);
      if (!Number.isFinite(m)) return;
      state.transport.speedMultiplier = m;
      saveTransportSettings(state.transport.basePxPerSec, state.transport.speedMultiplier);
      refreshSpeedDisplay();
    });
  });

  baseDown?.addEventListener('click', () => {
    state.transport.basePxPerSec = Math.max(10, state.transport.basePxPerSec - 10);
    saveTransportSettings(state.transport.basePxPerSec, state.transport.speedMultiplier);
    refreshSpeedDisplay();
  });
  baseUp?.addEventListener('click', () => {
    state.transport.basePxPerSec = Math.min(300, state.transport.basePxPerSec + 10);
    saveTransportSettings(state.transport.basePxPerSec, state.transport.speedMultiplier);
    refreshSpeedDisplay();
  });

  playBtn?.addEventListener('click', () => toggleAutoScroll(view, state, playBtn));
  rewindBtn?.addEventListener('click', () => {
    const body = view.querySelector<HTMLElement>('#chord-body');
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
  });
  ytBtn?.addEventListener('click', () => toggleMiniPlayer(view, state, ytBtn));

  // Spacebar = play/pause when chord pane is focused.
  view.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
      const btn = view.querySelector<HTMLButtonElement>('#tr-play');
      if (btn) { ev.preventDefault(); toggleAutoScroll(view, state, btn); }
    }
  });
}

function collectScrollTargets(view: HTMLElement, state: PlayerState): HTMLElement[] {
  const targets: HTMLElement[] = [];
  // Chord body: scroll if chord pane is visible (chords/both layouts).
  if (state.layout === 'chords' || state.layout === 'both') {
    const body = view.querySelector<HTMLElement>('#chord-body');
    if (body && state.chords) targets.push(body);
  }
  // alphaTab host: scroll if tab pane is visible (tab/both layouts).
  if (state.layout === 'tab' || state.layout === 'both') {
    const tab = view.querySelector<HTMLElement>('#alphaTab');
    if (tab && state.tabUrl) targets.push(tab);
  }
  return targets;
}

function toggleAutoScroll(view: HTMLElement, state: PlayerState, playBtn: HTMLButtonElement): void {
  const targets = collectScrollTargets(view, state);
  if (!targets.length) return;
  if (state.transport.playing) {
    if (state.transport.rafId !== null) cancelAnimationFrame(state.transport.rafId);
    state.transport.rafId = null;
    state.transport.lastTs = null;
    state.transport.playing = false;
    playBtn.textContent = '▶';
    playBtn.classList.remove('playing');
    return;
  }
  state.transport.playing = true;
  state.transport.lastTs = null;
  playBtn.textContent = '⏸';
  playBtn.classList.add('playing');
  const tick = (ts: number) => {
    if (!state.transport.playing) return;
    if (state.transport.lastTs === null) state.transport.lastTs = ts;
    const dt = (ts - state.transport.lastTs) / 1000;
    state.transport.lastTs = ts;
    const effective = state.transport.basePxPerSec * state.transport.speedMultiplier;
    let allReachedEnd = true;
    for (const el of targets) {
      el.scrollTop += effective * dt;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) allReachedEnd = false;
    }
    if (allReachedEnd) {
      state.transport.playing = false;
      state.transport.rafId = null;
      playBtn.textContent = '▶';
      playBtn.classList.remove('playing');
      return;
    }
    state.transport.rafId = requestAnimationFrame(tick);
  };
  state.transport.rafId = requestAnimationFrame(tick);
}

const MINI_CLOSED_KEY = 'tab-viewer.mini-closed.v1';
function userHasClosedMiniPlayer(): boolean {
  try { return sessionStorage.getItem(MINI_CLOSED_KEY) === '1'; } catch { return false; }
}
function markMiniClosed(closed: boolean): void {
  try {
    if (closed) sessionStorage.setItem(MINI_CLOSED_KEY, '1');
    else sessionStorage.removeItem(MINI_CLOSED_KEY);
  } catch { /* ignore */ }
}

async function ensureRefs(state: PlayerState): Promise<RankedRef[]> {
  let refs: RankedRef[] = ((state.song.youtubeRefs as RankedRef[] | undefined) ?? []).slice();
  if (!refs.length) {
    const query = `${state.artist.name} ${state.song.title} TAB ソロギター`;
    refs = await searchYouTubeAdHoc(query);
    (state.song as any).youtubeRefs = refs;
  }
  return refs;
}

async function toggleMiniPlayer(view: HTMLElement, state: PlayerState, ytBtn: HTMLButtonElement): Promise<void> {
  const existing = document.querySelector<HTMLElement>('#mini-player');
  if (existing) {
    existing.remove();
    ytBtn.classList.remove('active');
    state.transport.miniPlayerOpen = false;
    markMiniClosed(true);
    return;
  }
  markMiniClosed(false);
  ytBtn.classList.add('loading');
  ytBtn.disabled = true;
  let refs: RankedRef[] = [];
  try {
    refs = await ensureRefs(state);
  } catch (err) {
    console.error('[yt-search]', err);
    ytBtn.title = `YouTube 検索失敗: ${(err as Error).message}`;
    return;
  } finally {
    ytBtn.classList.remove('loading');
    ytBtn.disabled = false;
  }
  if (!refs.length) {
    ytBtn.title = 'YouTube に該当の参考動画が見つかりませんでした';
    return;
  }
  openMiniPlayerWindow(view, state, refs, ytBtn);
}

function openMiniPlayerWindow(
  _view: HTMLElement,
  state: PlayerState,
  refs: RankedRef[],
  ytBtn: HTMLButtonElement
): void {
  let currentIdx = 0;
  const wrap = document.createElement('div');
  wrap.id = 'mini-player';
  wrap.className = 'mini-player';

  const updateFrame = () => {
    const r = refs[currentIdx];
    const titleEl = wrap.querySelector<HTMLElement>('.mini-player-title');
    const frame = wrap.querySelector<HTMLIFrameElement>('iframe');
    const counter = wrap.querySelector<HTMLElement>('.mini-player-counter');
    if (titleEl) {
      titleEl.title = r.title;
      titleEl.textContent = r.title;
    }
    if (frame) frame.src = `${r.embedUrl}?enablejsapi=1&autoplay=1`;
    if (counter) counter.textContent = `${currentIdx + 1} / ${refs.length}`;
  };

  wrap.innerHTML = `
    <div class="mini-player-head">
      <span class="mini-player-title" title="${escapeHtml(refs[0].title)}">${escapeHtml(refs[0].title)}</span>
      <button type="button" class="mini-player-close" aria-label="閉じる">✕</button>
    </div>
    <div class="mini-player-frame">
      <iframe
        src="${escapeHtml(refs[0].embedUrl)}?enablejsapi=1"
        frameborder="0"
        allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
    </div>
    <div class="mini-player-foot">
      <button type="button" class="mini-player-nav mini-prev" aria-label="前">◀</button>
      <span class="mini-player-counter">1 / ${refs.length}</span>
      <button type="button" class="mini-player-nav mini-next" aria-label="次">▶</button>
      <button type="button" class="mini-player-more mini-list" title="他の参考動画を一覧から選ぶ">≡ 一覧</button>
      <button type="button" class="mini-player-more" id="mini-research" title="検索を再実行">↻ 再検索</button>
    </div>
  `;
  document.body.appendChild(wrap);
  ytBtn.classList.add('active');
  state.transport.miniPlayerOpen = true;

  wrap.querySelector('.mini-player-close')?.addEventListener('click', () => {
    wrap.remove();
    ytBtn.classList.remove('active');
    state.transport.miniPlayerOpen = false;
    markMiniClosed(true);
  });
  wrap.querySelector('.mini-prev')?.addEventListener('click', () => {
    currentIdx = (currentIdx - 1 + refs.length) % refs.length;
    updateFrame();
  });
  wrap.querySelector('.mini-next')?.addEventListener('click', () => {
    currentIdx = (currentIdx + 1) % refs.length;
    updateFrame();
  });
  wrap.querySelector('.mini-list')?.addEventListener('click', () => {
    const initialQuery = `${state.artist.name} ${state.song.title} TAB ソロギター`;
    openSearchOverlay({
      refs,
      currentIdx,
      initialQuery,
      onPick: (newIdx) => { currentIdx = newIdx; updateFrame(); },
      onResults: (newRefs) => { refs.splice(0, refs.length, ...newRefs); currentIdx = 0; updateFrame(); },
    });
  });
  wrap.querySelector('#mini-research')?.addEventListener('click', async () => {
    const btn = wrap.querySelector<HTMLButtonElement>('#mini-research');
    if (btn) { btn.disabled = true; btn.textContent = '↻ 検索中…'; }
    try {
      const query = `${state.artist.name} ${state.song.title} TAB ソロギター`;
      const newRefs = await searchYouTubeAdHoc(query, { force: true });
      if (newRefs.length) {
        refs.splice(0, refs.length, ...newRefs);
        currentIdx = 0;
        updateFrame();
      }
    } catch (err) {
      console.error('[yt-search]', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '↻ 再検索'; }
    }
  });

  makeDraggable(wrap, wrap.querySelector('.mini-player-head') as HTMLElement);
}

/**
 * Modern card design (YouTube grid + Linear/Vercel polish):
 *  - No card chrome/border — content-first; the thumbnail does the work
 *  - 16:9 thumb with rounded-xl corners; ▶ play icon overlay on hover
 *  - 2-line clamped title (15px / 600), then channel + meta row
 *  - "Now playing" pill with pulse ring; subtle glow on the active card
 */
function renderResultCard(r: RankedRef, idx: number, isCurrent: boolean): string {
  const thumb = `https://img.youtube.com/vi/${escapeHtml(r.videoId)}/mqdefault.jpg`;
  const fallback = `https://img.youtube.com/vi/${escapeHtml(r.videoId)}/hqdefault.jpg`;
  return `
    <div role="button" tabindex="0"
      data-idx="${idx}"
      class="yt-result-card group flex flex-col w-[320px] cursor-pointer outline-none rounded-xl transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 ${isCurrent ? 'is-current' : ''}">
      <div class="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 ring-1 ring-black/5 shadow-sm group-hover:shadow-lg group-hover:ring-[var(--color-accent)] transition-all duration-150">
        <img loading="lazy" decoding="async"
          src="${thumb}"
          data-fallback="${fallback}"
          alt=""
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]">
        ${r.duration ? `<span class="absolute right-2 bottom-2 px-1.5 py-0.5 rounded text-white text-[11px] font-semibold tabular-nums bg-black/85 backdrop-blur-sm">${escapeHtml(r.duration)}</span>` : ''}
        ${isCurrent ? `
          <span class="absolute left-2 top-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold tracking-wide bg-[var(--color-accent)] shadow-lg shadow-blue-500/30">
            <span class="relative flex h-1.5 w-1.5">
              <span class="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping"></span>
              <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
            </span>
            再生中
          </span>` : ''}
        <span class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors duration-150 pointer-events-none">
          <span class="grid place-items-center w-12 h-12 rounded-full bg-white/95 text-slate-900 shadow-lg opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-90 transition-all duration-150">
            <svg width="18" height="18" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9-5.5z"/></svg>
          </span>
        </span>
      </div>
      <div class="flex gap-2.5 pt-3 pb-1 min-w-0">
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <div title="${escapeHtml(r.title)}"
            class="text-[15px] font-semibold leading-snug text-[var(--color-fg)] line-clamp-2 break-words">${escapeHtml(r.title)}</div>
          <div class="text-[13px] text-[var(--color-fg-soft)] truncate" title="${escapeHtml(r.channel)}">${escapeHtml(r.channel)}</div>
          ${r.views ? `<div class="text-[12.5px] text-[var(--color-fg-muted)] tabular-nums">${escapeHtml(r.views)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

interface SearchOverlayOptions {
  refs: RankedRef[];
  currentIdx: number;
  initialQuery: string;
  onPick: (idx: number) => void;
  /** Called when re-search yields new results, so the caller can refresh
   * the mini-player's playlist. */
  onResults?: (newRefs: RankedRef[]) => void;
}

/**
 * Modal overlay with editable search input + grid of result tiles. Clicking
 * a tile picks it and closes the overlay; submitting the search input
 * re-queries YouTube and re-renders the grid in place.
 */
function openSearchOverlay(opts: SearchOverlayOptions): void {
  const existing = document.querySelector<HTMLElement>('#yt-overlay');
  if (existing) existing.remove();

  let refs = opts.refs.slice();
  let currentIdx = opts.currentIdx;

  const overlay = document.createElement('div');
  overlay.id = 'yt-overlay';
  overlay.className = 'yt-overlay fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/65 backdrop-blur-md';
  overlay.innerHTML = `
    <div class="bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-border)] rounded-2xl w-[min(1400px,100%)] max-h-[92vh] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
      <header class="flex flex-col gap-3 px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] shrink-0">
        <div class="flex items-baseline gap-3">
          <h3 class="m-0 text-base font-bold tracking-tight">参考演奏 / TAB 動画</h3>
          <span id="yt-count" class="px-2.5 py-0.5 rounded-full text-[11.5px] font-medium tabular-nums bg-[var(--color-surface-muted)] text-[var(--color-fg-soft)]">${refs.length} 件</span>
          <span id="yt-loading" class="hidden items-center gap-1.5 text-[12px] text-[var(--color-fg-soft)]">
            <span class="inline-block w-3 h-3 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin"></span>
            検索中…
          </span>
          <button type="button" aria-label="閉じる" title="閉じる (ESC)"
            class="yt-close ml-auto grid place-items-center w-8 h-8 rounded-full border border-[var(--color-border)] text-[var(--color-fg-soft)] cursor-pointer transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
          </button>
        </div>
        <form id="yt-search-form" class="flex items-stretch gap-2 w-full">
          <div class="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/25 transition-colors">
            <svg class="shrink-0 text-[var(--color-fg-muted)]" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>
            <input
              id="yt-search-input"
              type="search"
              class="grow min-w-0 bg-transparent border-none outline-none text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)]"
              placeholder="検索キーワード"
              value="${escapeHtml(opts.initialQuery)}"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="button" id="yt-search-clear" aria-label="クリア"
              class="hidden shrink-0 grid place-items-center w-5 h-5 rounded-full text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-muted)] transition-colors">
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
            </button>
          </div>
          <button type="submit"
            class="px-4 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)] text-white text-[13.5px] font-semibold cursor-pointer transition-colors">
            検索
          </button>
          <button type="button" id="yt-search-reset" title="元の検索に戻す"
            class="px-3 rounded-lg border border-[var(--color-border)] text-[13px] text-[var(--color-fg-soft)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer transition-colors">
            ↻
          </button>
        </form>
      </header>

      <div id="yt-grid" class="grid grid-cols-[repeat(auto-fill,320px)] justify-center gap-x-5 gap-y-7 px-6 py-7 overflow-y-auto overflow-x-hidden content-start grow min-h-0">
        ${refs.map((r, i) => renderResultCard(r, i, i === currentIdx)).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const grid = overlay.querySelector<HTMLElement>('#yt-grid')!;
  const count = overlay.querySelector<HTMLElement>('#yt-count')!;
  const loading = overlay.querySelector<HTMLElement>('#yt-loading')!;
  const input = overlay.querySelector<HTMLInputElement>('#yt-search-input')!;
  const clearBtn = overlay.querySelector<HTMLButtonElement>('#yt-search-clear')!;
  const form = overlay.querySelector<HTMLFormElement>('#yt-search-form')!;
  const resetBtn = overlay.querySelector<HTMLButtonElement>('#yt-search-reset')!;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close(); // backdrop click
  });
  overlay.querySelector('.yt-close')?.addEventListener('click', close);

  const renderGrid = () => {
    if (refs.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full grid place-items-center py-20 text-center text-[var(--color-fg-muted)]">
          <div>
            <div class="text-3xl mb-3">🔎</div>
            <div class="text-[14px]">検索結果がありませんでした</div>
            <div class="text-[12px] mt-1">キーワードを変えて再検索してみてください</div>
          </div>
        </div>
      `;
      return;
    }
    grid.innerHTML = refs.map((r, i) => renderResultCard(r, i, i === currentIdx)).join('');
    wireCards();
  };

  const wireCards = () => {
    grid.querySelectorAll<HTMLDivElement>('.yt-result-card').forEach((card) => {
      const pick = () => {
        const idx = Number(card.dataset.idx);
        if (Number.isFinite(idx)) opts.onPick(idx);
        close();
      };
      card.addEventListener('click', pick);
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          pick();
        }
      });
    });
    grid.querySelectorAll<HTMLImageElement>('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        const fallback = img.dataset.fallback;
        if (fallback && img.src !== fallback) img.src = fallback;
      });
    });
  };

  const runSearch = async (query: string) => {
    if (!query.trim()) return;
    loading.classList.remove('hidden');
    loading.classList.add('inline-flex');
    count.classList.add('opacity-50');
    try {
      const newRefs = await searchYouTubeAdHoc(query, { force: true });
      refs = newRefs;
      currentIdx = 0;
      count.textContent = `${refs.length} 件`;
      grid.scrollTop = 0;
      renderGrid();
      opts.onResults?.(newRefs);
    } catch (err) {
      console.error('[yt-search]', err);
      grid.innerHTML = `
        <div class="col-span-full grid place-items-center py-20 text-center text-[var(--color-fg-muted)]">
          <div>
            <div class="text-3xl mb-3">⚠️</div>
            <div class="text-[14px] text-red-500">検索に失敗しました</div>
            <div class="text-[12px] mt-1">${escapeHtml((err as Error).message)}</div>
          </div>
        </div>
      `;
    } finally {
      loading.classList.add('hidden');
      loading.classList.remove('inline-flex');
      count.classList.remove('opacity-50');
    }
  };

  // Submit the form (Enter or click 検索)
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void runSearch(input.value);
  });

  // Clear button visibility + clear behavior
  const updateClearVisibility = () => {
    if (input.value.length > 0) {
      clearBtn.classList.remove('hidden');
      clearBtn.classList.add('grid');
    } else {
      clearBtn.classList.add('hidden');
      clearBtn.classList.remove('grid');
    }
  };
  updateClearVisibility();
  input.addEventListener('input', updateClearVisibility);
  clearBtn.addEventListener('click', () => {
    input.value = '';
    updateClearVisibility();
    input.focus();
  });
  resetBtn.addEventListener('click', () => {
    input.value = opts.initialQuery;
    updateClearVisibility();
    void runSearch(opts.initialQuery);
  });

  // ESC to close (only when input not focused; otherwise clear input first)
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      if (document.activeElement === input && input.value !== '') {
        ev.preventDefault();
        input.value = '';
        updateClearVisibility();
      } else {
        close();
        document.removeEventListener('keydown', onKey);
      }
    }
  };
  document.addEventListener('keydown', onKey);

  wireCards();
}

function makeDraggable(el: HTMLElement, handle: HTMLElement): void {
  let startX = 0, startY = 0, origLeft = 0, origTop = 0, dragging = false;
  handle.style.cursor = 'move';
  handle.addEventListener('pointerdown', (ev) => {
    dragging = true;
    handle.setPointerCapture(ev.pointerId);
    const rect = el.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    startX = ev.clientX; startY = ev.clientY;
    origLeft = rect.left; origTop = rect.top;
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    el.style.left = Math.max(0, origLeft + (ev.clientX - startX)) + 'px';
    el.style.top = Math.max(0, origTop + (ev.clientY - startY)) + 'px';
  });
  handle.addEventListener('pointerup', (ev) => {
    dragging = false;
    handle.releasePointerCapture(ev.pointerId);
  });
}

/* ============================ Chord popover ============================ */

function wireChordPopover(view: HTMLElement, state: PlayerState): void {
  // Use event delegation so dynamic chord re-renders keep working.
  const body = view.querySelector<HTMLElement>('#chord-body');
  const popover = view.querySelector<HTMLElement>('#chord-popover');
  if (!body || !popover) return;
  body.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement)?.closest<HTMLElement>('.ch[data-chord]');
    if (!target) return;
    const chord = target.dataset.chord ?? '';
    showChordPopover(view, target, chord);
    if (state.settings.audio) playChordByName(chord);
  });
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('#chord-popover') || t.closest('.ch[data-chord]') || t.closest('.diagram-cell')) return;
    popover.hidden = true;
  });
}

function showChordPopover(view: HTMLElement, anchor: HTMLElement, chord: string): void {
  const popover = view.querySelector<HTMLElement>('#chord-popover');
  if (!popover) return;
  popover.innerHTML = `
    <div class="chord-popover-name">${escapeHtml(chord)}</div>
    ${renderChordDiagram(chord, { width: 130 })}
  `;
  popover.hidden = false;
  // Position popover near the anchor.
  const ar = anchor.getBoundingClientRect();
  const wr = (popover.offsetParent as HTMLElement)?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const left = Math.max(8, ar.left - wr.left);
  const top = Math.max(8, ar.top - wr.top - popover.offsetHeight - 8);
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';

  // Also scroll the diagram strip to the matching cell + flash it.
  const cell = view.querySelector<HTMLElement>(`.diagram-cell[data-chord-name="${cssEscape(chord)}"]`);
  if (cell) {
    cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    cell.classList.add('flash');
    setTimeout(() => cell.classList.remove('flash'), 1100);
  }
}

function cssEscape(s: string): string {
  // Best-effort attribute selector escape.
  return s.replace(/(["\\])/g, '\\$1');
}

function applyLayout(view: HTMLElement, state: PlayerState): void {
  const body = view.querySelector<HTMLElement>('.player-body');
  if (body) body.dataset.layout = state.layout;
  view.querySelector<HTMLElement>('.pane-tab')?.setAttribute(
    'data-visible', String(state.layout === 'tab' || state.layout === 'both'));
  view.querySelector<HTMLElement>('.pane-chords')?.setAttribute(
    'data-visible', String(state.layout === 'chords' || state.layout === 'both'));
  view.querySelector<HTMLElement>('.pane-videos')?.setAttribute(
    'data-visible', String(state.layout === 'videos'));
  view.querySelector<HTMLElement>('.pane-fretboard')?.setAttribute(
    'data-visible', String(state.layout === 'fretboard'));
}

function mountTab(view: HTMLElement, state: PlayerState): void {
  const container = view.querySelector<HTMLElement>('#alphaTab');
  const statusEl = view.querySelector<HTMLElement>('#tab-status');
  if (!container || !statusEl || !state.tabUrl) return;

  const settings = new alphaTab.Settings();
  settings.player.enablePlayer = false;
  settings.core.fontDirectory = '/font/';
  settings.core.file = state.tabUrl;
  settings.display.staveProfile = alphaTab.StaveProfile.ScoreTab;

  const api = new alphaTab.AlphaTabApi(container, settings);
  activeApi = api;

  api.scoreLoaded.on((score) => {
    statusEl.textContent = `${score.title || state.song.title} — rendering…`;
  });
  api.renderFinished.on(() => {
    statusEl.textContent = 'Tab ready (audio playback disabled — see HANDOFF.md)';
  });
  api.error.on((error) => {
    console.error('[alphaTab error]', error);
    statusEl.textContent = `Error: ${(error as Error).message ?? String(error)}`;
  });
}

function transformedChordsFile(chords: ChordsFile, settings: ChordSettings): {
  lines: ChordLine[];
  uniqueChords: string[];
} {
  const opts: ChordTransformOptions = {
    capo: settings.capo,
    transpose: settings.transpose,
    simplify: settings.simplify,
    accidental: settings.accidental,
  };

  const transformedLines: ChordLine[] = chords.lines.map((line) => ({
    kind: line.kind,
    segments: line.segments.map((seg): ChordSegment => ({
      chord: seg.chord ? transformChord(seg.chord, opts) : undefined,
      text: seg.text,
    })),
  }));

  // Recompute unique chord set from the transformed output.
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const line of transformedLines) {
    for (const seg of line.segments) {
      if (seg.chord && !seen.has(seg.chord)) {
        seen.add(seg.chord);
        uniq.push(seg.chord);
      }
    }
  }
  return { lines: transformedLines, uniqueChords: uniq };
}

function refreshChords(view: HTMLElement, state: PlayerState): void {
  if (!state.chords) return;
  const { lines, uniqueChords } = transformedChordsFile(state.chords, state.settings);

  // Diagrams.
  const diagEl = view.querySelector<HTMLElement>('#chord-diagrams');
  if (diagEl) {
    diagEl.innerHTML = uniqueChords
      .map((c) => `<button type="button" class="diagram-cell" data-chord-name="${escapeHtml(c)}" title="${escapeHtml(c)}">${renderChordDiagram(c, { width: 96 })}</button>`)
      .join('');
    diagEl.querySelectorAll<HTMLButtonElement>('.diagram-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const name = cell.dataset.chordName ?? '';
        const wasActive = cell.classList.contains('active');
        diagEl.querySelectorAll('.diagram-cell.active').forEach((el) => el.classList.remove('active'));
        if (!wasActive) cell.classList.add('active');
        toggleChordHighlight(view, name);
        if (state.settings.audio) playChordByName(name);
      });
    });
  }

  // Body.
  const body = view.querySelector<HTMLElement>('#chord-body');
  if (!body) return;
  const { capo, transpose, simplify } = state.settings;
  const tuning = state.chords.meta.tuning;
  const headerBits: string[] = [];
  if (tuning) headerBits.push(`<span class="badge">Tuning: ${escapeHtml(tuning)}</span>`);
  if (capo) headerBits.push(`<span class="badge">Capo ${capo}F</span>`);
  if (transpose) headerBits.push(`<span class="badge">Transpose ${transpose >= 0 ? '+' : ''}${transpose}</span>`);
  if (simplify) headerBits.push(`<span class="badge">簡易コード</span>`);
  const header = headerBits.length ? `<div class="chord-header">${headerBits.join(' ')}</div>` : '';

  const renderedLines = lines
    .filter((line) => {
      if (line.segments.length === 1 && line.segments[0].text === tuning) return false;
      return true;
    })
    .map(renderLine)
    .join('\n');

  body.innerHTML = `
    ${header}
    <div class="chord-lines">${renderedLines}</div>
  `;
}

function toggleChordHighlight(view: HTMLElement, chordName: string): void {
  const body = view.querySelector<HTMLElement>('#chord-body');
  if (!body) return;
  const all = body.querySelectorAll<HTMLElement>('.ch[data-chord]');
  const alreadyOn = body.dataset.highlight === chordName;
  all.forEach((el) => el.classList.remove('hl'));
  if (alreadyOn) {
    body.dataset.highlight = '';
    return;
  }
  let firstHit: HTMLElement | null = null;
  all.forEach((el) => {
    if (el.dataset.chord === chordName) {
      el.classList.add('hl');
      if (firstHit === null) firstHit = el;
    }
  });
  body.dataset.highlight = chordName;
  if (firstHit !== null) (firstHit as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderLine(line: ChordLine): string {
  const segs = line.segments
    .map((s) => {
      const chord = s.chord
        ? `<span class="ch" data-chord="${escapeHtml(s.chord)}">${escapeHtml(s.chord)}</span>`
        : `<span class="ch ch-empty"></span>`;
      const text = s.text
        ? `<span class="lyr">${escapeHtml(s.text)}</span>`
        : `<span class="lyr"></span>`;
      return `<span class="seg">${chord}${text}</span>`;
    })
    .join('');
  return `<div class="line line-${line.kind}">${segs}</div>`;
}
