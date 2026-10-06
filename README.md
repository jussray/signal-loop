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
