import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Rank names exactly as the public Codeforces API reports them (user.info).
export const RANKS = ['newbie', 'pupil', 'specialist', 'expert', 'candidate master', 'master',
  'international master', 'grandmaster', 'international grandmaster', 'legendary grandmaster'];

const MAX_HISTORY = 500;

export function validStats(value, handle, now = new Date()) {
  return typeof value?.handle === 'string' && value.handle.toLowerCase() === handle.toLowerCase()
    && RANKS.includes(value.rank) && RANKS.includes(value.maxRank)
    && Number.isSafeInteger(value.rating) && value.rating >= 0
    && Number.isSafeInteger(value.maxRating) && value.maxRating >= value.rating
    && Number.isSafeInteger(value.contestCount) && value.contestCount >= 0
    && Array.isArray(value.history) && value.history.length <= MAX_HISTORY
    && value.history.every(row => Number.isSafeInteger(row?.rating) && row.rating >= 0
      && Number.isSafeInteger(row?.time) && row.time > 0)
    && typeof value.updatedAt === 'string'
    && Number.isFinite(Date.parse(value.updatedAt))
    && Date.parse(value.updatedAt) <= now.getTime();
}

export function parseStats(infoPayload, ratingPayload, handle, now = new Date()) {
  if (infoPayload?.status !== 'OK' || ratingPayload?.status !== 'OK') throw new Error('Codeforces API returned an error');
  const user = infoPayload.result?.[0];
  if (!user || user.rating === undefined) throw new Error('No rated Codeforces user');
  const changes = Array.isArray(ratingPayload.result) ? ratingPayload.result : [];
  const stats = {
    handle: user.handle,
    rank: user.rank,
    rating: user.rating,
    maxRank: user.maxRank,
    maxRating: user.maxRating,
    contestCount: changes.length,
    history: changes.map(row => ({ rating: row.newRating, time: row.ratingUpdateTimeSeconds }))
      .sort((a, b) => a.time - b.time).slice(-MAX_HISTORY),
    updatedAt: now.toISOString(),
  };
  if (!validStats(stats, handle, now)) throw new Error('Invalid or incomplete Codeforces statistics');
  return stats;
}

async function jsonResponse(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function refreshStats({ handle, previous = null, siteUrl, fetcher = fetch, now = new Date(), warn = console.warn }) {
  try {
    const headers = { 'User-Agent': 'SohamPortfolio/1.0' };
    const query = encodeURIComponent(handle);
    const [info, rating] = await Promise.all([
      jsonResponse(fetcher, `https://codeforces.com/api/user.info?handles=${query}`, { headers }),
      jsonResponse(fetcher, `https://codeforces.com/api/user.rating?handle=${query}`, { headers }),
    ]);
    return { stats: parseStats(info, rating, handle, now), refreshed: true };
  } catch (error) {
    warn(`Codeforces refresh failed (${error.message}); preserving the last verified snapshot.`);
  }

  let saved = validStats(previous, handle, now) ? previous : null;
  if (siteUrl) {
    try {
      const base = new URL(siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`);
      if (base.protocol !== 'https:') throw new Error('Published site URL must use HTTPS');
      const url = new URL('codeforces-stats.json', base);
      url.searchParams.set('refresh', String(now.getTime()));
      const published = await jsonResponse(fetcher, url.href);
      if (validStats(published, handle, now)
        && (!saved || Date.parse(published.updatedAt) > Date.parse(saved.updatedAt))) saved = published;
    } catch (error) {
      warn(`Published snapshot unavailable (${error.message}); using the local snapshot if valid.`);
    }
  }
  return { stats: saved, refreshed: false };
}

async function main() {
  const content = JSON.parse(await readFile(new URL('../src/content.json', import.meta.url), 'utf8'));
  const profileUrl = new URL(content.profile.codeforces);
  const handle = /^\/profile\/([^/]+)\/?$/.exec(profileUrl.pathname)?.[1];
  if (profileUrl.hostname !== 'codeforces.com' || !handle) throw new Error('Invalid Codeforces profile URL');
  const file = new URL('../src/codeforces-stats.json', import.meta.url);
  let previous = null;
  try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* First run has no snapshot. */ }
  const result = await refreshStats({ handle, previous, siteUrl: process.env.PORTFOLIO_URL });
  await writeFile(file, JSON.stringify(result.stats, null, 2) + '\n');
  console.log(result.refreshed ? `Updated Codeforces statistics for ${handle}.`
    : result.stats ? `Using statistics verified ${result.stats.updatedAt}.` : 'No verified statistics; only the profile link will be shown.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
