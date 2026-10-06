/**
 * Signal policy — decides whether a drafted signal may ship, needs human review,
 * or is blocked.
 *
 * Provenance: ported from jussray/founder-control-room
 * src/lib/founderSignalAutomationPolicy.ts @ 8283095 (evaluateFounderSignalAutomation).
 * Kept: evidence binding (repo + exact 40-char SHA + proof URL must match a
 * server-verified receipt), mandatory 5W1H, grant route scoping, hard-block set.
 * Changed for multi-tenant SaaS:
 *   - repository scope = the repos this account connected (not a single owner);
 *   - a missing/disabled autopilot grant downgrades to `review` instead of `blocked`
 *     (every free user starts with human review, which is the safe default);
 *   - investor-email lane removed (not a public product surface);
 *   - firewall violations are hard blocks.
 */
import type { Channel } from './plans.ts';

export type SignalDecision = 'ready' | 'review' | 'blocked';

export interface EvidenceReceipt {
  /** true only when the commit was read server-side from the provider API. */
  verified: boolean;
  provider: 'github';
  repository: string;
  sourceCommitSha: string;
  proofUrl: string;
}

export interface FiveW1H {
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  how: string;
}

export interface SignalCandidate {
  repository: string;
  channel: Channel;
  proofUrl: string | null;
  sourceCommitSha: string | null;
  evidenceReceipt: EvidenceReceipt | null;
  fiveW1h: Partial<FiveW1H>;
}

export interface AutopilotGrant {
  enabled: boolean;
  channels: Channel[];
  expiresAt: string | null;
}

export interface PolicyContext {
  connectedRepositories: string[];
  grant: AutopilotGrant | null;
  firewallViolations: string[];
}

export interface PolicyResult {
  decision: SignalDecision;
  reasons: string[];
}

const COMMIT_SHA = /^[0-9a-f]{40}$/i;

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function evidenceIsBound(c: SignalCandidate): boolean {
  const r = c.evidenceReceipt;
  if (!r?.verified) return false;
  if (!hasText(c.proofUrl) || !hasText(r.proofUrl)) return false;
  if (!c.sourceCommitSha || !COMMIT_SHA.test(c.sourceCommitSha)) return false;
  return (
    r.repository.toLowerCase() === c.repository.toLowerCase() &&
    r.sourceCommitSha.toLowerCase() === c.sourceCommitSha.toLowerCase() &&
    r.proofUrl === c.proofUrl
  );
}

function grantIsLive(grant: AutopilotGrant | null, channel: Channel, now: Date): boolean {
  if (!grant?.enabled) return false;
  if (grant.expiresAt) {
    const t = Date.parse(grant.expiresAt);
    if (!Number.isFinite(t) || t <= now.getTime()) return false;
  }
  return grant.channels.includes(channel);
}

export function evaluateSignal(
  candidate: SignalCandidate,
  ctx: PolicyContext,
  now = new Date(),
): PolicyResult {
  const hard: string[] = [];

  const connected = ctx.connectedRepositories.map((r) => r.toLowerCase());
  if (!connected.includes(candidate.repository.toLowerCase())) {
    hard.push('repository is not connected to this account');
  }
  if (!hasText(candidate.proofUrl)) hard.push('proof URL is required');
  if (!candidate.sourceCommitSha || !COMMIT_SHA.test(candidate.sourceCommitSha)) {
    hard.push('an exact 40-character source commit SHA is required');
  }
  if (!evidenceIsBound(candidate)) {
    hard.push('verified evidence receipt must match repository, commit, and proof URL');
  }
  for (const field of ['who', 'what', 'where', 'when', 'why', 'how'] as const) {
    if (!hasText(candidate.fiveW1h[field])) hard.push(`${field} is required`);
  }
  for (const v of ctx.firewallViolations) hard.push(`firewall: ${v}`);

  if (hard.length > 0) return { decision: 'blocked', reasons: hard };

  if (!grantIsLive(ctx.grant, candidate.channel, now)) {
    return { decision: 'review', reasons: ['human review required (no live autopilot grant for this channel)'] };
  }
  return { decision: 'ready', reasons: [] };
}
