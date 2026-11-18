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

// The Codeforces API asks clients to make at most one call every two seconds.
// Calls are made one at a time with a gap, and rate-limited or failed calls
// are retried with a longer wait.
const API = 'https://codeforces.com/api/';
const HEADERS = { 'User-Agent': 'SohamPortfolio/1.0 (+https://sohamb17.github.io)', Accept: 'application/json' };
export const CALL_GAP_MS = 2100;
const ATTEMPTS = 3;
const TIMEOUT_MS = 15000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class RefreshError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

// Turns a non-OK answer into a short, loggable reason. Codeforces sits behind
// Cloudflare, which answers some clients with an HTML challenge page instead
// of JSON; that case is named explicitly so the cause is obvious in the log.
export function describeFailure(status, contentType, text) {
  const challenge = /just a moment|cf-chl|challenge-platform|attention required/i.test(text);
  const type = (contentType || '').split(';')[0].trim();
  const snippet = challenge ? '' : text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `HTTP ${status}${type ? ` ${type}` : ''}${challenge ? ' (Cloudflare challenge page)' : ''}${snippet ? `: ${snippet}` : ''}`;
}

async function callApi(fetcher, sleep, method, params) {
  const url = `${API}${method}?${new URLSearchParams(params)}`;
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(CALL_GAP_MS * attempt);
    let response, text;
    try {
      response = await fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      text = await response.text();
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000} s` : error?.message || String(error);
      lastError = new RefreshError(`${method}: ${reason}`, true);
      continue;
    }
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON; described below */ }
    if (body?.status === 'OK') return body;
    const comment = typeof body?.comment === 'string' ? body.comment : '';
    const limited = response.status === 429 || /limit exceeded/i.test(comment);
    const retryable = limited || response.status >= 500;
    const reason = comment ? `HTTP ${response.status}: ${comment}` : describeFailure(response.status, response.headers?.get?.('content-type'), text);
    lastError = new RefreshError(`${method}: ${reason}`, retryable);
    if (!retryable) break;
  }
  throw lastError;
}

async function jsonResponse(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function refreshStats({ handle, previous = null, siteUrl, fetcher = fetch, now = new Date(), warn = console.warn, sleep = wait }) {
  let failure;
  try {
    const info = await callApi(fetcher, sleep, 'user.info', { handles: handle });
    await sleep(CALL_GAP_MS);
    const rating = await callApi(fetcher, sleep, 'user.rating', { handle });
    return { stats: parseStats(info, rating, handle, now), refreshed: true, error: null };
  } catch (error) {
    failure = error.message;
    warn(`Codeforces refresh failed (${failure}); preserving the last verified snapshot.`);
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
  return { stats: saved, refreshed: false, error: failure };
}

// Records the outcome of this run next to the statistics, so a failed refresh
// is visible in the published JSON without access to the workflow logs.
export function withLastCheck(result, now = new Date()) {
  if (!result.stats) return null;
  return { ...result.stats, lastCheck: { at: now.toISOString(), ok: result.refreshed, error: result.error ?? null } };
}

// Formats a GitHub Actions warning so it shows on the public run summary.
export function annotation(message) {
  const escaped = String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::warning title=Codeforces refresh failed::${escaped}`;
}

async function main() {
  const content = JSON.parse(await readFile(new URL('../src/content.json', import.meta.url), 'utf8'));
  const profileUrl = new URL(content.profile.codeforces);
  const handle = /^\/profile\/([^/]+)\/?$/.exec(profileUrl.pathname)?.[1];
  if (profileUrl.hostname !== 'codeforces.com' || !handle) throw new Error('Invalid Codeforces profile URL');
  const file = new URL('../src/codeforces-stats.json', import.meta.url);
  let previous = null;
  try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* First run has no snapshot. */ }
  const now = new Date();
  const result = await refreshStats({ handle, previous, siteUrl: process.env.PORTFOLIO_URL, now });
  await writeFile(file, JSON.stringify(withLastCheck(result, now), null, 2) + '\n');
  if (!result.refreshed && process.env.GITHUB_ACTIONS === 'true') console.log(annotation(result.error));
  console.log(result.refreshed ? `Updated Codeforces statistics for ${handle}.`
    : result.stats ? `Using statistics verified ${result.stats.updatedAt}.` : 'No verified statistics; only the profile link will be shown.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
