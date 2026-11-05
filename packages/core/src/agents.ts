import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AccessLevel, Agent } from "@yami/contracts";

interface AgentRow {
  id: string;
  name: string;
  instructions: string;
  workspace_path: string;
  provider_id: string | null;
  model_id: string | null;
  access: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentInput {
  name: string;
  instructions?: string;
  workspacePath: string;
  access?: AccessLevel;
  providerId?: string | null;
  modelId?: string | null;
}

export interface UpdateAgentInput {
  name?: string;
  instructions?: string;
  providerId?: string | null;
  modelId?: string | null;
  access?: AccessLevel;
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    workspacePath: row.workspace_path,
    providerId: row.provider_id,
    modelId: row.model_id,
    access: row.access as AccessLevel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AgentService {
  constructor(private readonly db: DatabaseSync) {}

  create(input: CreateAgentInput): Agent {
    const name = input.name.trim();
    if (!name) throw new Error("O nome do agente é obrigatório.");

    const now = new Date().toISOString();
    const agent: Agent = {
      id: randomUUID(),
      name,
      instructions: input.instructions ?? "",
      workspacePath: input.workspacePath,
      providerId: input.providerId ?? null,
      modelId: input.modelId ?? null,
      access: input.access ?? "workspace",
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO agents
           (id, name, instructions, workspace_path, provider_id, model_id, access, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agent.id,
        agent.name,
        agent.instructions,
        agent.workspacePath,
        agent.providerId,
        agent.modelId,
        agent.access,
        agent.createdAt,
        agent.updatedAt,
      );

    return agent;
  }

  list(): Agent[] {
    const rows = this.db
      .prepare(`SELECT * FROM agents ORDER BY created_at ASC`)
      .all() as unknown as AgentRow[];
    return rows.map(toAgent);
  }

  get(id: string): Agent | null {
    const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as
      | AgentRow
      | undefined;
    return row ? toAgent(row) : null;
  }

  update(id: string, input: UpdateAgentInput): Agent {
    const current = this.get(id);
    if (!current) throw new Error("Agente não encontrado.");

    const next: Agent = {
      ...current,
      name: input.name?.trim() || current.name,
      instructions: input.instructions ?? current.instructions,
      providerId: input.providerId === undefined ? current.providerId : input.providerId,
      modelId: input.modelId === undefined ? current.modelId : input.modelId,
      access: input.access ?? current.access,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `UPDATE agents
         SET name = ?, instructions = ?, provider_id = ?, model_id = ?, access = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.name,
        next.instructions,
        next.providerId,
        next.modelId,
        next.access,
        next.updatedAt,
        id,
      );

    return next;
  }

  remove(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
    return Number(result.changes) > 0;
  }
}
