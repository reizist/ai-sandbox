import { defineConfig } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [alphaTab(), tailwindcss()],
  server: {
    /**
     * Browser-side ad-hoc YouTube search needs a CORS-friendly endpoint;
     * youtube.com refuses cross-origin requests. We proxy through Vite so
     * the page can issue `fetch('/api/yt-search?search_query=...')` and we
     * forward to the public results page transparently.
     *
     * Same for /api/yt-save: a tiny POST endpoint that lets the running app
     * persist newly-discovered refs into the song's manifest.json so the
     * next visit doesn't re-search. (See yt-save-plugin below.)
     */
    proxy: {
      '/api/yt-search': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yt-search/, '/results'),
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            req.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
            );
            req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
            req.setHeader('Accept-Language', 'ja,en-US;q=0.9,en;q=0.8');
            // Strip identifying browser cookies so YouTube returns a stable
            // logged-out result page; otherwise it might 302 to consent.
            req.removeHeader?.('cookie');
          });
        },
      },
    },
  },
});
