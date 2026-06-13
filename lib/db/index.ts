import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type DB = NeonHttpDatabase<typeof schema>;

// Lazily initialize so importing this module (e.g. during `next build` page-data
// collection) never requires DATABASE_URL — the connection is created on first use.
let _db: DB | null = null;

function getDb(): DB {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export * from './schema';
