import { DatabaseSync } from "node:sqlite";

/**
 * Camada de persistência do YAMI.
 *
 * O log de eventos (`events`) é a fonte de verdade; as demais tabelas são
 * projeções derivadas. Escolhemos `node:sqlite` (embutido no Node 24, que é o
 * runtime do Electron 42) para não depender de módulos nativos compilados.
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
  {
    version: 2,
    up: `
      ALTER TABLE messages ADD COLUMN turn_id TEXT;
      ALTER TABLE messages ADD COLUMN tool_calls_json TEXT NOT NULL DEFAULT '[]';

      ALTER TABLE audit_log ADD COLUMN prev_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE audit_log ADD COLUMN hash TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS threads (
        id         TEXT PRIMARY KEY,
        agent_id   TEXT NOT NULL,
        title      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS threads_agent_idx ON threads (agent_id, updated_at);

      CREATE TABLE IF NOT EXISTS turns (
        id           TEXT PRIMARY KEY,
        thread_id    TEXT NOT NULL,
        agent_id     TEXT NOT NULL,
        provider_id  TEXT,
        model_id     TEXT,
        status       TEXT NOT NULL,
        error        TEXT,
        started_at   TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS turns_thread_idx ON turns (thread_id, started_at);

      CREATE TABLE IF NOT EXISTS providers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        kind          TEXT NOT NULL,
        auth          TEXT NOT NULL DEFAULT 'none',
        base_url      TEXT,
        models_json   TEXT NOT NULL DEFAULT '[]',
        default_model TEXT,
        command       TEXT,
        args_json     TEXT NOT NULL DEFAULT '[]',
        enabled       INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secrets (
        id         TEXT PRIMARY KEY,
        value      BLOB NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memories (
        id             TEXT PRIMARY KEY,
        agent_id       TEXT NOT NULL,
        text           TEXT NOT NULL,
        normalized     TEXT NOT NULL,
        origin         TEXT NOT NULL DEFAULT 'manual',
        source_turn_id TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_agent_idx ON memories (agent_id, created_at);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        memory_id UNINDEXED,
        text,
        tokenize = 'unicode61'
      );

      CREATE TABLE IF NOT EXISTS tools (
        name       TEXT PRIMARY KEY,
        enabled    INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        transport    TEXT NOT NULL,
        command      TEXT,
        args_json    TEXT NOT NULL DEFAULT '[]',
        url          TEXT,
        headers_json TEXT NOT NULL DEFAULT '{}',
        enabled      INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_records (
        id            TEXT PRIMARY KEY,
        agent_id      TEXT NOT NULL,
        thread_id     TEXT NOT NULL,
        turn_id       TEXT NOT NULL,
        provider_id   TEXT NOT NULL,
        model_id      TEXT NOT NULL,
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd      REAL,
        occurred_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS usage_turn_idx ON usage_records (turn_id);
    `,
  },
  {
    version: 3,
    up: `
      ALTER TABLE providers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai';
    `,
  },
];

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
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

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
