#!/usr/bin/env tsx
/**
 * Build a synthetic "ジブリ" virtual artist by scraping U-FRET's Ghibli tag
 * page (pickup.php?tag=ジブリ). Each tagged song is fetched with the existing
 * U-FRET song fetcher and saved under public/tabs/ジブリ/{songSlug}/, with
 * the manifest preserving the *original* recording artist for credit.
 *
 * Optionally extends coverage by also pulling chord pages whose titles match
 * a list of Ghibli film keywords, since the curated tag is short (~18 songs).
 *
 * Usage:
 *   npm run fetch:ghibli                 # tag page only (~18 songs)
 *   npm run fetch:ghibli -- --extend     # tag + keyword-based extension
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchUfretSong } from './ufret/song-fetcher';
import { listUfretArtistSongs, groupUfretByTitle, type UfretSongRow } from './ufret/artist-fetcher';
import { slugify } from './lib/slug';

const TABS_ROOT = 'public/tabs';
const VIRTUAL_ARTIST = 'ジブリ';
const TAG_URL = 'https://www.ufret.jp/pickup.php?tag=' + encodeURIComponent('ジブリ');
const SONG_URL = (id: number) => `https://www.ufret.jp/song.php?data=${id}`;

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9',
};

/**
 * Artists who frequently appear on Ghibli soundtracks (vocalists / lyricists).
 * For --extend mode, we also scan their U-FRET artist pages and pick songs
 * whose title matches a known Ghibli film/song keyword.
 */
const GHIBLI_RELATED_ARTISTS = [
  '井上あずみ',         // となりのトトロ / 君をのせて / さんぽ / 風の谷のナウシカ
  '木村弓',             // いつも何度でも (千と千尋)
  '手嶌葵',             // テルーの唄 / さよならの夏 / 風になる
  '米良美一',           // もののけ姫
  '荒井由実',           // ルージュの伝言 / やさしさに包まれたなら / ひこうき雲
  '松任谷由実',         // (荒井由実 別表記)
  'つじあやの',         // 風になる
  '本名陽子',           // カントリー・ロード
  '加藤登紀子',         // 時には昔の話を
  '藤岡藤巻と大橋のぞみ',   // 崖の上のポニョ
  '久石譲',             // 作曲家本人 (インスト含む)
];

/**
 * Title keywords that strongly indicate a Ghibli film theme. We restrict the
 * --extend scan to artist songs whose title contains one of these.
 */
const GHIBLI_TITLE_KEYWORDS = [
  'トトロ', 'さんぽ', '風になる', 'カントリー・ロード', 'カントリーロード',
  'やさしさに包まれたなら', 'ルージュの伝言', 'ひこうき雲',
  'いつも何度でも', 'いのちの名前', 'あの夏へ',
  '君をのせて', '帰らざる日々', '時には昔の話を', '世界の約束',
  'もののけ姫', 'アシタカ', 'シシ神',
  'ナウシカ', 'ラピュタ', 'ラピュタの城',
  'カオナシ', '千と千尋', '神隠し',
  'ハウル', '人生のメリーゴーランド',
  'ポニョ', '崖の上',
  'コクリコ', 'さよならの夏',
  'テルーの唄', 'ゲド戦記',
  'アリエッティ',
  '風立ちぬ',
  'マルコ', '紅の豚', '時には昔', 'さくらんぼの実る頃',
  '魔女', '海の見える街', 'やさしさに',
];

interface CliArgs {
  extend: boolean;
  delayMs: number;
  concurrency: number;
}

function parseArgs(argv: string[]): CliArgs {
  let extend = false;
  let delay = 500;
  let concurrency = 2;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--extend') extend = true;
    else if (a === '--delay') delay = Number(argv[++i]);
    else if (a === '--concurrency') concurrency = Number(argv[++i]);
  }
  return { extend, delay, concurrency };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }

interface GhibliSongRef extends UfretSongRow {
  origArtist: string;
}

async function loadTagPage(): Promise<GhibliSongRef[]> {
  const res = await fetch(TAG_URL, { headers: browserHeaders });
  if (!res.ok) throw new Error(`tag page ${res.status}`);
  const html = await res.text();
  const out: GhibliSongRef[] = [];
  const re = /<a\s+href="\/song\.php\?data=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const block = m[2];
    const tm = block.match(/c-list__title[^>]*>([\s\S]*?)<\/p>/);
    const am = block.match(/c-list__sub[^>]*>([\s\S]*?)<\/p>|c-list__artist[^>]*>([\s\S]*?)<\/p>/);
    if (!tm) continue;
    const title = decodeHtml(tm[1].replace(/<[^>]+>/g, '').trim());
    const origArtist = am ? decodeHtml((am[1] || am[2] || '').replace(/<[^>]+>/g, '').trim()) : '';
    const variantMatch = title.match(/\(([^()]*ver\.[^()]*)\)/);
    const cleanTitle = title.replace(/\s*\([^()]*ver\.[^()]*\)\s*/, '').trim();
    out.push({
      songId: Number(m[1]),
      title: cleanTitle || title,
      variantTag: variantMatch ? variantMatch[1] : undefined,
      origArtist,
    });
  }
  return out;
}

