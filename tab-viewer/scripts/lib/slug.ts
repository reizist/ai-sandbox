/**
 * Filesystem-safe slug. Preserves non-ASCII (Japanese) characters since
 * macOS / Linux handle them fine and we want readable directory names.
 * Strips characters that confuse shells / Windows filesystems.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}
