import type { Env } from './env.ts';
import type { VerifiedCommit } from '../core/generator.ts';

export const REPO_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/i;

export class GitHubError extends Error {
  code: 'not_found' | 'private' | 'rate_limited' | 'upstream';
  constructor(code: GitHubError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function base(env: Env): string {
  return (env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
}

async function gh(env: Env, path: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'signal-loop',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(`${base(env)}${path}`, { headers });
  if (res.status === 404) throw new GitHubError('not_found', 'Repository or commit not found');
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError('rate_limited', 'GitHub rate limit reached, try again later');
  }
  if (!res.ok) throw new GitHubError('upstream', `GitHub returned ${res.status}`);
  return res.json();
}

export async function getPublicRepo(env: Env, fullName: string): Promise<{ fullName: string }> {
  if (!REPO_NAME.test(fullName)) throw new GitHubError('not_found', 'Invalid repository name');
  const data = await gh(env, `/repos/${fullName}`);
  if (data.private) throw new GitHubError('private', 'Private repositories are not supported yet');
  return { fullName: String(data.full_name) };
}

function toCommit(fullName: string, c: any): VerifiedCommit {
  return {
    repository: fullName,
    sha: String(c.sha),
    url: String(c.html_url),
    message: String(c.commit?.message ?? ''),
    author: String(c.author?.login ?? c.commit?.author?.name ?? ''),
    date: String(c.commit?.author?.date ?? c.commit?.committer?.date ?? ''),
  };
}

export async function listCommits(env: Env, fullName: string): Promise<VerifiedCommit[]> {
  if (!REPO_NAME.test(fullName)) throw new GitHubError('not_found', 'Invalid repository name');
  const data = await gh(env, `/repos/${fullName}/commits?per_page=20`);
  return (Array.isArray(data) ? data : []).map((c) => toCommit(fullName, c));
}

/** Re-reads the exact commit server-side. This is what makes an evidence receipt "verified". */
export async function getCommit(env: Env, fullName: string, sha: string): Promise<VerifiedCommit> {
  if (!REPO_NAME.test(fullName) || !SHA.test(sha)) throw new GitHubError('not_found', 'Invalid commit');
  const c = toCommit(fullName, await gh(env, `/repos/${fullName}/commits/${sha}`));
  if (c.sha.toLowerCase() !== sha.toLowerCase()) throw new GitHubError('upstream', 'Commit mismatch');
  return c;
}
