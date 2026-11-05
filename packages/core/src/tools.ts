import { spawn } from "node:child_process";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  AccessLevel,
  ToolDescriptor,
  ToolResult,
  ToolSpec,
} from "@yami/contracts";

export interface ToolContext {
  workspaceRoot: string;
  access: AccessLevel;
  signal?: AbortSignal;
}

interface BuiltinTool {
  spec: ToolSpec;
  risk: ToolDescriptor["risk"];
  destructive?: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  "build",
  "out",
  ".next",
  ".cache",
  "target",
  ".venv",
  "__pycache__",
]);

const MAX_READ_BYTES = 200_000;
const MAX_LIST_ENTRIES = 500;

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const BUILTINS: BuiltinTool[] = [
  {
    risk: "read",
    spec: {
      name: "fs.list",
      description: "Lista arquivos e pastas dentro do workspace autorizado.",
      inputSchema: objectSchema({
        path: { type: "string", description: "Caminho relativo ao workspace. Padrão: raiz." },
      }),
    },
    async run(input, ctx) {
      const target = await resolveExisting(ctx.workspaceRoot, asString(input.path) || ".");
      const entries = await readdir(target, { withFileTypes: true });
      const list = entries
        .slice(0, MAX_LIST_ENTRIES)
        .map((entry) => ({
          name: entry.name,
          path: relative(ctx.workspaceRoot, resolve(target, entry.name)).replace(/\\/g, "/"),
          type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
        }));
      return { path: relative(ctx.workspaceRoot, target) || ".", entries: list };
    },
  },
  {
    risk: "read",
    spec: {
      name: "fs.read",
      description: "Lê um arquivo de texto do workspace, com limite de bytes.",
      inputSchema: objectSchema(
        {
          path: { type: "string", description: "Caminho relativo ao workspace." },
          maxBytes: { type: "number", description: "Limite de leitura (máx. 200000)." },
        },
        ["path"],
      ),
    },
    async run(input, ctx) {
      const target = await resolveExisting(ctx.workspaceRoot, requireString(input.path, "path"));
      const info = await stat(target);
      if (!info.isFile()) throw new Error("O caminho não é um arquivo.");
      const limit = clampNumber(input.maxBytes, 1, MAX_READ_BYTES, MAX_READ_BYTES);
      const buffer = await readFile(target);
      const slice = buffer.subarray(0, limit);
      if (slice.includes(0)) throw new Error("O arquivo parece ser binário.");
      return {
        path: relative(ctx.workspaceRoot, target).replace(/\\/g, "/"),
        content: slice.toString("utf8"),
        truncated: buffer.length > limit,
        bytes: buffer.length,
      };
    },
  },
  {
    risk: "read",
    spec: {
      name: "fs.search",
      description: "Busca texto literal em arquivos do workspace (ignora pastas de build).",
      inputSchema: objectSchema(
        {
          query: { type: "string", description: "Texto a procurar." },
          path: { type: "string", description: "Pasta inicial relativa ao workspace." },
          maxResults: { type: "number", description: "Máximo de resultados (1-200)." },
        },
        ["query"],
      ),
    },
    async run(input, ctx) {
      const query = requireString(input.query, "query");
      const start = await resolveExisting(ctx.workspaceRoot, asString(input.path) || ".");
      const limit = clampNumber(input.maxResults, 1, 200, 50);
      const matches: Array<{ path: string; line: number; text: string }> = [];

      const walk = async (dir: string, depth: number): Promise<void> => {
        if (matches.length >= limit || depth > 8) return;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (matches.length >= limit) return;
          if (entry.isSymbolicLink()) continue;
          const full = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            await walk(full, depth + 1);
            continue;
          }
          if (!entry.isFile()) continue;
          const info = await stat(full);
          if (info.size > 2_000_000) continue;
          const buffer = await readFile(full);
          if (buffer.includes(0)) continue;
          const lines = buffer.toString("utf8").split(/\r?\n/);
          for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index] ?? "";
            if (line.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                path: relative(ctx.workspaceRoot, full).replace(/\\/g, "/"),
                line: index + 1,
                text: line.trim().slice(0, 400),
              });
              if (matches.length >= limit) return;
            }
          }
        }
      };

      await walk(start, 0);
      return { query, matches, truncated: matches.length >= limit };
    },
  },
  {
    risk: "write",
    spec: {
      name: "fs.write",
      description: "Cria ou sobrescreve um arquivo de texto dentro do workspace.",
      inputSchema: objectSchema(
        {
          path: { type: "string", description: "Caminho relativo ao workspace." },
          content: { type: "string", description: "Conteúdo completo do arquivo." },
        },
        ["path", "content"],
      ),
    },
    async run(input, ctx) {
      const target = resolveInside(ctx.workspaceRoot, requireString(input.path, "path"));
      const content = requireString(input.content, "content", true);
      await mkdir(dirname(target), { recursive: true });
      const existed = await stat(target).then(
        () => true,
        () => false,
      );
      await writeFile(target, content, "utf8");
      return {
        path: relative(ctx.workspaceRoot, target).replace(/\\/g, "/"),
        bytes: Buffer.byteLength(content, "utf8"),
        overwritten: existed,
      };
    },
  },
  {
    risk: "write",
    spec: {
      name: "fs.mkdir",
      description: "Cria uma pasta dentro do workspace.",
      inputSchema: objectSchema(
        { path: { type: "string", description: "Caminho relativo ao workspace." } },
        ["path"],
      ),
    },
    async run(input, ctx) {
      const target = resolveInside(ctx.workspaceRoot, requireString(input.path, "path"));
      await mkdir(target, { recursive: true });
      return { path: relative(ctx.workspaceRoot, target).replace(/\\/g, "/"), created: true };
    },
  },
  {
    risk: "write",
    destructive: true,
    spec: {
      name: "fs.delete",
      description: "Remove um arquivo ou pasta do workspace. Sempre pede confirmação.",
      inputSchema: objectSchema(
        { path: { type: "string", description: "Caminho relativo ao workspace." } },
        ["path"],
      ),
    },
    async run(input, ctx) {
      const target = await resolveExisting(ctx.workspaceRoot, requireString(input.path, "path"));
      if (relative(ctx.workspaceRoot, target) === "") {
        throw new Error("Recusado: não é permitido apagar a raiz do workspace.");
      }
      await rm(target, { recursive: true, force: false });
      return { path: relative(ctx.workspaceRoot, target).replace(/\\/g, "/"), removed: true };
    },
  },
  {
    risk: "exec",
    spec: {
      name: "shell.run",
      description:
        "Executa um comando de shell dentro do workspace e devolve código de saída, stdout e stderr.",
      inputSchema: objectSchema(
        {
          command: { type: "string", description: "Comando completo a executar." },
          cwd: { type: "string", description: "Diretório de trabalho relativo ao workspace." },
          timeoutMs: { type: "number", description: "Tempo limite em ms (máx. 300000)." },
        },
        ["command"],
      ),
    },
    async run(input, ctx) {
      const command = requireString(input.command, "command");
      const cwd = await resolveExisting(ctx.workspaceRoot, asString(input.cwd) || ".");
      const timeoutMs = clampNumber(input.timeoutMs, 1000, 300_000, 30_000);
      return runShell(command, cwd, timeoutMs, ctx.signal);
    },
  },
];

