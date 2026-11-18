import test from 'node:test';
import assert from 'node:assert/strict';
import { CALL_GAP_MS, annotation, describeFailure, parseStats, refreshStats, validStats, withLastCheck } from './codeforces.mjs';

const now = new Date('2026-10-10T12:00:00Z');
const handle = 'example';
const history = [{ rating: 1400, time: 1660000000 }, { rating: 1464, time: 1670000000 }, { rating: 1446, time: 1680000000 }];
const previous = { handle, rank: 'specialist', rating: 1446, maxRank: 'specialist', maxRating: 1464, contestCount: 3, history, updatedAt: '2026-10-08T12:00:00Z' };
const info = { status: 'OK', result: [{ handle, rank: 'specialist', rating: 1450, maxRank: 'specialist', maxRating: 1464 }] };
const rating = { status: 'OK', result: [
  { newRating: 1464, ratingUpdateTimeSeconds: 1670000000 },
  { newRating: 1400, ratingUpdateTimeSeconds: 1660000000 },
  { newRating: 1450, ratingUpdateTimeSeconds: 1690000000 },
] };

// A fetch Response stand-in: status, content type and body text.
const reply = (body, { status = 200, type = 'application/json;charset=UTF-8' } = {}) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, headers: { get: () => type }, text: async () => text, json: async () => JSON.parse(text) };
};
const response = value => reply(value);
const noSleep = async () => {};
const base = { handle, previous, now, warn: () => {}, sleep: noSleep };
const api = (infoValue = info, ratingValue = rating) => async url => {
  if (url.includes('/api/user.info')) { assert.match(url, /handles=example$/); return response(infoValue); }
  if (url.includes('/api/user.rating')) { assert.match(url, /handle=example$/); return response(ratingValue); }
  throw new Error(`Unexpected URL ${url}`);
};
const cloudflarePage = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget"></div></body></html>';

test('reads rank, rating, peak and sorted history from the public API', async () => {
  const result = await refreshStats({ ...base, fetcher: api() });
  assert.equal(result.refreshed, true);
  assert.equal(result.error, null);
  assert.equal(result.stats.rank, 'specialist');
  assert.equal(result.stats.rating, 1450);
  assert.equal(result.stats.maxRating, 1464);
  assert.equal(result.stats.contestCount, 3);
  assert.deepEqual(result.stats.history.map(row => row.time), [1660000000, 1670000000, 1690000000]);
  assert.equal(result.stats.updatedAt, now.toISOString());
});

test('calls the API one at a time, at least two seconds apart', async () => {
  const events = [];
  let inFlight = 0;
  const fetcher = async url => {
    inFlight++;
    assert.equal(inFlight, 1, 'two API calls overlapped');
    events.push(url.includes('user.info') ? 'info' : 'rating');
    await new Promise(resolve => setImmediate(resolve));
    inFlight--;
    return response(url.includes('user.info') ? info : rating);
  };
  const sleep = async ms => { events.push(`sleep ${ms}`); };
  const result = await refreshStats({ ...base, fetcher, sleep });
  assert.equal(result.refreshed, true);
  assert.deepEqual(events, ['info', `sleep ${CALL_GAP_MS}`, 'rating']);
  assert.ok(CALL_GAP_MS >= 2000);
});

test('retries a rate-limited call and then succeeds', async () => {
  let ratingCalls = 0;
  const sleeps = [];
  const fetcher = async url => {
    if (url.includes('user.info')) return response(info);
    ratingCalls++;
    return ratingCalls === 1
      ? reply({ status: 'FAILED', comment: 'Call limit exceeded' }, { status: 503 })
      : response(rating);
  };
  const result = await refreshStats({ ...base, fetcher, sleep: async ms => { sleeps.push(ms); } });
  assert.equal(result.refreshed, true);
  assert.equal(ratingCalls, 2);
  assert.ok(sleeps.some(ms => ms > CALL_GAP_MS), 'retry should wait longer than the normal gap');
});

test('gives up after three attempts on a server error and keeps the snapshot', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return reply('upstream error', { status: 502, type: 'text/plain' }); };
  const result = await refreshStats({ ...base, fetcher });
  assert.equal(calls, 3);
  assert.equal(result.refreshed, false);
  assert.deepEqual(result.stats, previous);
  assert.match(result.error, /user\.info: HTTP 502/);
});

