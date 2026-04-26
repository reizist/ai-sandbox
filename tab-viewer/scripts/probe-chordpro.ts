#!/usr/bin/env tsx
import { chromium } from 'playwright';

const PAGE_URL =
  'https://www.songsterr.com/a/wsa/led-zeppelin-stairway-to-heaven-lyrics-chords-s376159';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
  });
  const page = await ctx.newPage();

  const responses: Array<{
    method: string;
    url: string;
    status: number;
    contentType?: string;
    body?: string;
  }> = [];

  page.on('response', async (res) => {
    const req = res.request();
    const url = res.url();
    if (url.includes('google') || url.includes('gtm') || url.includes('doubleclick')) return;
    let body: string | undefined;
    try {
      const text = await res.text();
      body = text.slice(0, 1500);
    } catch {}
    responses.push({
      method: req.method(),
      url,
      status: res.status(),
      contentType: res.headers()['content-type'],
      body
    });
  });

  console.log(`Loading ${PAGE_URL}…`);
  await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Examine rendered chord container
  const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('\n=== visible text (first 1500 chars) ===');
  console.log(visibleText);

  // Check for chord elements
  const chordElems = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[class*="chord" i], [class*="Chord"]'));
    return all.slice(0, 8).map((el) => ({
      tag: el.tagName,
      cls: (el as HTMLElement).className?.toString().slice(0, 80),
      text: (el as HTMLElement).innerText?.slice(0, 60)
    }));
  });
  console.log('\n=== chord-classed elements (first 8) ===');
  console.log(chordElems);

  // Look for any window-scope state with chord data
  const stateProbe = await page.evaluate(() => {
    const candidates: any[] = [];
    for (const k of Object.keys(window) as string[]) {
      try {
        const v = (window as any)[k];
        if (v && typeof v === 'object' && JSON.stringify(v).includes('chordpro')) {
          candidates.push({ key: k, type: typeof v });
        }
      } catch {}
    }
    return candidates;
  });
  console.log('\n=== window keys with chordpro ===');
  console.log(stateProbe);

  await browser.close();

  console.log(`\n=== all responses (${responses.length}) ===`);
  for (const r of responses) {
    console.log(`[${r.status}] ${r.method} ${r.url}`);
    if (r.contentType) console.log(`   ${r.contentType}`);
  }
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
