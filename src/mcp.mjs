import {
  SIGNAL_LOOP_CAPABILITIES,
  SIGNAL_LOOP_STAGES,
  SIGNAL_LOOP_VERSION,
  explainStage,
  validateTransition,
} from './contract.mjs';

const SERVER_INFO = Object.freeze({ name: 'signal-loop', version: SIGNAL_LOOP_VERSION });
const SUPPORTED_PROTOCOLS = Object.freeze(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);

const TOOLS = Object.freeze([
  {
    name: 'signal_loop_capabilities',
    description: 'Return SignalLoop product scope, canonical loop, integration boundary, and read-only authority ceiling.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'signal_loop_explain_stage',
    description: 'Explain one canonical SignalLoop stage and identify its expected next stage.',
    inputSchema: {
      type: 'object',
      properties: { stage: { type: 'string', enum: SIGNAL_LOOP_STAGES } },
      required: ['stage'],
      additionalProperties: false,
    },
  },
  {
    name: 'signal_loop_validate_transition',
    description: 'Check whether a proposed stage transition follows the canonical SignalLoop learning loop. This never mutates state.',
    inputSchema: {
      type: 'object',
      properties: {
        fromStage: { type: 'string', enum: SIGNAL_LOOP_STAGES },
        toStage: { type: 'string', enum: SIGNAL_LOOP_STAGES },
      },
      required: ['fromStage', 'toStage'],
      additionalProperties: false,
    },
  },
]);

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

function chooseProtocol(params) {
  const requested = typeof params?.protocolVersion === 'string' ? params.protocolVersion : null;
  return requested && SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
}

function callTool(name, args) {
  if (name === 'signal_loop_capabilities') {
    return toolResult(SIGNAL_LOOP_CAPABILITIES);
  }

  if (name === 'signal_loop_explain_stage') {
    const value = explainStage(args?.stage);
    if (!value) throw new Error('stage must be a canonical SignalLoop stage');
    return toolResult(value);
  }

  if (name === 'signal_loop_validate_transition') {
    if (typeof args?.fromStage !== 'string' || typeof args?.toStage !== 'string') {
      throw new Error('fromStage and toStage are required');
    }
    return toolResult(validateTransition(args.fromStage, args.toStage));
  }

  throw new Error(`Unknown SignalLoop tool: ${name}`);
}

export function handleMcpMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return rpcError(null, -32600, 'Invalid Request');
  }

  const id = message.id ?? null;
  const method = message.method;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: chooseProtocol(message.params),
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: 'SignalLoop MCP is read-only. It explains and validates the canonical signal learning loop; it cannot publish, merge, deploy, or mutate providers.',
    });
  }

  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const name = message.params?.name;
    if (typeof name !== 'string') return rpcError(id, -32602, 'Tool name is required');
    try {
      return rpcResult(id, callTool(name, message.params?.arguments ?? {}));
    } catch (error) {
      return rpcError(id, -32602, error instanceof Error ? error.message : String(error));
    }
  }

  if (method === 'notifications/initialized') return null;
  return rpcError(id, -32601, `Method not found: ${String(method)}`);
}

export async function handleMcpRequest(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', allow: 'POST' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const result = handleMcpMessage(body);
  if (result === null) return new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
