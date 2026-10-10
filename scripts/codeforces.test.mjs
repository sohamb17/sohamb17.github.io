import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStats, refreshStats, validStats } from './codeforces.mjs';

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
const response = value => ({ ok: true, json: async () => value });
const base = { handle, previous, now, warn: () => {} };
const api = (infoValue = info, ratingValue = rating) => async url => {
  if (url.includes('/api/user.info')) { assert.match(url, /handles=example$/); return response(infoValue); }
  if (url.includes('/api/user.rating')) { assert.match(url, /handle=example$/); return response(ratingValue); }
  throw new Error(`Unexpected URL ${url}`);
};

test('reads rank, rating, peak and sorted history from the public API', async () => {
  const result = await refreshStats({ ...base, fetcher: api() });
  assert.equal(result.refreshed, true);
  assert.equal(result.stats.rank, 'specialist');
  assert.equal(result.stats.rating, 1450);
  assert.equal(result.stats.maxRating, 1464);
  assert.equal(result.stats.contestCount, 3);
  assert.deepEqual(result.stats.history.map(row => row.time), [1660000000, 1670000000, 1690000000]);
  assert.equal(result.stats.updatedAt, now.toISOString());
});

test('blocked API restores newer published snapshot at repository subpath', async () => {
  const published = { ...previous, rating: 1455, updatedAt: '2026-10-09T12:00:00Z' };
  const result = await refreshStats({ ...base, siteUrl: 'https://example.github.io/portfolio', fetcher: async url => {
    if (url.includes('codeforces.com')) return { ok: false, status: 403 };
    assert.equal(new URL(url).pathname, '/portfolio/codeforces-stats.json');
    return response(published);
  } });
  assert.equal(result.refreshed, false);
  assert.deepEqual(result.stats, published);
});

test('outage preserves local snapshot; first-run outage hides statistics', async () => {
  const fetcher = async () => { throw new Error('Network unavailable'); };
  assert.deepEqual((await refreshStats({ ...base, siteUrl: 'https://example.org', fetcher })).stats, previous);
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
