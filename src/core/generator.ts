/**
 * Deterministic draft generator. Turns one verified commit into a 5W1H frame
 * and per-channel drafts. No LLM: every word traces back to the commit, which
 * is the product's core promise (no invented claims). An LLM rewrite lane can
 * be added later behind the same firewall.
 */
import { CHANNEL_LIMITS, type Channel } from './plans.ts';
import type { FiveW1H } from './policy.ts';

export interface VerifiedCommit {
  repository: string; // owner/name
  sha: string; // 40 chars
  url: string; // html_url from provider
  message: string;
  author: string;
  date: string; // ISO
}

type Kind = 'feat' | 'fix' | 'perf' | 'refactor' | 'docs' | 'test' | 'security' | 'chore' | 'other';

const WHY: Record<Kind, string> = {
  feat: 'it gives users something they could not do before',
  fix: 'it removes a problem users could hit',
  perf: 'it makes the product faster',
  refactor: 'it makes the next change cheaper and safer',
  docs: 'it makes the project easier to understand and adopt',
  test: 'it locks in behavior so it does not silently regress',
  security: 'it closes a risk before it becomes an incident',
  chore: 'it keeps the project healthy',
  other: 'it moves the product forward',
};

const VERB: Record<Kind, string> = {
  feat: 'Shipped',
  fix: 'Fixed',
  perf: 'Sped up',
  refactor: 'Reworked',
  docs: 'Documented',
  test: 'Locked in',
  security: 'Hardened',
  chore: 'Maintained',
  other: 'Shipped',
};

export interface ParsedCommit {
  kind: Kind;
  scope: string | null;
  subject: string;
  body: string;
}

export function parseCommitMessage(message: string): ParsedCommit {
  const [first = '', ...rest] = (message ?? '').split('\n');
  const body = rest.join('\n').trim();
  const m = first.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  let kind: Kind = 'other';
  let scope: string | null = null;
  let subject = first.trim();
  if (m) {
    const t = m[1]!.toLowerCase();
    scope = m[2] ?? null;
    subject = m[4]!.trim();
    if (t === 'feat' || t === 'feature') kind = 'feat';
    else if (t === 'fix' || t === 'bugfix' || t === 'hotfix') kind = 'fix';
    else if (t === 'perf') kind = 'perf';
    else if (t === 'refactor') kind = 'refactor';
    else if (t === 'docs') kind = 'docs';
    else if (t === 'test' || t === 'tests') kind = 'test';
    else if (t === 'security' || t === 'sec') kind = 'security';
    else if (['chore', 'build', 'ci', 'style', 'deps'].includes(t)) kind = 'chore';
  }
  if (/\bsecurity\b|\bcve-\d/i.test(first) && kind === 'other') kind = 'security';
  return { kind, scope, subject, body };
}

/** 0–100. Low scores are noise (merges, dependency bumps) and are hidden by default. */
export function signalScore(message: string): number {
  const first = (message ?? '').split('\n')[0] ?? '';
  if (/^merge (pull request|branch)/i.test(first)) return 5;
  if (/^(chore|build)\(deps/i.test(first) || /\bbump\b.+\bfrom\b.+\bto\b/i.test(first)) return 10;
  const p = parseCommitMessage(message);
  const base: Record<Kind, number> = {
    feat: 85, fix: 70, perf: 75, security: 80, refactor: 45, docs: 40, test: 40, chore: 20, other: 50,
  };
  let s = base[p.kind];
  if (p.subject.length < 12) s -= 15;
  if (p.body.length > 40) s += 5;
  return Math.max(0, Math.min(100, s));
}

function repoName(repository: string): string {
  return repository.split('/')[1] ?? repository;
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function buildFiveW1H(c: VerifiedCommit): FiveW1H {
  const p = parseCommitMessage(c.message);
  return {
    who: c.author || 'the maintainer',
    what: capitalize(p.subject),
    where: p.scope ? `${c.repository} (${p.scope})` : c.repository,
    when: c.date,
    why: WHY[p.kind],
    how: `commit ${c.sha.slice(0, 7)}`,
  };
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

export function draftFor(channel: Channel, c: VerifiedCommit, f: FiveW1H): string {
  const p = parseCommitMessage(c.message);
  const verb = VERB[p.kind];
  const name = repoName(c.repository);
  const what = f.what.replace(/\.$/, '');
  const max = CHANNEL_LIMITS[channel];

  if (channel === 'linkedin') {
    const lines = [
      `${verb} in ${name}: ${what}.`,
      '',
      `Why it matters: ${f.why}.`,
      p.body ? `\nWhat changed:\n${clamp(p.body, 600)}` : '',
      '',
      `Proof (the actual commit): ${c.url}`,
      '',
      '#buildinpublic',
    ].filter((l, i, a) => !(l === '' && a[i - 1] === ''));
    return clamp(lines.join('\n').trim(), max);
  }

  // Short-form channels: keep the proof URL intact, trim the claim instead.
  const tail = `\n\nProof: ${c.url}`;
  const tag = channel === 'x' || channel === 'bluesky' ? '' : '\n#buildinpublic';
  const headRoom = max - tail.length - tag.length;
  const head = clamp(`${verb} in ${name}: ${what}. ${capitalize(f.why)}.`, Math.max(40, headRoom));
  return `${head}${tail}${tag}`;
}
