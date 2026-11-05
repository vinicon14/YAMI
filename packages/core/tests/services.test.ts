import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditLog, MemoryService, McpService, ToolRegistry, VoiceService, openDatabase } from "../src";

describe("AuditLog", () => {
  it("encadeia hashes e detecta adulteração", () => {
    const db = openDatabase(":memory:");
    const audit = new AuditLog(db);
    audit.append({ actor: "a", action: "fs.read", risk: "read", decision: "allow" });
    audit.append({ actor: "a", action: "shell.run", risk: "exec", decision: "allow" });
    audit.append({ actor: "a", action: "fs.delete", risk: "write", decision: "deny" });

    expect(audit.verify()).toEqual({ ok: true, brokenAt: null });
    expect(audit.list(2)).toHaveLength(2);

    db.prepare("UPDATE audit_log SET detail = 'alterado' WHERE id = 2").run();
    expect(audit.verify()).toEqual({ ok: false, brokenAt: 2 });
  });
});

describe("MemoryService", () => {
  it("busca memórias por FTS e remove", () => {
    const db = openDatabase(":memory:");
    const memory = new MemoryService(db);
    const first = memory.create({ agentId: "a1", text: "O usuário prefere respostas curtas" });
    memory.create({ agentId: "a1", text: "Projeto YAMI usa Electron" });
    memory.create({ agentId: "a2", text: "Outro agente" });

    expect(memory.list("a1")).toHaveLength(2);
    expect(memory.search("a1", "respostas")).toHaveLength(1);
    expect(memory.search("a1", "electron")).toHaveLength(1);
    expect(memory.search("a1", "inexistente")).toHaveLength(0);

    expect(memory.remove(first.id)).toBe(true);
    expect(memory.list("a1")).toHaveLength(1);
  });
});

describe("ToolRegistry", () => {
  let root: string;
  const tools = new ToolRegistry();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "yami-tools-"));
  });

  afterAll(() => {
    // diretórios temporários são limpos no fim de cada teste pelo sistema
  });

  it("escreve, lê, lista e busca dentro do workspace", async () => {
    const ctx = { workspaceRoot: root, access: "workspace" as const };
    const written = await tools.execute("fs.write", { path: "nota.txt", content: "linha um\nlinha dois" }, ctx);
    expect(written.ok).toBe(true);

    const read = await tools.execute("fs.read", { path: "nota.txt" }, ctx);
    expect(read.ok).toBe(true);
    expect((read.output as { content: string }).content).toContain("linha dois");

    const list = await tools.execute("fs.list", { path: "." }, ctx);
    expect((list.output as { entries: Array<{ name: string }> }).entries.map((e) => e.name)).toContain(
      "nota.txt",
    );

    const search = await tools.execute("fs.search", { query: "linha dois" }, ctx);
    expect((search.output as { matches: unknown[] }).matches.length).toBe(1);
  });

  it("bloqueia fuga do workspace", async () => {
    const outside = join(root, "..", "fora.txt");
    writeFileSync(outside, "x");
    const ctx = { workspaceRoot: root, access: "workspace" as const };
    const result = await tools.execute("fs.read", { path: "../fora.txt" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("fora do workspace");
    rmSync(outside, { force: true });
  });

  it("executa comandos de shell", async () => {
    const ctx = { workspaceRoot: root, access: "full" as const };
    const result = await tools.execute("shell.run", { command: "echo yami-ok" }, ctx);
    expect(result.ok).toBe(true);
    expect((result.output as { stdout: string }).stdout).toContain("yami-ok");
  });

  it("recusa ferramenta desconhecida", async () => {
    const result = await tools.execute("nope", {}, { workspaceRoot: root, access: "full" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("desconhecida");
  });
});

describe("McpService", () => {
  it("inicializa um servidor stdio, lista e chama ferramentas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yami-mcp-"));
    try {
      const script = join(dir, "server.cjs");
      writeFileSync(
        script,
        `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send(message.id, { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake" } });
  } else if (message.method === "tools/list") {
    send(message.id, { tools: [{ name: "echo", description: "eco", inputSchema: { type: "object" } }] });
  } else if (message.method === "tools/call") {
    send(message.id, { content: [{ type: "text", text: JSON.stringify(message.params.arguments) }] });
  }
});
`,
      );

      const db = openDatabase(":memory:");
      const mcp = new McpService(db);
      const server = mcp.save({
        name: "Fake",
        transport: "stdio",
        command: process.execPath,
        args: [script],
      });

      const listed = await mcp.tools(server.id);
      expect(listed.map((tool) => tool.name)).toEqual(["echo"]);

      const result = await mcp.call(server, "echo", { hello: "mundo" });
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result.output)).toContain("mundo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("VoiceService", () => {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/transcribe") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: " bom dia ", duration: 1.5 }));
      return;
    }
    if (req.url === "/generate") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(Buffer.from([82, 73, 70, 70]));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterAll(() => {
    server.close();
  });

  it("verifica saúde, transcreve e sintetiza", async () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Porta inválida.");
    const service = new VoiceService(() => `http://127.0.0.1:${address.port}`, () => "perfil");

    const status = await service.status();
    expect(status.available).toBe(true);

    const transcription = await service.transcribe(Buffer.from("audio").toString("base64"), "audio/webm");
    expect(transcription.text).toBe("bom dia");
    expect(transcription.durationMs).toBe(1500);

    const audio = await service.speak("olá");
    expect(audio.mime).toContain("audio/wav");
    expect(Buffer.from(audio.audioBase64, "base64").toString("hex")).toBe("52494646");
  });
});