async function loadFromRelatedArtists(): Promise<GhibliSongRef[]> {
  const out: GhibliSongRef[] = [];
  for (const artist of GHIBLI_RELATED_ARTISTS) {
    try {
      const list = await listUfretArtistSongs(artist);
      const matched = list.songs.filter((s) =>
        GHIBLI_TITLE_KEYWORDS.some((k) => s.title.includes(k))
      );
      console.log(`  ${artist}: ${matched.length} Ghibli-keyword matches (of ${list.songs.length})`);
      for (const m of matched) out.push({ ...m, origArtist: artist });
      await sleep(800);
    } catch (err) {
      console.warn(`  ${artist}: ${(err as Error).message}`);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Fetching ジブリ tag (${TAG_URL})…`);
  const tagSongs = await loadTagPage();
  console.log(`  ${tagSongs.length} songs from tag page`);
  let allSongs = tagSongs;

  if (args.extend) {
    console.log(`Extending via Ghibli-related artists…`);
    const extra = await loadFromRelatedArtists();
    // Merge by songId.
    const seen = new Set(allSongs.map((s) => s.songId));
    for (const e of extra) {
      if (!seen.has(e.songId)) {
        seen.add(e.songId);
        allSongs.push(e);
      }
    }
    console.log(`  total after extend: ${allSongs.length}`);
  }

  // Group by normalized title and pick the best candidate (parseable).
  const groups = groupUfretByTitle(allSongs);
  const picks: GhibliSongRef[] = groups
    .map((g) => g[0] as GhibliSongRef)
    // groupUfretByTitle returns plain UfretSongRow; we need to find origArtist
    // by looking back in allSongs.
    .map((row) => allSongs.find((s) => s.songId === row.songId) ?? (row as GhibliSongRef));
  console.log(`After title-dedupe: ${picks.length} unique songs to fetch`);

  let okCount = 0, skipCount = 0, errCount = 0;
  for (let i = 0; i < picks.length; i++) {
    const r = picks[i];
    const songSlug = slugify(r.title);
    const outDir = join(TABS_ROOT, slugify(VIRTUAL_ARTIST), songSlug);
    const chordPath = join(outDir, `${slugify(VIRTUAL_ARTIST)}_${songSlug}.chords.json`);
    if (await exists(chordPath)) {
      skipCount++;
      console.log(`  · [${i + 1}/${picks.length}] ${r.title} (skipped — already have)`);
      continue;
    }
    try {
      const result = await fetchUfretSong(r.songId);
      await mkdir(outDir, { recursive: true });
      // Override the chord file artist field so the viewer displays "ジブリ"
      // while preserving the original recording artist in the manifest.
      result.chordsFile.meta.artist = VIRTUAL_ARTIST;
      await writeFile(chordPath, JSON.stringify(result.chordsFile, null, 2));
      const manifestPath = join(outDir, 'manifest.json');
      let m: any = {};
      try { m = JSON.parse(await readFile(manifestPath, 'utf-8')); } catch { /* fresh */ }
      m = {
        ...m,
        artist: VIRTUAL_ARTIST,
        song: r.title,
        artistSlug: slugify(VIRTUAL_ARTIST),
        songSlug,
        originalArtist: r.origArtist || result.meta.artist,
        hasChords: true,
        chordsSource: 'ufret',
        chordsSourceUrl: SONG_URL(r.songId),
        chordsUfretSongId: r.songId,
        chordsUfretVariant: result.meta.variant,
        chordsFetchedAt: new Date().toISOString(),
        ghibliTag: true,
      };
      await writeFile(manifestPath, JSON.stringify(m, null, 2));
      okCount++;
      console.log(`  ✓ [${i + 1}/${picks.length}] ${r.title}  (${r.origArtist || '?'})`);
    } catch (err: any) {
      errCount++;
      console.warn(`  ✗ [${i + 1}/${picks.length}] ${r.title}: ${err.message}`);
    }
    await sleep(args.delayMs);
  }

  console.log(`\nDone: ${okCount} new, ${skipCount} skipped, ${errCount} error`);
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
