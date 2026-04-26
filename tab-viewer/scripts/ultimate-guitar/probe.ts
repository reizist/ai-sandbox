#!/usr/bin/env tsx
/**
 * Ultimate Guitar requires Cloudflare challenge solving for plain HTTP.
 * Playwright (already a project devDep, used by probe-chordpro.ts) handles
 * the JS challenge transparently.
 *
 * This is a probe / structural-check script, not a production fetcher yet.
 * Run: npm run probe:ug -- "Spitz" "Cherry"
 */
import { chromium } from 'playwright';

const SEARCH_URL = (q: string) => `https://www.ultimate-guitar.com/search.php?value=${encodeURIComponent(q)}&search_type=title`;

async function main() {
  const [artist, title] = process.argv.slice(2);
  if (!artist || !title) {
    throw new Error('Usage: npm run probe:ug -- "<artist>" "<title>"');
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'ja-JP',
    extraHTTPHeaders: { 'Accept-Language': 'ja,en-US;q=0.9' },
  });
  const page = await ctx.newPage();
  const q = `${artist} ${title}`;
  console.log(`[ug] search: ${q}`);
  await page.goto(SEARCH_URL(q), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // The page state is in <div class="js-store" data-content="{escaped JSON}">.
  // Wait briefly for it to attach (Cloudflare may inject the challenge first).
  // Wait for any element with data-content attribute or React app to mount.
  await page.waitForFunction(() => {
    return !!document.querySelector('[data-content]') ||
           !!document.querySelector('a[href*="/tab/"]') ||
           !!document.querySelector('article a');
  }, { timeout: 30_000 }).catch(() => {});

  // Try several extraction strategies.
  const result = await page.evaluate(() => {
    const out: Record<string, any> = {};
    const dc = document.querySelector('[data-content]');
    if (dc) out.dataContent = dc.getAttribute('data-content');
    // App state may be in window.__INITIAL_STATE__ or similar.
    out.windowKeys = Object.keys(window as any).filter((k) => k.startsWith('__'));
    // Tab links visible on the page.
    const tabLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/tab/"]'))
      .slice(0, 10).map((a) => ({ text: a.textContent?.trim() ?? '', href: a.href }));
    out.tabLinks = tabLinks;
    // Article (search-result-card) layout.
    out.articleCount = document.querySelectorAll('article').length;
    return out;
  });
  console.log('[ug] search extraction result:');
  console.log(JSON.stringify(result, null, 2));
  const data = result.dataContent;
  const firstTab = result.tabLinks?.[0]?.href;
  if (firstTab) {
    console.log(`\n[ug] visiting first tab: ${firstTab}`);
    await page.goto(firstTab, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      return !!document.querySelector('[data-content]') ||
             !!document.querySelector('pre') ||
             !!document.querySelector('.js-tab-content');
    }, { timeout: 30_000 }).catch(() => {});
    const tabState = await page.evaluate(() => {
      const out: Record<string, any> = {};
      const dc = document.querySelector('[data-content]');
      if (dc) out.dataContentLen = dc.getAttribute('data-content')?.length ?? 0;
      out.preCount = document.querySelectorAll('pre').length;
      const firstPre = document.querySelector('pre');
      if (firstPre) out.preSample = firstPre.textContent?.slice(0, 300);
      // Modern UG: chord+lyric is in <pre> with [ch]X[/ch] tokens.
      out.chTokens = !!document.querySelector('pre')?.innerHTML?.includes('[ch]');
      // Find any element whose textContent looks like chord notation [Am]
      const html = document.documentElement.outerHTML;
      out.dataContentMarker = html.indexOf('"tab_view"');
      return out;
    });
    console.log('[ug] tab page extraction:');
    console.log(JSON.stringify(tabState, null, 2));
    // Save the page HTML for offline analysis.
    const fs = await import('node:fs/promises');
    const html = await page.content();
    await fs.writeFile('/tmp/ug-tab.html', html);
    console.log(`[ug] saved tab page HTML to /tmp/ug-tab.html (${html.length} bytes)`);
  }
  if (!data) {
    console.log('[ug] no js-store; dumping HTML head:');
    const html = await page.content();
    console.log(html.slice(0, 2000));
  } else {
    const parsed = JSON.parse(data);
    const results = parsed?.store?.page?.data?.results ?? [];
    console.log(`[ug] ${results.length} results. First 5:`);
    for (const r of results.slice(0, 5)) {
      console.log(' ', r.id, r.type, r.artist_name ?? r.artist, '/', r.song_name ?? r.song, '→', r.tab_url);
    }
    // Dump raw shape for one result to see the schema.
    if (results[0]) {
      console.log('---first result keys:', Object.keys(results[0]).slice(0, 25));
    }
  }
  await browser.close();
}

main().catch((err) => { console.error('✗', err); process.exit(1); });
