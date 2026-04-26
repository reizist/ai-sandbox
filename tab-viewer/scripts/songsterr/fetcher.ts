import type {
  SongsterrRevisionTrackPayload,
  SongsterrStateMetaCurrent
} from './types';

const PRIMARY_CDN = 'https://dqsljvtekg760.cloudfront.net';
const FALLBACK_CDN = 'https://d3d3l6a6rcgkaf.cloudfront.net';

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

export interface FetchedRevision {
  partId: number;
  revision: SongsterrRevisionTrackPayload;
}

export interface FetchResult {
  state: SongsterrStateMetaCurrent;
  revisions: FetchedRevision[];
}

export async function fetchSongsterrPage(tabUrl: string): Promise<FetchResult> {
  const html = await fetchText(tabUrl);
  const state = extractState(html);
  const revisions = await fetchAllRevisions(state);
  return { state, revisions };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: browserHeaders });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function extractState(html: string): SongsterrStateMetaCurrent {
  const match = html.match(
    /<script[^>]*id=["']state["'][^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) {
    throw new Error('Could not find <script id="state"> in page HTML');
  }
  const raw = match[1].trim();
  const parsed = JSON.parse(raw);
  const current = parsed?.meta?.current;
  if (
    !current?.songId ||
    !current?.revisionId ||
    !current?.image ||
    !Array.isArray(current?.tracks)
  ) {
    throw new Error('State payload missing required fields');
  }
  return {
    songId: current.songId,
    revisionId: current.revisionId,
    image: current.image,
    title: current.title || 'Song',
    artist: current.artist || 'Unknown Artist',
    tracks: current.tracks
  };
}

async function fetchAllRevisions(
  state: SongsterrStateMetaCurrent
): Promise<FetchedRevision[]> {
  const tracks = state.tracks
    .filter((t) => typeof t.partId === 'number')
    .sort((a, b) => a.partId - b.partId);

  const tryFetch = async (cdn: string) => {
    const results: (FetchedRevision | null)[] = await Promise.all(
      tracks.map(async (track) => {
        const url = `${cdn}/${state.songId}/${state.revisionId}/${state.image}/${track.partId}.json`;
        try {
          const res = await fetch(url, { headers: browserHeaders });
          if (!res.ok) return null;
          const revision = (await res.json()) as SongsterrRevisionTrackPayload;
          return { partId: track.partId, revision };
        } catch {
          return null;
        }
      })
    );
    return results.filter((r): r is FetchedRevision => r !== null);
  };

  const primary = await tryFetch(PRIMARY_CDN);
  if (primary.length > 0) return primary;
  return tryFetch(FALLBACK_CDN);
}