const BY_NAME = new Map(BUILTINS.map((tool) => [tool.spec.name, tool]));

export class ToolRegistry {
  specs(): ToolSpec[] {
    return BUILTINS.map((tool) => tool.spec);
  }

  descriptors(enabled: Map<string, boolean>): ToolDescriptor[] {
    return BUILTINS.map((tool) => ({
      ...tool.spec,
      risk: tool.risk,
      destructive: tool.destructive ?? false,
      enabled: enabled.get(tool.spec.name) ?? true,
      source: "builtin" as const,
    }));
  }

  has(name: string): boolean {
    return BY_NAME.has(name);
  }

  async execute(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const started = Date.now();
    const tool = BY_NAME.get(name);
    if (!tool) {
      return {
        callId: "",
        ok: false,
        output: null,
        error: `Ferramenta desconhecida: ${name}`,
        durationMs: 0,
      };
    }

    try {
      const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
      const output = await tool.run(record, ctx);
      return { callId: "", ok: true, output, error: null, durationMs: Date.now() - started };
    } catch (error) {
      return {
        callId: "",
        ok: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

function resolveInside(root: string, target: string): string {
  const resolvedRoot = resolve(root);
  const resolved = isAbsolute(target) ? resolve(target) : resolve(resolvedRoot, target);
  const rel = relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Caminho fora do workspace autorizado.");
  }
  return resolved;
}

async function resolveExisting(root: string, target: string): Promise<string> {
  const resolved = resolveInside(root, target);
  const real = await realpath(resolved);
  return resolveInside(await realpath(resolve(root)), real);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function requireString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`O campo "${field}" é obrigatório.`);
  }
  return value;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill();
    }, timeoutMs);

    const onAbort = (): void => {
      child.kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-200_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-200_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolvePromise({
        code,
        stdout,
        stderr,
        timedOut: killedByTimeout,
        cwd,
      });
    });
  });
}