test('a Cloudflare challenge is reported by name and not retried', async () => {
  let calls = 0;
  const warnings = [];
  const fetcher = async () => { calls++; return reply(cloudflarePage, { status: 403, type: 'text/html; charset=UTF-8' }); };
  const result = await refreshStats({ ...base, fetcher, warn: message => warnings.push(message) });
  assert.equal(calls, 1);
  assert.equal(result.refreshed, false);
  assert.equal(result.error, 'user.info: HTTP 403 text/html (Cloudflare challenge page)');
  assert.match(warnings[0], /Cloudflare challenge page/);
});

test('blocked API restores newer published snapshot at repository subpath', async () => {
  const published = { ...previous, rating: 1455, updatedAt: '2026-10-09T12:00:00Z' };
  const result = await refreshStats({ ...base, siteUrl: 'https://example.github.io/portfolio', fetcher: async url => {
    if (url.includes('codeforces.com')) return reply(cloudflarePage, { status: 403, type: 'text/html' });
    assert.equal(new URL(url).pathname, '/portfolio/codeforces-stats.json');
    return response(published);
  } });
  assert.equal(result.refreshed, false);
  assert.deepEqual(result.stats, published);
});

test('outage preserves local snapshot; first-run outage hides statistics', async () => {
  const fetcher = async () => { throw new Error('Network unavailable'); };
  const kept = await refreshStats({ ...base, siteUrl: 'https://example.org', fetcher });
  assert.deepEqual(kept.stats, previous);
  assert.match(kept.error, /Network unavailable/);
  assert.equal((await refreshStats({ ...base, previous: null, fetcher })).stats, null);
});

test('API errors, unrated users and malformed data cannot replace valid data', async () => {
  const cases = [
    [{ status: 'FAILED', comment: 'handles: User not found' }, rating],
    [info, { status: 'FAILED' }],
    [{ status: 'OK', result: [{ handle, rank: undefined }] }, rating],
    ['<html>Blocked</html>', rating],
  ];
  for (const [infoValue, ratingValue] of cases) {
    assert.deepEqual((await refreshStats({ ...base, fetcher: api(infoValue, ratingValue) })).stats, previous);
  }
  for (const patch of [{ handle: 'someone-else' }, { rank: 'wizard' }, { rating: -1 }, { rating: 1500.5 }, { maxRating: 1000 },
    { contestCount: '3' }, { history: [{ rating: 'x', time: 1 }] }, { updatedAt: 'bad' }, { updatedAt: '2099-01-01' }]) {
    assert.equal(validStats({ ...previous, ...patch }, handle, now), false);
  }
});

test('handle comparison is case-insensitive, matching Codeforces', () => {
  assert.equal(validStats({ ...previous, handle: 'Example' }, handle, now), true);
  assert.equal(parseStats(info, rating, 'EXAMPLE', now).handle, handle);
});

test('the published file records whether the last refresh worked', () => {
  const checkedAt = new Date('2026-11-17T12:00:00Z');
  const failed = withLastCheck({ stats: previous, refreshed: false, error: 'user.info: HTTP 403' }, checkedAt);
  assert.deepEqual(failed.lastCheck, { at: '2026-11-17T12:00:00.000Z', ok: false, error: 'user.info: HTTP 403' });
  assert.equal(failed.updatedAt, previous.updatedAt, 'a failed check must not move the verified date');
  assert.equal(validStats(failed, handle, checkedAt), true, 'the extra field must not invalidate the snapshot');
  assert.equal(withLastCheck({ stats: previous, refreshed: true, error: null }, checkedAt).lastCheck.ok, true);
  assert.equal(withLastCheck({ stats: null, refreshed: false, error: 'x' }, checkedAt), null);
});

test('failure messages are short and safe for a GitHub Actions annotation', () => {
  assert.equal(describeFailure(403, 'text/html; charset=UTF-8', cloudflarePage), 'HTTP 403 text/html (Cloudflare challenge page)');
  assert.equal(describeFailure(500, 'text/plain', 'x'.repeat(500)).length <= 'HTTP 500 text/plain: '.length + 120, true);
  assert.equal(annotation('a%b\nc'), '::warning title=Codeforces refresh failed::a%25b%0Ac');
});
