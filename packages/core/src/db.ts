import { DatabaseSync } from "node:sqlite";

/**
 * Camada de persistência do YAMI.
 *
 * O log de eventos (`events`) é a fonte de verdade; as demais tabelas são
 * projeções derivadas. Escolhemos `node:sqlite` (embutido no Node 24, que é o
 * runtime do Electron 45) para não depender de módulos nativos compilados.
 */

interface Migration {
  version: number;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS events (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        id          TEXT NOT NULL UNIQUE,
        type        TEXT NOT NULL,
        session_id  TEXT NOT NULL,
        payload     TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id, seq);

      CREATE TABLE IF NOT EXISTS agents (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        instructions   TEXT NOT NULL DEFAULT '',
        workspace_path TEXT NOT NULL,
        provider_id    TEXT,
        model_id       TEXT,
        access         TEXT NOT NULL DEFAULT 'workspace',
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id         TEXT PRIMARY KEY,
        thread_id  TEXT NOT NULL,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, created_at);

      CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        at         TEXT NOT NULL,
        actor      TEXT NOT NULL,
        action     TEXT NOT NULL,
        risk       TEXT NOT NULL,
        decision   TEXT NOT NULL,
        detail     TEXT NOT NULL DEFAULT ''
      );
    `,
  },
];

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
    .get() as { version: number } | undefined;
  let current = row?.version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
      current = migration.version;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return current;
}
