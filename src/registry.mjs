import { SIGNAL_LOOP_VERSION } from './contract.mjs';

const SERVER_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
const REGISTRY_VERSION = SIGNAL_LOOP_VERSION;

function normalizeOrigin(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('SignalLoop registry origin must use HTTPS outside local development');
  }
  return parsed.origin;
}

export function buildSignalLoopRegistryResponse(origin, options = {}) {
  const requestedVersion = options.version?.trim();
  if (requestedVersion && requestedVersion !== 'latest' && requestedVersion !== REGISTRY_VERSION) {
    return { servers: [], metadata: { count: 0 } };
  }

  const canonicalOrigin = normalizeOrigin(origin);
  const entry = {
    server: {
      $schema: SERVER_SCHEMA,
      name: 'org.foundercontrolroom/signal-loop',
      title: 'SignalLoop',
      description: 'Read-only SignalLoop workflow intelligence: signal → evidence → claim → experiment → draft → review → measured result → next signal.',
      version: REGISTRY_VERSION,
      repository: {
        url: 'https://github.com/jussray/signal-loop',
        source: 'github',
      },
      remotes: [
        {
          type: 'streamable-http',
          url: `${canonicalOrigin}/mcp`,
        },
      ],
    },
  };

  const search = options.search?.trim().toLowerCase();
  const fields = [
    entry.server.name,
    entry.server.title,
    entry.server.description,
    entry.server.repository.url,
  ];
  const servers = search && !fields.some((value) => value.toLowerCase().includes(search))
    ? []
    : [entry];

  return { servers, metadata: { count: servers.length } };
}
