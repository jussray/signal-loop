# SignalLoop

**Social Content Intelligence for Founders.** SignalLoop turns observable signals into evidence-backed claims, reversible experiments, reviewed communication, measured outcomes, and the next signal.

Canonical learning loop:

`signal → evidence → claim → experiment → draft → review → measured-result → next-signal → signal`

## Runtime boundary

SignalLoop owns its own repository and runtime. Founder Control Room can federate evidence and continuity through governed interfaces, but SignalLoop is not absorbed into FCR and its MCP does not grant FCR, a model, or a client mutation authority.

## Native MCP + registry

This repository includes a dependency-free, read-only Streamable HTTP MCP surface for the SignalLoop contract:

- `POST /mcp`
- `GET /mcp/registry/v0.1/servers`
- `GET /health`

The native MCP currently exposes deterministic contract tools only. It cannot publish, merge, deploy, approve, or mutate provider/database state.

### Verify

```bash
npm test
```

### Deploy

```bash
wrangler deploy
```

Do not claim the MCP or registry is live until the deployed Worker is checked end to end against the exact repository head. See `docs/MCP_STACK.md`.

## Standalone proof-first SaaS (existing PR #1)

**Proof-first build in public.** Signal Loop reads what you actually shipped on GitHub, drafts posts for X, LinkedIn and Bluesky, and blocks anything a commit can't prove, including leaked secrets.

Most social schedulers, Buffer and Typefully among them, start from a blank box. Signal Loop starts from evidence. Every draft is bound to a server-verified commit SHA and a proof link, then passed through a truth firewall before a human can approve it.

## The loop

```
public repo → commits read server-side (verified receipt: repo + 40-char SHA + proof URL)
            → 5W1H frame (who/what/where/when/why/how), from the commit only
            → per-channel draft (X 280, Bluesky 300, Threads/Mastodon 500, LinkedIn 3000)
            → truth firewall (secrets · unprovable claims · never-claim / never-expose · prompt leaks · length)
            → policy: ready | review | blocked
            → human approve / reject / edit (edits re-run firewall; proof link must survive)
```

## Plans (enforced server-side)

| | Free | Pro |
|---|---|---|
| Price | $0 | **Founder gate: not set.** UI shows "Early access" + waitlist |
| Repos | 1 | 25 |
| Drafts / month | 30 | 1000 |
| Channels | X, LinkedIn, Bluesky | + Threads, Mastodon |
| Autopilot | — | policy supports it; posting not built yet |

Limits live in `src/core/plans.ts`.

## Stack

Cloudflare Workers + D1, with **zero runtime dependencies**. Auth is built in: PBKDF2-SHA256 (100k iterations, the Workers maximum), random 256-bit session tokens stored only as SHA-256 hashes, `HttpOnly; SameSite=Lax; Secure` cookies, same-origin check on every POST, login rate limit (8 failures / 15 min per email + IP), strict CSP.

```
src/core/      policy.ts · firewall.ts · generator.ts · plans.ts   (pure, unit-tested)
src/lib/       crypto.ts · github.ts · http.ts · env.ts
src/app.ts     router + handlers     src/views.ts   server-rendered UI
src/worker.ts  Cloudflare entry      migrations/    D1 schema
dev/           Node runner: same fetch handler on node:sqlite
tests/         node:test unit + integration      e2e/   Playwright full-flow proof
```

## Run locally (Node ≥ 22.6, no install needed to run)

```bash
npm run dev          # http://localhost:8787  (in-memory DB; DB_FILE=./dev.sqlite to persist)
npm test             # 15 unit + integration tests
npm run typecheck    # needs: npm i
npm run e2e          # needs: npm i && npx playwright install chromium
```

## Deploy (founder steps)

```bash
npm i
npx wrangler d1 create signal-loop        # paste database_id into wrangler.toml
npx wrangler secret put GITHUB_TOKEN      # optional: 5000 req/h instead of 60
npm run deploy                            # applies migrations, deploys the Worker
```

## Provenance

The policy and firewall are exported from `jussray/founder-control-room` @ `8283095`:

- `src/lib/founderSignalAutomationPolicy.ts` → `src/core/policy.ts`
- `tools/zapier/buffer-content-firewall.cjs` (prompt-leak patterns) → `src/core/firewall.ts`
- `config/social-campaign-repositories.json` (neverClaim / neverExpose) → per-repo truth rules

Differences from the source are documented in each file header. FCR itself was not modified.

The existing read-only MCP and registry routes remain unchanged in the combined Worker. Its MCP tools never approve, post, or publish. Production requires founder authorization and a provisioned D1 database; the checked-in placeholder is not a production configuration.
