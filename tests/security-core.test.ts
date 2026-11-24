import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftFor, buildFiveW1H, type VerifiedCommit } from '../src/core/generator.ts';
import { redactSensitive, sourceSensitiveViolations, runFirewall } from '../src/core/firewall.ts';
import { sameOrigin } from '../src/lib/http.ts';

test('long LinkedIn drafts retain exact verified proof link', () => {
  const sha='a'.repeat(40), url='https://github.com/acme/repo/commit/'+sha;
  const commit:VerifiedCommit={repository:'acme/repo',sha,url,author:'operator',
    date:'2026-10-06T00:00:00Z',message:'feat: '+ 'x'.repeat(4200)};
  const output=draftFor('linkedin',commit,buildFiveW1H(commit));
  assert.ok(output.length<=3000);
  assert.ok(output.includes(url));
});
test('never-expose terms are removed across arbitrary whitespace', () => {
  const phrase='acme bank', input='Customer Acme\n  Bank is connected';
  assert.ok(runFirewall(input,'linkedin',{neverClaim:[],neverExpose:[phrase]}).includes('never-expose term present'));
  const output=redactSensitive(input,[phrase]);
  assert.doesNotMatch(output,/Acme\s+Bank/i);
  assert.match(output,/\[redacted\]/);
});
test('raw source secrets are flagged and redacted', () => {
  const raw='Added token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab';
  assert.ok(sourceSensitiveViolations(raw).some(x=>x.includes('secret')));
  assert.doesNotMatch(redactSensitive(raw),/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab/);
});
test('POST requests without a trusted origin are rejected', () => {
  assert.equal(sameOrigin(new Request('https://signal.test/signup',{method:'POST'})),false);
  assert.equal(sameOrigin(new Request('https://signal.test/signup',{method:'POST',headers:{Origin:'http://signal.test'}})),false);
  assert.equal(sameOrigin(new Request('https://signal.test/signup',{method:'POST',headers:{Origin:'https://signal.test'}})),true);
});
