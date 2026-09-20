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
await writeFile('dist/index.html', page.replace(marker, render()));
console.log('Prerendered portfolio: full content is available without JavaScript.');
