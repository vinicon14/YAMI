import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  AuditEntry,
  PermissionDecision,
  ToolRisk,
} from "@yami/contracts";

export interface AuditInput {
  actor: string;
  action: string;
  risk: ToolRisk;
  decision: PermissionDecision;
  detail?: string;
}

export const GENESIS_HASH = "0".repeat(64);

function canonical(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys.map((key) => [key, value[key]]));
}

function computeHash(prevHash: string, body: Record<string, unknown>): string {
  return createHash("sha256").update(`${prevHash}|${canonical(body)}`).digest("hex");
}

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  risk: string;
  decision: string;
  detail: string;
  prev_hash: string;
  hash: string;
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    risk: row.risk as ToolRisk,
    decision: row.decision as PermissionDecision,
    detail: row.detail,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

/**
 * Trilha de auditoria encadeada.
 *
 * Cada registro inclui o hash do anterior, então alterar ou remover uma linha
 * quebra a verificação de toda a cadeia seguinte.
 */
export class AuditLog {
  constructor(private readonly db: DatabaseSync) {}

  append(input: AuditInput): AuditEntry {
    const at = new Date().toISOString();
    const last = this.db
      .prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
      .get() as { hash: string } | undefined;
    const prevHash = last?.hash || GENESIS_HASH;
    const detail = input.detail ?? "";
    const hash = computeHash(prevHash, {
      at,
      actor: input.actor,
      action: input.action,
      risk: input.risk,
      decision: input.decision,
      detail,
    });

    const result = this.db
      .prepare(
        `INSERT INTO audit_log (at, actor, action, risk, decision, detail, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(at, input.actor, input.action, input.risk, input.decision, detail, prevHash, hash);

    return {
      id: Number(result.lastInsertRowid),
      at,
      actor: input.actor,
      action: input.action,
      risk: input.risk,
      decision: input.decision,
      detail,
      prevHash,
      hash,
    };
  }

  list(limit = 100): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?")
      .all(Math.min(Math.max(limit, 1), 1000)) as unknown as AuditRow[];
    return rows.map(toEntry);
  }

  verify(): { ok: boolean; brokenAt: number | null } {
    const rows = this.db
      .prepare("SELECT * FROM audit_log ORDER BY id ASC")
      .all() as unknown as AuditRow[];

    let prevHash = GENESIS_HASH;
    for (const row of rows) {
      const expected = computeHash(prevHash, {
        at: row.at,
        actor: row.actor,
        action: row.action,
        risk: row.risk,
        decision: row.decision,
        detail: row.detail,
      });
      if (row.prev_hash !== prevHash || row.hash !== expected) {
        return { ok: false, brokenAt: row.id };
      }
      prevHash = row.hash;
    }
    return { ok: true, brokenAt: null };
  }
}
