import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND_CSS, BRAND_JS, GLOBAL_SHELL_CSS, brandWelcomeMarkup } from '../src/brand.ts';

test('public welcome links to existing signup and login without inventing OAuth', () => {
  const html = brandWelcomeMarkup(false);
  assert.match(html, /href="\/signup"/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /google\.com\/o\/oauth|appleid\.apple\.com/);
});

test('signed-in welcome routes the primary action to the existing app', () => {
  const html = brandWelcomeMarkup(true);
  assert.match(html, /href="\/app"/);
});

test('plans preserve the actual free allowance and founder-gated Pro pricing', () => {
  const html = brandWelcomeMarkup(false);
  assert.match(html, /1 public repository/);
  assert.match(html, /30 drafts \/ month/);
  assert.match(html, /Not priced/);
  assert.match(html, /Founder-gated/);
  assert.doesNotMatch(html, /\$9|\$29|unlimited repos/i);
});

test('publishing remains human-controlled; no fake connected account signals', () => {
  const html = brandWelcomeMarkup(false);
  assert.match(html, /You approve before a post is copied/);
  assert.match(html, /No simulated account activity/);
  assert.match(html, /automated publishing|autoposting/i);
});

test('responsive glass scenery, reduced motion, and mobile nav are present', () => {
  assert.match(BRAND_CSS, /backdrop-filter:blur/);
  assert.match(BRAND_CSS, /@media\(max-width:680px\)/);
  assert.match(BRAND_CSS, /prefers-reduced-motion:reduce/);
  assert.match(BRAND_CSS, /sl-ripple/);
  assert.match(BRAND_JS, /aria-expanded/);
  assert.match(BRAND_JS, /localStorage\.setItem/);
  assert.match(GLOBAL_SHELL_CSS, /body:not\(\.sl-welcome\)/);
});

test('ambient audio is opt-in and stops when the tab is hidden', () => {
  assert.match(BRAND_JS, /AudioContext/);
  assert.match(BRAND_JS, /document\.hidden&&playing/);
  assert.match(BRAND_JS, /source\.stop/);
  assert.match(brandWelcomeMarkup(), /aria-pressed="false" aria-label="Toggle optional ambient water sounds"/);
});

test('all four companions only set a visual preference', () => {
  const html=brandWelcomeMarkup();
  assert.equal((html.match(/data-sl-companion=/g) || []).length, 4);
  assert.match(html,/Companions are visual concepts/);
});