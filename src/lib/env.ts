/** Minimal D1 surface we use (subset of Cloudflare's D1Database). */
export interface D1Result<T = unknown> {
  results: T[];
  meta?: { changes?: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  /** Optional: raises GitHub rate limit from 60/h/IP to 5000/h. Read-only, public repos. */
  GITHUB_TOKEN?: string;
  /** Test seam only. Defaults to https://api.github.com. */
  GITHUB_API_BASE?: string;
}
