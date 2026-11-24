# SignalLoop MCP boundary

SignalLoop is a first-class product and runtime. Founder Control Room may federate SignalLoop evidence through governed interfaces, but it does not own SignalLoop implementation.

## Canonical loop

`signal → evidence → claim → experiment → draft → review → measured-result → next-signal → signal`

The first native MCP surface is intentionally read-only and deterministic. It exposes only:

- `signal_loop_capabilities`
- `signal_loop_explain_stage`
- `signal_loop_validate_transition`

It cannot publish content, merge code, deploy, mutate providers, write databases, approve claims, or turn an MCP client into an authority-bearing actor.

## Runtime endpoints

After deploying the Worker, its own origin serves:

- `GET /health`
- `POST /mcp`
- `GET /mcp/registry/v0.1/servers`

The registry dynamically advertises the deployed origin as the native SignalLoop Streamable HTTP remote. This avoids inventing a custom domain before provider evidence proves one.

## FCR federation gate

SignalLoop should be added to the FCR portfolio registry only after the native SignalLoop runtime has been deployed and the following are proven against the deployed exact head:

1. `/health` responds from the SignalLoop Worker.
2. MCP `initialize` succeeds.
3. `tools/list` returns only the expected read-only tool names.
4. A representative `tools/call` succeeds.
5. `/mcp/registry/v0.1/servers` advertises the same deployed origin and `jussray/signal-loop` repository.
6. The deployed artifact identity is tied back to the exact repository commit.

Until those checks are green, FCR must treat SignalLoop MCP as source-ready, not production-verified.
