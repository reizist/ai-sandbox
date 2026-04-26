/**
 * Asset path helpers. Following the convention requested by the user:
 *   public/tabs/{artist}/{song}/{artist}_{song}.{ext}
 * Legacy files (source.gp, chords.json) are also recognized for backward
 * compatibility — see resolveTabUrl / resolveChordsUrl.
 */

export function assetFileName(
  artistSlug: string,
  songSlug: string,
  ext: string
): string {
  return `${artistSlug}_${songSlug}.${ext}`;
}

export function songDirUrl(artistSlug: string, songSlug: string): string {
  return `/tabs/${encodeURIComponent(artistSlug)}/${encodeURIComponent(songSlug)}`;
}

export function preferredTabUrl(artistSlug: string, songSlug: string): string {
  return `${songDirUrl(artistSlug, songSlug)}/${encodeURIComponent(assetFileName(artistSlug, songSlug, 'gp'))}`;
}

export function legacyTabUrl(artistSlug: string, songSlug: string): string {
  return `${songDirUrl(artistSlug, songSlug)}/source.gp`;
}

export function preferredChordsUrl(artistSlug: string, songSlug: string): string {
  return `${songDirUrl(artistSlug, songSlug)}/${encodeURIComponent(assetFileName(artistSlug, songSlug, 'chords.json'))}`;
}

export function legacyChordsUrl(artistSlug: string, songSlug: string): string {
  return `${songDirUrl(artistSlug, songSlug)}/chords.json`;
}

/** HEAD-probe both URLs and return whichever exists (preferred wins). */
export async function resolveAssetUrl(
  preferred: string,
  legacy: string
): Promise<string | null> {
  const tryHead = async (u: string): Promise<boolean> => {
    try {
      const r = await fetch(u, { method: 'HEAD', cache: 'no-cache' });
      return r.ok;
    } catch {
      return false;
    }
  };
  if (await tryHead(preferred)) return preferred;
  if (await tryHead(legacy)) return legacy;
  return null;
}
