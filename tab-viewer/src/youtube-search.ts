/**
 * Browser-side YouTube search via the Vite-proxied `/api/yt-search` endpoint
 * (avoids CORS by going through the dev server's HTTP proxy).
 *
 * Parses the same `ytInitialData` JSON blob the SSR scripts use. Results are
 * cached in `sessionStorage` keyed by query so reopening the same song doesn't
 * hit YouTube again within a session.
 */

import type { YoutubeRef } from './types';

const SEARCH_PATH = (q: string) => `/api/yt-search?search_query=${encodeURIComponent(q)}`;
const CACHE_PREFIX = 'tab-viewer.yt.cache.';

export interface RankedRef extends YoutubeRef {
  score?: number;
}

export async function searchYouTubeAdHoc(query: string, opts: { force?: boolean } = {}): Promise<RankedRef[]> {
  const cacheKey = CACHE_PREFIX + query;
  if (!opts.force) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as RankedRef[];
    } catch { /* ignore */ }
  }
  const res = await fetch(SEARCH_PATH(query), { cache: 'no-store' });
  if (!res.ok) throw new Error(`yt search proxy returned ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});\s*<\/script>/);
  if (!m) throw new Error('no ytInitialData in search response');
  let data: any;
  try { data = JSON.parse(m[1]); } catch { throw new Error('failed to parse ytInitialData'); }
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
  const items: any[] = sections.flatMap((c: any) => c?.itemSectionRenderer?.contents ?? []);
  const seen = new Set<string>();
  const refs: RankedRef[] = [];
  for (const i of items) {
    const v = i?.videoRenderer;
    if (!v?.videoId || seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    refs.push({
      videoId: v.videoId,
      title: v.title?.runs?.[0]?.text ?? v.title?.simpleText ?? '',
      channel: v.ownerText?.runs?.[0]?.text ?? '',
      duration: v.lengthText?.simpleText,
      views: v.viewCountText?.simpleText,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
    });
  }
  const ranked = rankBy(refs);
  try { sessionStorage.setItem(cacheKey, JSON.stringify(ranked)); } catch { /* quota */ }
  return ranked;
}

function rankBy(refs: RankedRef[]): RankedRef[] {
  return refs
    .map((r) => ({ ...r, score: scoreTutorial(r) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function scoreTutorial(v: RankedRef): number {
  const t = v.title.toLowerCase();
  let s = 0;
  if (/tab|タブ|tab譜/i.test(v.title)) s += 5;
  if (/弾いてみた|演奏してみた|covered/i.test(v.title)) s += 3;
  if (/ソロギター|solo guitar|fingerstyle|アコギ/i.test(v.title)) s += 3;
  if (/レッスン|lesson|tutorial|how to|弾き方/i.test(v.title)) s += 4;
  if (/コード|chord|chords/i.test(v.title)) s += 2;
  if (/簡単|easy|beginner/i.test(v.title)) s += 1;
  if (/karaoke|カラオケ|オフボーカル|instrumental version/i.test(v.title)) s -= 2;
  if (/8d audio|reaction|リアクション|mv|music video/i.test(v.title)) s -= 3;
  if (/loop|1時間|1 hour/i.test(v.title)) s -= 4;
  if (v.duration) {
    const parts = v.duration.split(':').map(Number);
    let secs = 0;
    if (parts.length === 2) secs = parts[0] * 60 + parts[1];
    else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (secs >= 60 && secs <= 600) s += 1;
    if (secs > 1800) s -= 3;
  }
  // Suppress unused-warning for `t`.
  void t;
  return s;
}

export function clearYouTubeSearchCache(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
