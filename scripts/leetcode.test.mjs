import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStats, refreshStats, validStats } from './leetcode.mjs';

const now = new Date('2026-09-20T12:00:00Z');
const username = 'example';
const previous = { username, solved: 10, topPercentage: 8, updatedAt: '2026-09-18T12:00:00Z' };
const payload = { data: {
  matchedUser: { username, submitStatsGlobal: { acSubmissionNum: [{ difficulty: 'Easy', count: 8 }, { difficulty: 'All', count: 12 }] } },
  userContestRanking: { topPercentage: 6.09 },
} };
const response = value => ({ ok: true, json: async () => value });
const base = { username, previous, now, warn: () => {} };

test('uses total solved and LeetCode percentile directly', async () => {
  const result = await refreshStats({ ...base, fetcher: async (url, options) => {
    assert.equal(url, 'https://leetcode.com/graphql/');
    assert.equal(JSON.parse(options.body).variables.username, username);
    return response(payload);
  } });
  assert.equal(result.refreshed, true);
  assert.equal(result.stats.solved, 12);
  assert.equal(result.stats.topPercentage, 6.09);
  assert.equal(result.stats.updatedAt, now.toISOString());
});

test('blocked request restores newer published snapshot at repository subpath', async () => {
  const published = { ...previous, solved: 11, updatedAt: '2026-09-19T12:00:00Z' };
  const result = await refreshStats({ ...base, siteUrl: 'https://example.github.io/portfolio', fetcher: async url => {
    if (url.includes('leetcode.com')) return { ok: false, status: 403 };
    assert.equal(new URL(url).pathname, '/portfolio/leetcode-stats.json');
    return response(published);
  } });
  assert.equal(result.refreshed, false);
  assert.deepEqual(result.stats, published);
});

test('outage preserves local timestamp; first-run outage hides statistics', async () => {
  const fetcher = async () => { throw new Error('Network unavailable'); };
  assert.deepEqual((await refreshStats({ ...base, siteUrl: 'https://example.org', fetcher })).stats, previous);
  assert.equal((await refreshStats({ ...base, previous: null, fetcher })).stats, null);
});

test('invalid responses cannot replace valid data', async () => {
  for (const value of [{ errors: [{ message: 'Rate limited' }] }, { data: { matchedUser: null } }, '<html>Blocked</html>']) {
    assert.deepEqual((await refreshStats({ ...base, fetcher: async () => response(value) })).stats, previous);
  }
  for (const patch of [{ username: 'someone-else' }, { solved: -1 }, { solved: '12' }, { topPercentage: 101 }, { updatedAt: 'bad' }, { updatedAt: '2099-01-01' }]) {
    assert.equal(validStats({ ...previous, ...patch }, username, now), false);
  }
});

test('unranked user retains solved count without invented percentile', () => {
  assert.equal(parseStats({ data: { ...payload.data, userContestRanking: null } }, username, now).topPercentage, null);
});

test('shows the reported contest badge and switches from Knight to Guardian', () => {
  for (const name of ['Knight', 'Guardian']) {
    const icon = `/static/images/badges/${name.toLowerCase()}.png`;
    const data = { ...payload.data,
      matchedUser: { ...payload.data.matchedUser, badges: [{ name, icon }] },
      userContestRanking: { topPercentage: 6.09, badge: { name } },
    };
    assert.deepEqual(parseStats({ data }, username, now).badge, { name, icon: `https://leetcode.com${icon}` });
    assert.equal(parseStats({ data: { ...data, userContestRanking: { topPercentage: 6.09, badge: null } } }, username, now).badge, null);
  }
});

test('never infers a badge from percentile, and rejects unofficial badge images', () => {
  assert.equal(parseStats(payload, username, now).badge, null);
  const data = { ...payload.data,
    matchedUser: { ...payload.data.matchedUser, badges: [{ name: 'Knight', icon: 'https://example.org/badge.png' }] },
    userContestRanking: { topPercentage: 6.09, badge: { name: 'Knight' } },
  };
  assert.deepEqual(parseStats({ data }, username, now).badge, { name: 'Knight', icon: null });
  assert.equal(validStats({ ...previous, badge: { name: 'Guardian', icon: 'javascript:alert(1)' } }, username, now), false);
});

test('outage preserves a previously verified badge', async () => {
  const saved = { ...previous, badge: { name: 'Knight', icon: 'https://leetcode.com/static/images/badges/knight.png' } };
  const result = await refreshStats({ ...base, previous: saved, fetcher: async () => { throw new Error('Offline'); } });
  assert.deepEqual(result.stats, saved);
});

test('rejects wrong-user published data and keeps newer local snapshot', async () => {
  for (const published of [{ ...previous, username: 'other' }, { ...previous, updatedAt: '2026-09-17T12:00:00Z' }]) {
    const result = await refreshStats({ ...base, siteUrl: 'https://example.org', fetcher: async url => {
      if (url.includes('leetcode.com')) throw new Error('Timeout');
      return response(published);
    } });
    assert.deepEqual(result.stats, previous);
  }
});

test('keeps exact ratings and only the latest three attended contests', () => {
  const data = { ...payload.data,
    userContestRanking: { topPercentage: 6.09, rating: 1859.098, attendedContestsCount: 28 },
    userContestRankingHistory: [1, 4, 2, 3, 5].map(n => ({
      attended: n !== 5, rating: 1800 + n / 1000, contest: { title: 'Contest ' + n, startTime: 1700000000 + n },
    })),
  };
  const stats = parseStats({ data }, username, now);
  assert.equal(stats.rating, 1859.098);
  assert.equal(stats.contestCount, 28);
  assert.deepEqual(stats.history.map(row => row.title), ['Contest 4', 'Contest 3', 'Contest 2']);
  assert.equal(stats.history[0].rating, 1800.004);
  assert.equal(validStats({ ...stats, rating: -1 }, username, now), false);
  assert.equal(validStats({ ...stats, contestCount: 2.5 }, username, now), false);
});
