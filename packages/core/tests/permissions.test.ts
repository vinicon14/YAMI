import { describe, expect, it } from "vitest";
import { PermissionEngine, type PermissionScope } from "../src/permissions";

const engine = new PermissionEngine();
const root = "C:\\YAMI\\workspace";

const scope = (access: PermissionScope["access"], extraRoots?: string[]): PermissionScope => ({
  access,
  workspaceRoot: root,
  extraRoots,
});

describe("PermissionEngine", () => {
  it("permite leitura dentro do workspace em qualquer nível", () => {
    for (const access of ["restricted", "workspace", "full"] as const) {
      expect(
        engine.evaluate(scope(access), { name: "fs.read", risk: "read", path: `${root}\\a.txt` }),
      ).toBe("allow");
    }
  });

  it("nega escrita fora das raízes autorizadas", () => {
    expect(
      engine.evaluate(scope("full"), { name: "fs.write", risk: "write", path: "C:\\Windows\\x.dll" }),
    ).toBe("deny");
  });

  it("nega escrita para agente restrito mesmo dentro do workspace", () => {
    expect(
      engine.evaluate(scope("restricted"), { name: "fs.write", risk: "write", path: `${root}\\a.txt` }),
    ).toBe("deny");
  });

  it("pede confirmação para execução em nível workspace", () => {
    expect(engine.evaluate(scope("workspace"), { name: "shell.run", risk: "exec" })).toBe("ask");
  });

  it("pede confirmação para ação destrutiva mesmo com acesso total", () => {
    expect(
      engine.evaluate(scope("full"), {
        name: "fs.remove",
        risk: "write",
        path: `${root}\\a.txt`,
        destructive: true,
      }),
    ).toBe("ask");
  });

  it("respeita raízes extras autorizadas (pendrive)", () => {
    expect(
      engine.evaluate(scope("workspace", ["E:\\"]), {
        name: "fs.write",
        risk: "write",
        path: "E:\\projetos\\nota.md",
      }),
    ).toBe("allow");
  });

  it("rejeita caminho relativo", () => {
    expect(
      engine.evaluate(scope("full"), { name: "fs.read", risk: "read", path: "..\\..\\etc\\passwd" }),
    ).toBe("deny");
  });
});
