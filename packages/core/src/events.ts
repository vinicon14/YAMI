import type { DatabaseSync } from "node:sqlite";
import type { YamiEvent } from "@yami/contracts";

export interface StoredEvent {
  seq: number;
  event: YamiEvent;
}

export class EventStore {
  constructor(private readonly db: DatabaseSync) {}

  append(event: YamiEvent): number {
    const result = this.db
      .prepare(
        `INSERT INTO events (id, type, session_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.id, event.type, event.sessionId, JSON.stringify(event), event.at);
    return Number(result.lastInsertRowid);
  }

  list(limit = 50, sessionId?: string): StoredEvent[] {
    const rows = sessionId
      ? (this.db
          .prepare(
            `SELECT seq, payload FROM events WHERE session_id = ? ORDER BY seq DESC LIMIT ?`,
          )
          .all(sessionId, limit) as Array<{ seq: number; payload: string }>)
      : (this.db
          .prepare(`SELECT seq, payload FROM events ORDER BY seq DESC LIMIT ?`)
          .all(limit) as Array<{ seq: number; payload: string }>);

    return rows.reverse().map((row) => ({
      seq: row.seq,
      event: JSON.parse(row.payload) as YamiEvent,
    }));
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS total FROM events").get() as {
      total: number;
    };
    return row.total;
  }
}
