/**
 * YouTube search via the public search results page (no API key required).
 * The page embeds a `ytInitialData` JSON blob that contains the full search
 * response; we parse it for video metadata. This is suitable for periodic
 * use; for high-volume queries the official Data API v3 is the right path.
 */

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9',
};

const SEARCH_URL = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channel: string;
  duration?: string;
  views?: string;
  url: string;
  embedUrl: string;
}

export async function searchYouTube(query: string): Promise<YouTubeVideo[]> {
  const res = await fetch(SEARCH_URL(query), { headers: browserHeaders });
  if (!res.ok) throw new Error(`YouTube search ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});\s*<\/script>/);
  if (!m) throw new Error('no ytInitialData in YouTube response');
  let data: any;
  try { data = JSON.parse(m[1]); } catch { throw new Error('failed to parse ytInitialData'); }
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
  const items = sections.flatMap((c: any) => c?.itemSectionRenderer?.contents ?? []);
  const videos: YouTubeVideo[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    const v = i?.videoRenderer;
    if (!v?.videoId) continue;
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    videos.push({
      videoId: v.videoId,
      title: v.title?.runs?.[0]?.text ?? v.title?.simpleText ?? '',
      channel: v.ownerText?.runs?.[0]?.text ?? '',
      duration: v.lengthText?.simpleText,
      views: v.viewCountText?.simpleText,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
    });
  }
  return videos;
}

/**
 * Score a video as a likely guitar tutorial / TAB / cover / playthrough.
 * Higher = more relevant. Returns negative for likely-irrelevant.
 */
export function scoreTutorial(v: YouTubeVideo): number {
  const t = (v.title + ' ' + v.channel).toLowerCase();
  let score = 0;
  // Strong positive markers.
  if (/tab|タブ|tab譜/i.test(v.title)) score += 5;
  if (/弾いてみた|演奏してみた|covered/i.test(v.title)) score += 3;
  if (/ソロギター|solo guitar|fingerstyle|アコギ/i.test(v.title)) score += 3;
  if (/レッスン|lesson|tutorial|how to|弾き方/i.test(v.title)) score += 4;
  if (/コード|chord|chords/i.test(v.title)) score += 2;
  if (/簡単|easy|beginner/i.test(v.title)) score += 1;

  // Mild negatives for irrelevant content.
  if (/karaoke|カラオケ|オフボーカル|instrumental version/i.test(v.title)) score -= 2;
  if (/8d audio|reaction|リアクション|mv|music video/i.test(v.title)) score -= 3;
  if (/loop|1時間|1 hour/i.test(v.title)) score -= 4;

  // Duration sanity check: tutorials are typically 1–10 minutes.
  if (v.duration) {
    const parts = v.duration.split(':').map(Number);
    let secs = 0;
    if (parts.length === 2) secs = parts[0] * 60 + parts[1];
    else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (secs >= 60 && secs <= 600) score += 1;
    if (secs > 1800) score -= 3; // > 30 min unlikely a single-song tutorial
  }
  return score;
}

export function rankTutorials(videos: YouTubeVideo[]): YouTubeVideo[] {
  return videos
    .map((v) => ({ v, s: scoreTutorial(v) }))
    .sort((a, b) => b.s - a.s)
    .map(({ v }) => v);
}
