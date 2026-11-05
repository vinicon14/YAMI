import type { AccessLevel, PermissionDecision, ToolRisk } from "@yami/contracts";
import { isAbsolute, relative, resolve } from "node:path";

export interface PermissionScope {
  access: AccessLevel;
  workspaceRoot: string;
  /** Raízes extras autorizadas pelo proprietário (ex.: unidade do pendrive). */
  extraRoots?: string[];
}

export interface ToolRequest {
  name: string;
  risk: ToolRisk;
  /** Caminho alvo, quando o risco for `write` ou `read`. */
  path?: string;
  /** Ação irreversível (apagar, formatar, encerrar processo). */
  destructive?: boolean;
}

/**
 * Motor de permissões determinístico.
 *
 * Regras: nada é concedido por padrão; acesso a disco é sempre limitado a raízes
 * explícitas; ações destrutivas pedem confirmação mesmo em nível `full`.
 */
export class PermissionEngine {
  evaluate(scope: PermissionScope, request: ToolRequest): PermissionDecision {
    if (request.destructive) return "ask";

    if ((request.risk === "read" || request.risk === "write") && request.path) {
      if (!this.isInsideAllowedRoot(scope, request.path)) return "deny";
      if (request.risk === "write" && scope.access === "restricted") return "deny";
    }

    switch (scope.access) {
      case "restricted":
        return request.risk === "read" ? "allow" : "ask";
      case "workspace":
        if (request.risk === "read" || request.risk === "write") return "allow";
        return "ask";
      case "full":
        return "allow";
    }
  }

  private isInsideAllowedRoot(scope: PermissionScope, target: string): boolean {
    const resolvedTarget = isAbsolute(target)
      ? resolve(target)
      : resolve(scope.workspaceRoot, target);
    const roots = [scope.workspaceRoot, ...(scope.extraRoots ?? [])];
    return roots.some((root) => {
      const rel = relative(resolve(root), resolvedTarget);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    });
  }
}
