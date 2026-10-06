import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignal, type SignalCandidate } from '../src/core/policy.ts';
import { runFirewall, type RepoTruthRules } from '../src/core/firewall.ts';
import { buildFiveW1H, draftFor, parseCommitMessage, signalScore, type VerifiedCommit } from '../src/core/generator.ts';
import { CHANNELS, CHANNEL_LIMITS } from '../src/core/plans.ts';

const SHA = 'a'.repeat(40);
const URL_ = `https://github.com/acme/rocket/commit/${SHA}`;
const commit: VerifiedCommit = {
  repository: 'acme/rocket', sha: SHA, url: URL_, author: 'jussray', date: '2026-10-05T18:00:00Z',
  message: 'feat(auth): add magic-link login\n\nUsers can sign in with a one-time link.',
};
const f = buildFiveW1H(commit);
const candidate = (over: Partial<SignalCandidate> = {}): SignalCandidate => ({
  repository: 'acme/rocket', channel: 'x', proofUrl: URL_, sourceCommitSha: SHA, fiveW1h: f,
  evidenceReceipt: { verified: true, provider: 'github', repository: 'acme/rocket', sourceCommitSha: SHA, proofUrl: URL_ },
  ...over,
});
const ctx = { connectedRepositories: ['acme/rocket'], grant: null, firewallViolations: [] as string[] };

test('policy: clean verified candidate without grant -> review', () => {
  assert.equal(evaluateSignal(candidate(), ctx).decision, 'review');
});

test('policy: live grant on channel -> ready; expired grant -> review', () => {
  const now = new Date('2026-10-06T00:00:00Z');
  assert.equal(evaluateSignal(candidate(), { ...ctx, grant: { enabled: true, channels: ['x'], expiresAt: null } }, now).decision, 'ready');
  assert.equal(evaluateSignal(candidate(), { ...ctx, grant: { enabled: true, channels: ['x'], expiresAt: '2026-01-01T00:00:00Z' } }, now).decision, 'review');
  assert.equal(evaluateSignal(candidate(), { ...ctx, grant: { enabled: true, channels: ['linkedin'], expiresAt: null } }, now).decision, 'review');
});

test('policy: unverified or mismatched evidence -> blocked', () => {
  const r1 = evaluateSignal(candidate({ evidenceReceipt: { ...candidate().evidenceReceipt!, verified: false } }), ctx);
  assert.equal(r1.decision, 'blocked');
  const r2 = evaluateSignal(candidate({ evidenceReceipt: { ...candidate().evidenceReceipt!, sourceCommitSha: 'b'.repeat(40) } }), ctx);
  assert.equal(r2.decision, 'blocked');
  assert.ok(r2.reasons.some((r) => r.includes('evidence receipt')));
});

test('policy: short sha, missing 5W1H, foreign repo, firewall -> blocked', () => {
  assert.equal(evaluateSignal(candidate({ sourceCommitSha: 'abc1234' }), ctx).decision, 'blocked');
  assert.equal(evaluateSignal(candidate({ fiveW1h: { ...f, why: '' } }), ctx).decision, 'blocked');
  assert.equal(evaluateSignal(candidate({ repository: 'other/repo' }), ctx).decision, 'blocked');
  const r = evaluateSignal(candidate(), { ...ctx, firewallViolations: ['possible secret detected (GitHub token)'] });
  assert.equal(r.decision, 'blocked');
  assert.deepEqual(r.reasons, ['firewall: possible secret detected (GitHub token)']);
});

const noRules: RepoTruthRules = { neverClaim: [], neverExpose: [] };

test('firewall: clean generated drafts pass on every channel', () => {
  for (const ch of CHANNELS) {
    const d = draftFor(ch, commit, f);
    assert.ok(d.length <= CHANNEL_LIMITS[ch], `${ch} within limit`);
    assert.ok(d.includes(URL_), `${ch} keeps proof url`);
    assert.deepEqual(runFirewall(d, ch, noRules), [], `${ch} clean`);
  }
});

test('firewall: secrets, overclaims, never-expose, prompt leaks, length', () => {
  const has = (text: string, needle: string, rules = noRules) =>
    runFirewall(text, 'linkedin', rules).some((v) => v.includes(needle));
  assert.ok(has('Shipped it. token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab done', 'GitHub token'));
  assert.ok(has('Shipped it with key AKIAABCDEFGHIJKLMNOP for storage', 'AWS'));
  assert.ok(has('-----BEGIN RSA PRIVATE KEY----- leaked by accident here', 'private key'));
  assert.ok(has('Our billing is now Production Ready for everyone', 'unprovable claim'));
  assert.ok(has('Now fully publicly launched to the world today', 'publicly launched', { neverClaim: ['publicly launched'], neverExpose: [] }));
  assert.ok(has('Fixed export for customer Acme Bank and their team', 'never-expose', { neverClaim: [], neverExpose: ['acme bank'] }));
  assert.ok(has('You are writing for founders. Return valid JSON now please', 'prompt'));
  assert.ok(runFirewall('x'.repeat(281), 'x', noRules).some((v) => v.includes('limit')));
  assert.ok(runFirewall('short', 'x', noRules).some((v) => v.includes('too short')));
});

test('generator: parses conventional commits and scores noise low', () => {
  assert.deepEqual(parseCommitMessage('feat(auth): add x').kind, 'feat');
  assert.equal(parseCommitMessage('fix: y').kind, 'fix');
  assert.equal(parseCommitMessage('random words').kind, 'other');
  assert.ok(signalScore('Merge pull request #1 from a/b') < 30);
  assert.ok(signalScore('chore(deps): bump a from 1 to 2') < 30);
  assert.ok(signalScore('feat: add magic-link login') >= 80);
});

test('generator: 5W1H is fully populated from the commit only', () => {
  for (const v of Object.values(f)) assert.ok(String(v).length > 0);
  assert.equal(f.where, 'acme/rocket (auth)');
  assert.equal(f.how, 'commit aaaaaaa');
});

test('generator: very long subject is trimmed but proof url survives on x', () => {
  const long = { ...commit, message: `feat: ${'very long change '.repeat(40)}` };
  const d = draftFor('x', long, buildFiveW1H(long));
  assert.ok(d.length <= 280);
  assert.ok(d.endsWith(URL_));
});
