import { copyFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Capture the real homepage in an isolated, light-theme browser context.
// 1600 × 840 CSS pixels at 0.75 scale produces a 1200 × 630 PNG.
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 840 }, deviceScaleFactor: 0.75,
    colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC',
  });
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const heroImages = [...document.querySelectorAll('#home img')];
    await Promise.all(heroImages.map(img => img.decode()));
  });
  await page.screenshot({ path: 'dist/og-preview.png', animations: 'disabled', fullPage: false });
  await mkdir('public', { recursive: true });
  await copyFile('dist/og-preview.png', 'public/og-preview.png');
  console.log('Created homepage screenshot: dist/og-preview.png (1200 × 630).');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
