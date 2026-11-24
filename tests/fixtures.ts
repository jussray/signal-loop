/** Shared GitHub API fixtures for unit, integration, and e2e tests. */
const sha = (c: string) => c.repeat(40);

export const FIXTURE_COMMITS = [
  { sha: sha('a'), message: 'feat(auth): add magic-link login\n\nUsers can sign in with a one-time email link instead of a password.' },
  { sha: sha('b'), message: 'fix: stop duplicate invoices on retry' },
  { sha: sha('c'), message: 'Merge pull request #12 from acme/feature-x' },
  { sha: sha('d'), message: 'chore(deps): bump undici from 6.1.0 to 6.2.0' },
  { sha: sha('e'), message: 'feat: production-ready billing dashboard' },
  { sha: sha('f'), message: 'fix: rotate leaked key ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab' },
];

export function ghCommit(owner: string, repo: string, c: { sha: string; message: string }) {
  return {
    sha: c.sha,
    html_url: `https://github.com/${owner}/${repo}/commit/${c.sha}`,
    author: { login: 'jussray' },
    commit: { message: c.message, author: { name: 'Juss', date: '2026-10-05T18:00:00Z' } },
  };
}

/** Pure router: (path) -> [status, body]. */
export function githubFixture(path: string): [number, unknown] {
  const u = new URL(path, 'http://x');
  const parts = u.pathname.split('/').filter(Boolean); // repos, owner, repo, commits?, sha?
  if (parts[0] !== 'repos' || parts.length < 3) return [404, { message: 'Not Found' }];
  const [, owner, repo] = parts as [string, string, string];
  const full = `${owner}/${repo}`;
  if (full === 'acme/private-thing') {
    return parts.length === 3 ? [200, { full_name: full, private: true }] : [404, {}];
  }
  if (full.toLowerCase() !== 'acme/rocket' && full.toLowerCase() !== 'acme/second') return [404, { message: 'Not Found' }];
  const canonical = full.toLowerCase() === 'acme/rocket' ? 'acme/rocket' : 'acme/second';
  if (parts.length === 3) return [200, { full_name: canonical, private: false }];
  if (parts[3] === 'commits' && parts.length === 4) {
    return [200, FIXTURE_COMMITS.map((c) => ghCommit('acme', canonical.split('/')[1]!, c))];
  }
  if (parts[3] === 'commits' && parts.length === 5) {
    const c = FIXTURE_COMMITS.find((x) => x.sha === parts[4]);
    return c ? [200, ghCommit('acme', canonical.split('/')[1]!, c)] : [404, {}];
  }
  return [404, {}];
}
