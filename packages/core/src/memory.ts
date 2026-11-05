import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Memory, MemoryInput } from "@yami/contracts";

interface MemoryRow {
  id: string;
  agent_id: string;
  text: string;
  normalized: string;
  origin: string;
  source_turn_id: string | null;
  created_at: string;
  updated_at: string;
}

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    agentId: row.agent_id,
    text: row.text,
    origin: row.origin,
    sourceTurnId: row.source_turn_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Memória de longo prazo por agente, com busca full-text (FTS5).
 */
export class MemoryService {
  constructor(private readonly db: DatabaseSync) {}

  create(input: MemoryInput): Memory {
    const text = input.text.trim();
    if (!text) throw new Error("A memória não pode estar vazia.");
    const now = new Date().toISOString();
    const memory: Memory = {
      id: randomUUID(),
      agentId: input.agentId,
      text,
      origin: input.origin || "manual",
      sourceTurnId: input.sourceTurnId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO memories
             (id, agent_id, text, normalized, origin, source_turn_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          memory.id,
          memory.agentId,
          memory.text,
          normalizeText(memory.text),
          memory.origin,
          memory.sourceTurnId,
          memory.createdAt,
          memory.updatedAt,
        );
      this.db
        .prepare("INSERT INTO memories_fts (memory_id, text) VALUES (?, ?)")
        .run(memory.id, memory.text);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return memory;
  }

  list(agentId?: string, limit = 100): Memory[] {
    const size = Math.min(Math.max(limit, 1), 500);
    const rows = agentId
      ? (this.db
          .prepare("SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(agentId, size) as unknown as MemoryRow[])
      : (this.db
          .prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?")
          .all(size) as unknown as MemoryRow[]);
    return rows.map(toMemory);
  }

  search(agentId: string, query: string, limit = 20): Memory[] {
    const terms = normalizeText(query)
      .split(" ")
      .filter(Boolean)
      .map((term) => `"${term.replace(/"/g, '""')}"*`);
    if (terms.length === 0) return this.list(agentId, limit);

    const rows = this.db
      .prepare(
        `SELECT m.* FROM memories_fts f
         JOIN memories m ON m.id = f.memory_id
         WHERE memories_fts MATCH ? AND m.agent_id = ?
         ORDER BY bm25(memories_fts)
         LIMIT ?`,
      )
      .all(terms.join(" "), agentId, Math.min(Math.max(limit, 1), 100)) as unknown as MemoryRow[];
    return rows.map(toMemory);
  }

  remove(id: string): boolean {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM memories_fts WHERE memory_id = ?").run(id);
      const result = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
      this.db.exec("COMMIT");
      return Number(result.changes) > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
