import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const query = `query PortfolioStats($username: String!) {
  matchedUser(username: $username) {
    username
    badges { name icon }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
  userContestRanking(username: $username) { topPercentage rating attendedContestsCount badge { name } }
  userContestRankingHistory(username: $username) { attended rating contest { title startTime } }
}`;

function officialBadgeIcon(icon) {
  if (typeof icon !== 'string' || !icon) return null;
  try {
    const url = new URL(icon, 'https://leetcode.com');
    return url.protocol === 'https:' && url.hostname === 'leetcode.com'
      && !url.username && !url.password && !url.port
      && url.pathname.startsWith('/static/images/badges/') ? url.href : null;
  } catch { return null; }
}

function validBadge(badge) {
  return badge == null || (['Knight', 'Guardian'].includes(badge.name)
    && (badge.icon === null || officialBadgeIcon(badge.icon) === badge.icon));
}

export function validStats(value, username, now = new Date()) {
  return value?.username === username
    && validBadge(value.badge)
    && (value.rating == null || (Number.isFinite(value.rating) && value.rating >= 0))
    && (value.contestCount == null || (Number.isSafeInteger(value.contestCount) && value.contestCount >= 0))
    && (value.history == null || (Array.isArray(value.history) && value.history.every(row =>
      Number.isFinite(row.rating) && row.rating >= 0 && typeof row.title === 'string'
      && Number.isFinite(row.startTime) && row.startTime > 0)))
    && Number.isSafeInteger(value.solved) && value.solved >= 0
    && (value.topPercentage === null || (typeof value.topPercentage === 'number'
      && Number.isFinite(value.topPercentage) && value.topPercentage >= 0 && value.topPercentage <= 100))
    && typeof value.updatedAt === 'string'
    && Number.isFinite(Date.parse(value.updatedAt))
    && Date.parse(value.updatedAt) <= now.getTime();
}

export function parseStats(payload, username, now = new Date()) {
  if (payload.errors?.length) throw new Error('LeetCode returned GraphQL errors');
  const user = payload.data?.matchedUser;
  const contest = payload.data?.userContestRanking;
  if (contest === undefined) throw new Error('Missing contest data');
  const badgeName = contest?.badge?.name;
  const badge = ['Knight', 'Guardian'].includes(badgeName) ? {
    name: badgeName,
    icon: officialBadgeIcon(user?.badges?.find(item => item.name === badgeName)?.icon),
  } : null;
  const stats = {
    username: user?.username,
    solved: user?.submitStatsGlobal?.acSubmissionNum?.find(row => row.difficulty === 'All')?.count,
    topPercentage: contest === null ? null : contest.topPercentage,
    badge,
    rating: contest?.rating ?? null,
    contestCount: contest?.attendedContestsCount ?? null,
    history: (payload.data?.userContestRankingHistory ?? []).filter(row => row.attended)
      .map(row => ({ rating: row.rating, title: row.contest?.title, startTime: row.contest?.startTime }))
      .sort((a, b) => b.startTime - a.startTime).slice(0, 3),
    updatedAt: now.toISOString(),
  };
  if (!validStats(stats, username, now)) throw new Error('Invalid or incomplete LeetCode statistics');
  return stats;
}

async function jsonResponse(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function refreshStats({ username, previous = null, siteUrl, fetcher = fetch, now = new Date(), warn = console.warn }) {
  try {
    const payload = await jsonResponse(fetcher, 'https://leetcode.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'SohamPortfolio/1.0', Referer: 'https://leetcode.com/' },
      body: JSON.stringify({ query, variables: { username } }),
    });
    return { stats: parseStats(payload, username, now), refreshed: true };
  } catch (error) {
    warn(`LeetCode refresh failed (${error.message}); preserving the last verified snapshot.`);
  }

  let saved = validStats(previous, username, now) ? previous : null;
  if (siteUrl) {
    try {
      const base = new URL(siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`);
      if (base.protocol !== 'https:') throw new Error('Published site URL must use HTTPS');
      const url = new URL('leetcode-stats.json', base);
      url.searchParams.set('refresh', String(now.getTime()));
      const published = await jsonResponse(fetcher, url.href);
      if (validStats(published, username, now)
        && (!saved || Date.parse(published.updatedAt) > Date.parse(saved.updatedAt))) saved = published;
    } catch (error) {
      warn(`Published snapshot unavailable (${error.message}); using the local snapshot if valid.`);
    }
  }
  return { stats: saved, refreshed: false };
}

async function main() {
  const content = JSON.parse(await readFile(new URL('../src/content.json', import.meta.url), 'utf8'));
  const profileUrl = new URL(content.profile.leetcode);
  const username = /^\/u\/([^/]+)\/?$/.exec(profileUrl.pathname)?.[1];
  if (profileUrl.hostname !== 'leetcode.com' || !username) throw new Error('Invalid LeetCode profile URL');
  const file = new URL('../src/leetcode-stats.json', import.meta.url);
  let previous = null;
  try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* First run has no snapshot. */ }
  const result = await refreshStats({ username, previous, siteUrl: process.env.PORTFOLIO_URL });
  await writeFile(file, JSON.stringify(result.stats, null, 2) + '\n');
  console.log(result.refreshed ? `Updated LeetCode statistics for ${username}.`
    : result.stats ? `Using statistics verified ${result.stats.updatedAt}.` : 'No verified statistics; only the profile link will be shown.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
