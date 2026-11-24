# Signal Loop — agent instructions (Claude, ChatGPT, Codex, any agent)

## What this is
A standalone freemium SaaS: verified GitHub commits → social drafts → truth firewall → human review.
Exported from Founder Control Room's Founder Signal Engine (see README "Provenance"). It does not depend on FCR at runtime.

## Invariants (never break)
1. **Evidence binding.** A draft exists only for a commit re-read server-side (`getCommit`). Never accept commit text from the client.
2. **Proof link survives.** Edited drafts must still contain the commit URL, or they are blocked.
3. **Firewall on every write.** Generate and edit both run `runFirewall` followed by `evaluateSignal`. Blocked drafts cannot be approved (enforced on the server, not only hidden in the UI).
4. **Limits are server-side.** Plan limits live in `src/core/plans.ts` and are checked in handlers, never only in UI.
5. **Tenant isolation.** Every query on repos and signals filters by `user_id`.
6. **No invented pricing or payments.** `PLANS.pro.priceMonthlyUsd` stays `null` until the founder sets it; billing is a founder gate.
7. **Zero runtime deps.** Workers + D1 + WebCrypto only. Code must also run under `node --experimental-strip-types` (no enums, no parameter properties; `erasableSyntaxOnly` is on).

## Verify before claiming done
`npm test` → `npm run typecheck` → `npm run e2e` (Playwright, real browser; required for any UI or flow change).

## Workflow
Branch + PR. Agents do not merge their own PRs; the founder merges.
