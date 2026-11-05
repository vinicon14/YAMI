import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  ChatMessage,
  ChatRole,
  Thread,
  ToolCallRecord,
  Turn,
  TurnStatus,
} from "@yami/contracts";

interface ThreadRow {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface MessageRow {
  id: string;
  thread_id: string;
  turn_id: string | null;
  role: string;
  content: string;
  tool_calls_json: string;
  created_at: string;
}

interface TurnRow {
  id: string;
  thread_id: string;
  agent_id: string;
  provider_id: string | null;
  model_id: string | null;
  status: string;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

function toThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count ?? 0,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  let toolCalls: ToolCallRecord[] = [];
  try {
    const parsed = JSON.parse(row.tool_calls_json) as unknown;
    if (Array.isArray(parsed)) toolCalls = parsed as ToolCallRecord[];
  } catch {
    toolCalls = [];
  }
  return {
    id: row.id,
    threadId: row.thread_id,
    turnId: row.turn_id,
    role: row.role as ChatRole,
    content: row.content,
    toolCalls,
    createdAt: row.created_at,
  };
}

function toTurn(row: TurnRow): Turn {
  return {
    id: row.id,
    threadId: row.thread_id,
    agentId: row.agent_id,
    status: row.status as TurnStatus,
    providerId: row.provider_id,
    modelId: row.model_id,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export interface AppendMessageInput {
  threadId: string;
  role: ChatRole;
  content: string;
  turnId?: string | null;
  toolCalls?: ToolCallRecord[];
}

export interface CreateTurnInput {
  threadId: string;
  agentId: string;
  providerId: string | null;
  modelId: string | null;
}

export class ThreadService {
  constructor(private readonly db: DatabaseSync) {}

  create(agentId: string, title = "Nova conversa"): Thread {
    const now = new Date().toISOString();
    const thread: Thread = {
      id: randomUUID(),
      agentId,
      title: title.trim() || "Nova conversa",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
    this.db
      .prepare(
        `INSERT INTO threads (id, agent_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(thread.id, thread.agentId, thread.title, thread.createdAt, thread.updatedAt);
    return thread;
  }

  list(agentId?: string): Thread[] {
    const rows = agentId
      ? (this.db
          .prepare(
            `SELECT t.*, (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count
             FROM threads t WHERE t.agent_id = ? ORDER BY t.updated_at DESC`,
          )
          .all(agentId) as unknown as ThreadRow[])
      : (this.db
          .prepare(
            `SELECT t.*, (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count
             FROM threads t ORDER BY t.updated_at DESC`,
          )
          .all() as unknown as ThreadRow[]);
    return rows.map(toThread);
  }

  get(id: string): Thread | null {
    const row = this.db
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count
         FROM threads t WHERE t.id = ?`,
      )
      .get(id) as ThreadRow | undefined;
    return row ? toThread(row) : null;
  }

  remove(id: string): boolean {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM messages WHERE thread_id = ?").run(id);
      this.db.prepare("DELETE FROM turns WHERE thread_id = ?").run(id);
      const result = this.db.prepare("DELETE FROM threads WHERE id = ?").run(id);
      this.db.exec("COMMIT");
      return Number(result.changes) > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  rename(id: string, title: string): void {
    this.db
      .prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, new Date().toISOString(), id);
  }

  touch(id: string): void {
    this.db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      id,
    );
  }

  messages(threadId: string, limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE thread_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(threadId, Math.min(Math.max(limit, 1), 1000)) as unknown as MessageRow[];
    return rows.reverse().map(toMessage);
  }

  appendMessage(input: AppendMessageInput): ChatMessage {
    const message: ChatMessage = {
      id: randomUUID(),
      threadId: input.threadId,
      turnId: input.turnId ?? null,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls ?? [],
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, thread_id, turn_id, role, content, tool_calls_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.threadId,
        message.turnId,
        message.role,
        message.content,
        JSON.stringify(message.toolCalls),
        message.createdAt,
      );
    this.touch(input.threadId);
    return message;
  }

  createTurn(input: CreateTurnInput): Turn {
    const turn: Turn = {
      id: randomUUID(),
      threadId: input.threadId,
      agentId: input.agentId,
      providerId: input.providerId,
      modelId: input.modelId,
      status: "running",
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    this.db
      .prepare(
        `INSERT INTO turns (id, thread_id, agent_id, provider_id, model_id, status, error, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turn.id,
        turn.threadId,
        turn.agentId,
        turn.providerId,
        turn.modelId,
        turn.status,
        turn.error,
        turn.startedAt,
        turn.completedAt,
      );
    return turn;
  }

  finishTurn(id: string, status: TurnStatus, error: string | null = null): Turn | null {
    this.db
      .prepare("UPDATE turns SET status = ?, error = ?, completed_at = ? WHERE id = ?")
      .run(status, error, new Date().toISOString(), id);
    return this.getTurn(id);
  }

  getTurn(id: string): Turn | null {
    const row = this.db.prepare("SELECT * FROM turns WHERE id = ?").get(id) as
      | TurnRow
      | undefined;
    return row ? toTurn(row) : null;
  }

  runningTurn(threadId: string): Turn | null {
    const row = this.db
      .prepare("SELECT * FROM turns WHERE thread_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1")
      .get(threadId) as TurnRow | undefined;
    return row ? toTurn(row) : null;
  }

  listTurns(threadId: string, limit = 50): Turn[] {
    const rows = this.db
      .prepare("SELECT * FROM turns WHERE thread_id = ? ORDER BY started_at DESC LIMIT ?")
      .all(threadId, limit) as unknown as TurnRow[];
    return rows.map(toTurn);
  }
}
