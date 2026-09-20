import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';

await build();
await copyFile('src/leetcode-stats.json', 'dist/leetcode-stats.json');
await build({
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: '.cache/prerender',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'render.mjs' } },
  },
  logLevel: 'warn',
});
const { render } = await import('../.cache/prerender/render.mjs');
const page = await readFile('dist/index.html', 'utf8');
const marker = '<!--app-html-->';
if (!page.includes(marker)) throw new Error('Prerender marker not found.');
let html = page.replace(marker, render());
if (process.env.PORTFOLIO_URL) {
  const url = new URL(process.env.PORTFOLIO_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('PORTFOLIO_URL must be a public HTTPS URL.');
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  html = html.replaceAll('content="./og-preview.png"', `content="${escape(new URL('og-preview.png', url).href)}"`);
  html = html.replace('</head>', `  <meta property="og:url" content="${escape(url.href)}" />\n    <link rel="canonical" href="${escape(url.href)}" />\n  </head>`);
}
await writeFile('dist/index.html', html);
console.log('Prerendered portfolio: full content is available without JavaScript.');
