/**
 * MusicBrainz fetcher for artist discography.
 *
 * Why MusicBrainz: it's the open, community-curated authoritative DB for
 * release/recording metadata. We use it to get a canonical track list per
 * artist *independent* of whether tab/chord data exists in Songsterr or U-FRET.
 *
 * Compliance:
 * - 1 req/sec rate limit (anonymous; we sleep 1100ms between requests).
 * - User-Agent must identify the application: see UA constant below.
 * - https://musicbrainz.org/doc/MusicBrainz_API
 *
 * Coverage caveat: MB has good coverage of Western releases. For Japanese
 * artists, coverage is patchier — typical names are stored under both
 * Latin and native scripts and album lists may miss B-sides. Cross-checking
 * against Songsterr / U-FRET is therefore part of the pipeline, not an
 * afterthought.
 */

const UA = 'tab-viewer/0.1 (local-only; private use; https://github.com/reizist)';
const BASE = 'https://musicbrainz.org/ws/2';
const SLEEP_MS = 1100; // a hair over the 1 req/s limit to be safe

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function mbFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ fmt: 'json', ...params }).toString();
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status}: ${url}`);
  }
  return (await res.json()) as T;
}

export interface MBArtistMatch {
  id: string;
  name: string;
  sortName: string;
  country?: string;
  disambiguation?: string;
  score?: number;
}

export interface MBSearchResult {
  artists: MBArtistMatch[];
}

interface MBSearchRaw {
  artists: { id: string; name: string; 'sort-name': string; country?: string; disambiguation?: string; score?: number }[];
}

export async function searchArtist(query: string, limit = 8): Promise<MBArtistMatch[]> {
  const data = await mbFetch<MBSearchRaw>('/artist', { query, limit: String(limit) });
  return (data.artists ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    sortName: a['sort-name'],
    country: a.country,
    disambiguation: a.disambiguation,
    score: a.score,
  }));
}

export interface MBTrack {
  title: string;
  recordingId?: string;
  position: number;
  length?: number; // ms
}

export interface MBRelease {
  id: string;
  title: string;
  type?: string;            // 'Album', 'EP', 'Single', etc.
  primaryType?: string;
  date?: string;            // YYYY or YYYY-MM-DD
  country?: string;
  status?: string;
  tracks: MBTrack[];
}

export interface MBDiscography {
  artist: { id: string; name: string; sortName: string; country?: string };
  releases: MBRelease[];
  /** Flattened, de-duplicated tracks (earliest release wins). */
  uniqueTracks: { title: string; firstRelease?: string; firstYear?: string }[];
  fetchedAt: string;
}

interface MBReleaseGroupRaw {
  id: string;
  title: string;
  'primary-type'?: string;
  'first-release-date'?: string;
}

interface MBReleaseGroupListRaw {
  'release-groups': MBReleaseGroupRaw[];
}

interface MBReleaseRaw {
  id: string;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  'release-group'?: MBReleaseGroupRaw;
  media?: {
    tracks?: { title: string; position: number; length?: number; recording?: { id: string; title: string } }[];
  }[];
}

interface MBReleaseListRaw {
  releases: MBReleaseRaw[];
}

/**
 * Fetch full discography for an artist. Strategy:
 * 1. List release-groups (albums/EPs/singles) for the artist.
 * 2. For each RG, pick the earliest release and load its tracklist with recordings.
 * This reduces request volume vs. loading every release of every group.
 */
export async function fetchDiscography(
  artistId: string,
  opts?: { types?: string[]; limit?: number }
): Promise<MBDiscography> {
  // 1) Artist metadata.
  const artistInfo = await mbFetch<{ id: string; name: string; 'sort-name': string; country?: string }>(
    `/artist/${artistId}`,
    {}
  );
  await sleep(SLEEP_MS);

  // 2) All release-groups (paginated).
  const types = (opts?.types ?? ['album', 'ep', 'single']).join('|');
  const allGroups: MBReleaseGroupRaw[] = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const page = await mbFetch<MBReleaseGroupListRaw>('/release-group', {
      artist: artistId,
      type: types,
      limit: String(pageSize),
      offset: String(offset),
    });
    const items = page['release-groups'] ?? [];
    allGroups.push(...items);
    if (items.length < pageSize) break;
    offset += pageSize;
    await sleep(SLEEP_MS);
    if (opts?.limit && allGroups.length >= opts.limit) break;
  }

  // Optional cap.
  const groups = opts?.limit ? allGroups.slice(0, opts.limit) : allGroups;
  // Sort chronologically by first-release-date.
  groups.sort((a, b) => (a['first-release-date'] ?? '').localeCompare(b['first-release-date'] ?? ''));

  // 3) For each group, pick the earliest official release and load tracks.
  const releases: MBRelease[] = [];
  for (const g of groups) {
    await sleep(SLEEP_MS);
    let releasesPage: MBReleaseListRaw;
    try {
      releasesPage = await mbFetch<MBReleaseListRaw>('/release', {
        'release-group': g.id,
        inc: 'recordings+media',
        limit: '5',
      });
    } catch (err) {
      console.warn(`[mb] failed to load releases for ${g.title}: ${(err as Error).message}`);
      continue;
    }
    const candidates = releasesPage.releases ?? [];
    if (!candidates.length) continue;
    candidates.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const r = candidates[0];

    const tracks: MBTrack[] = [];
    for (const m of r.media ?? []) {
      for (const t of m.tracks ?? []) {
        tracks.push({
          title: t.title,
          recordingId: t.recording?.id,
          position: t.position,
          length: t.length,
        });
      }
    }
    releases.push({
      id: r.id,
      title: g.title,
      type: g['primary-type'],
      primaryType: g['primary-type'],
      date: r.date ?? g['first-release-date'],
      country: r.country,
      status: r.status,
      tracks,
    });
  }

  // 4) Build unique tracks list (case-insensitive title key, earliest release wins).
  const uniq = new Map<string, { title: string; firstRelease?: string; firstYear?: string }>();
  for (const r of releases) {
    for (const t of r.tracks) {
      const key = t.title.toLowerCase().trim();
      if (!uniq.has(key)) {
        uniq.set(key, {
          title: t.title,
          firstRelease: r.title,
          firstYear: (r.date ?? '').slice(0, 4) || undefined,
        });
      }
    }
  }

  return {
    artist: {
      id: artistInfo.id,
      name: artistInfo.name,
      sortName: artistInfo['sort-name'],
      country: artistInfo.country,
    },
    releases,
    uniqueTracks: Array.from(uniq.values()),
    fetchedAt: new Date().toISOString(),
  };
}
