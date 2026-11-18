# Soham Belurgikar - portfolio

Source for [sohamb17.github.io](https://sohamb17.github.io/): my projects, experience, resume and coding-contest stats on one page.

## How it works

- **Stack:** React 19 and TypeScript, built with Vite. `scripts/build.mjs` prerenders the page to static HTML, so the content is there before any JavaScript runs.
- **Content:** all text lives in `src/content.json`. The resume is `resume/resume.tex`, and its PDF is served from `public/`.
- **Contest stats:** each deploy fetches my current LeetCode and Codeforces numbers from their public APIs (`scripts/leetcode.mjs`, `scripts/codeforces.mjs`). If a site is down or blocks the request, the build keeps the last verified snapshot instead of failing, and the published `codeforces-stats.json` records whether the last check worked.
- **Deploy:** `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` and once a day.
- **Sharing image:** `scripts/og-image.mjs` screenshots the built homepage with Playwright for the link preview.

## Run it locally

Requires Node 22.12 or later.

```
npm ci
npm run dev                    # local dev server
npm run build                  # type-check, build and prerender to dist/
npm run test:leetcode          # stats refresh and fallback tests
npm run test:codeforces
```

## License

The code is under the MIT License (see `LICENSE`). The written content, resume, photo and project descriptions are mine and are not covered by that license. Third-party fonts, libraries and brand icons keep their own licenses: see `public/licenses/` and `public/brands/README.md`.
