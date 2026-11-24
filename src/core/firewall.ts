/**
 * Truth firewall — runs on every draft (generated or user-edited) before it can
 * be approved.
 *
 * Provenance: prompt-leak patterns ported from jussray/founder-control-room
 * tools/zapier/buffer-content-firewall.cjs @ 8283095; neverClaim / neverExpose
 * semantics ported from config/social-campaign-repositories.json. Secret
 * patterns and default overclaim list are new for the standalone product.
 */
import { CHANNEL_LIMITS, type Channel } from './plans.ts';

export interface RepoTruthRules {
  neverClaim: string[];
  neverExpose: string[];
}

const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /\byou are writing for\b/i,
  /\byou are the (analysis|content|social|copy) worker\b/i,
  /\breturn (exactly )?(one )?(valid )?json\b/i,
  /\breturn this structure\b/i,
  /\bbefore writing anything\b/i,
  /\bsystem instruction\s*:/i,
  /\buser message\s*:/i,
  /\{\{[^}]+\}\}/,
];

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style key', /\bsk-(proj-)?[A-Za-z0-9]{20,}/],
  ['Stripe secret key', /\b(sk|rk)_live_[A-Za-z0-9]{16,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['inline password', /\b(password|passwd|secret|api[_-]?key)\s*[=:]\s*\S{6,}/i],
];

/** Classify source text before redacting and discarding it. */
export function sourceSensitiveViolations(input: string): string[] {
  const issues: string[] = [];
  for (const [label, pattern] of SECRET_PATTERNS) if (pattern.test(input)) issues.push(`possible secret detected (${label})`);
  if (PROMPT_LEAK_PATTERNS.some(pattern => pattern.test(input))) issues.push('looks like leaked prompt/instructions text');
  return [...new Set(issues)];
}

/** Remove source credentials and repo-specific private phrases before display or storage. */
export function redactSensitive(input: string, neverExpose: string[] = []): string {
  let redacted = input;
  for (const [, pattern] of SECRET_PATTERNS) {
    redacted = redacted.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'), '[redacted]');
  }
  for (const pattern of PROMPT_LEAK_PATTERNS) {
    redacted = redacted.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'), '[redacted prompt text]');
  }
  const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\/** Claims a commit can never prove on its own. Users add repo-specific ones. */');
  for (const term of neverExpose) {
    const parts = term.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const p = new RegExp(parts.map(escapePattern).join('\\s+'), 'gi');
    redacted = redacted.replace(p, '[redacted]');
  }
  return redacted;
}

/** Claims a commit can never prove on its own. Users add repo-specific ones. */
export const DEFAULT_NEVER_CLAIM = [
  'production ready',
  'production-ready',
  'enterprise-grade',
  'soc 2 certified',
  'hipaa compliant',
  'gdpr compliant',
  'bank-grade security',
  '100% secure',
  'guaranteed',
  'zero bugs',
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ');
}

export function runFirewall(text: string, channel: Channel, rules: RepoTruthRules): string[] {
  const violations: string[] = [];
  const t = text ?? '';
  const n = norm(t);

  if (t.trim().length < 20) violations.push('draft is too short to carry a real signal');
  if (t.length > CHANNEL_LIMITS[channel]) {
    violations.push(`exceeds ${channel} limit of ${CHANNEL_LIMITS[channel]} characters (${t.length})`);
  }
  for (const p of PROMPT_LEAK_PATTERNS) {
    if (p.test(t)) {
      violations.push('looks like leaked prompt/instructions text');
      break;
    }
  }
  for (const [label, p] of SECRET_PATTERNS) {
    if (p.test(t)) violations.push(`possible secret detected (${label})`);
  }
  for (const claim of [...DEFAULT_NEVER_CLAIM, ...rules.neverClaim]) {
    const c = norm(claim).trim();
    if (c && n.includes(c)) violations.push(`unprovable claim: "${claim}"`);
  }
  for (const term of rules.neverExpose) {
    const c = norm(term).trim();
    if (c && n.includes(c)) violations.push('never-expose term present');
  }
  return [...new Set(violations)];
}
