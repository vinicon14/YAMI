import { describe, expect, it, beforeEach } from "vitest";
import { AgentService, EventStore, openDatabase } from "../src";
import type { DatabaseSync } from "node:sqlite";
import type { YamiEvent } from "@yami/contracts";

let db: DatabaseSync;
let events: EventStore;

beforeEach(() => {
  db = openDatabase(":memory:");
  events = new EventStore(db);
});

const event = (n: number): YamiEvent => ({
  id: `evt-${n}`,
  type: "message.delta",
  sessionId: "session-1",
  at: new Date(2026, 0, n + 1).toISOString(),
  messageId: "msg-1",
  text: `parte ${n}`,
});

describe("EventStore", () => {
  it("grava e lê eventos em ordem cronológica", () => {
    events.append(event(0));
    events.append(event(1));
    events.append(event(2));

    const stored = events.list(2);
    expect(stored).toHaveLength(2);
    expect(stored.map((s) => s.event.id)).toEqual(["evt-1", "evt-2"]);
    expect(events.count()).toBe(3);
  });
});

describe("AgentService", () => {
  it("cria e lista agentes persistidos", () => {
    const agents = new AgentService(db);
    const created = agents.create({ name: "YAMI", workspacePath: "C:\\YAMI\\workspace" });

    expect(created.access).toBe("workspace");
    expect(agents.list()).toHaveLength(1);
    expect(agents.get(created.id)?.name).toBe("YAMI");
  });

  it("recusa agente sem nome", () => {
    const agents = new AgentService(db);
    expect(() => agents.create({ name: "  ", workspacePath: "C:\\YAMI" })).toThrow();
  });
});
