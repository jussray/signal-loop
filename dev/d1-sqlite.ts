/** D1-compatible shim over node:sqlite, for local dev and tests only. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/lib/env.ts';

export function createD1(file = ':memory:', migrationsDir?: string): D1Database {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (migrationsDir) {
    for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
      db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
    }
  }
  const prepare = (sql: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    async first<T>() {
      return (db.prepare(sql).get(...(args as any[])) as T) ?? null;
    },
    async all<T>(): Promise<D1Result<T>> {
      return { results: db.prepare(sql).all(...(args as any[])) as T[] };
    },
    async run(): Promise<D1Result> {
      const r = db.prepare(sql).run(...(args as any[]));
      return { results: [], meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (sql: string) => prepare(sql) };
}
