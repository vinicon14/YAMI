# Arquitetura proposta do YAMI

Status: **aprovada para o marco M0** (05/11/2026)
Escopo deste documento: decisões estruturais que valem para todos os marcos. Detalhes de implementação vivem no código e nos ADRs em `DECISIONS.md`.

## 1. Objetivo

Construir um assistente pessoal de IA **local-first**, com:

- múltiplos agentes com instruções, workspace e memória próprios;
- múltiplos provedores de modelo (HTTP, CLI/ACP, runtime local);
- controle do computador com permissões explícitas;
- voz contínua com wake word, VAD e interrupção;
- instalador desktop e execução a partir de pendrive.

O YAMI **não** é um fork do OpenBot. A referência é funcional: o inventário em `docs/INVENTARIO_FUNCIONALIDADES.md` descreve o que o produto de referência faz, e cada item recebeu decisão própria.

## 2. Não-objetivos (por enquanto)

- Canais de mensageria (Slack, Discord, Telegram) e apps mobile.
- Editor visual de workflow com nós e arestas.
- Marketplace público de plugins.
- Sincronização em nuvem e conta de usuário.
- Suporte a macOS/Linux no primeiro ciclo (o código evita dependências exclusivas, mas o alvo é Windows).

## 3. Princípios

1. **Event log é a verdade.** Todo estado relevante nasce de um evento imutável; projeções podem ser reconstruídas.
2. **Permissão antes de execução.** Nenhuma ferramenta roda sem decisão determinística e auditável.
3. **Provedor é adaptador.** Nenhum provedor fala com a UI; todos normalizam para os contratos de `@yami/contracts`.
4. **Falha explícita.** Nada é exibido como funcional antes de existir implementação e teste.
5. **Local-first.** Dados ficam no disco do usuário; rede só quando o provedor exige.
6. **Superfície mínima.** O renderer não tem Node; o preload expõe uma API estreita.

## 4. Stack

| Camada | Escolha | Versão | Alternativas avaliadas | Motivo |
| --- | --- | --- | --- | --- |
| Shell desktop | Electron | **42.11.18** | Tauri 2, Neutralino | Chromium garante `node:sqlite`, Web APIs e comportamento uniforme; Tauri exigiria Rust no caminho crítico |
| UI | React | 19.3.1 | Solid, Svelte | Ecossistema, tipagem, familiaridade |
| Build | Vite | 8.3.6 | esbuild puro | HMR e build de renderer maduros |
| Linguagem | TypeScript | 5.9.3 | — | Contratos compartilhados entre main, preload e renderer |
| Validação | zod | 4.6.7 | valibot | Schemas + inferência de tipos no mesmo lugar |
| Persistência | `node:sqlite` (`DatabaseSync`) | Node 24.19 | better-sqlite3 | Sem módulo nativo para compilar/empacotar; já vem no runtime do Electron |
| Testes | Vitest | 5.1.0 | Jest | Rápido, ESM nativo, mesma API |
| Workspace | pnpm | 10.28.2 | npm workspaces | Instalação eficiente e `workspace:*` explícito |

### Por que Electron 42 e não 45

Electron 45.2.3 (Chromium 156) **crashava o processo de renderização** nesta máquina (Windows 11 build 26300), com exceção `0x80000003` e `ERR_FAILED (-2)` até em `about:blank`. O mesmo código funciona em 42.11.18 (Chromium 148, Node 24.19). A versão foi fixada em 42.11.18 até que o problema seja investigado a fundo. Ver `DECISIONS.md` (ADR-004).

## 5. Estrutura do monorepo

```
YAMI/
├─ packages/
│  ├─ contracts/        # schemas zod + tipos + interface do bridge
│  └─ core/             # SQLite, event store, agentes, permissões
├─ apps/
│  └─ desktop/          # Electron main + preload + renderer React
├─ docs/
└─ .github/workflows/
```

Regra de dependência: `desktop → core → contracts`. `contracts` não depende de nada além de `zod`.

## 6. Runtime

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (sandbox, sem Node)                                 │
│  React 19 · estado local · sem acesso direto a disco         │
└───────────────▲──────────────────────────────────────────────┘
                │ window.yami (contextBridge)
┌───────────────┴──────────────────────────────────────────────┐
│ Preload (isolado)                                            │
│  superfície estreita: agents.list/create, events.recent      │
└───────────────▲──────────────────────────────────────────────┘
                │ ipcMain.handle (canais tipados)
┌───────────────┴──────────────────────────────────────────────┐
│ Main (Node 24)                                               │
│  AgentService · EventStore · PermissionEngine · Providers     │
│  Voice bridge (HTTP) · Tool runtime (fs/shell/UI)             │
└───────────────▲──────────────────────────────────────────────┘
                │ node:sqlite (WAL)
┌───────────────┴──────────────────────────────────────────────┐
│ yami.db                                                      │
│  events (append-only) · agents · messages · audit_log        │
│  schema_migrations                                           │
└──────────────────────────────────────────────────────────────┘
```

Componentes externos, sempre em processo separado:

- **VoiceStudio** (`127.0.0.1:3900`, AGPL) — STT/TTS via HTTP/MCP. O YAMI fala com ele por rede local, nunca linkando código.
- **cua-driver** (MIT) — automação de GUI; pode ser empacotado com atribuição.
- **Provedores** — HTTP direto, ou CLIs instaladas pelo usuário (ACP), ou runtime local (Ollama etc.).

## 7. Modelo de eventos

Tipos iniciais em `packages/contracts`:

| Evento | Campos essenciais |
| --- | --- |
| `turn.started` | `agentId`, `providerId`, `modelId` |
| `message.delta` | `messageId`, `text` |
| `tool.call` | `call {id,name,risk,input}`, `decision` |
| `tool.result` | `callId`, `ok`, `output` |
| `usage` | `inputTokens`, `outputTokens`, `costUsd?` |
| `turn.completed` | `messageId` |
| `turn.failed` | `error` |
| `voice.state` | `state` (`idle`…`error`) |

Regras:

- `id` e `at` são gerados na origem; `sessionId` agrupa um turno.
- Eventos são imutáveis; correção é um novo evento.
- Projeções guardam `last_event_sequence` para reconstrução incremental.
- O log é gravado antes de a UI receber o delta (write-ahead).

## 8. Modelo de dados (M0, implementado)

| Tabela | Papel |
| --- | --- |
| `events` | log append-only (`seq`, `id`, `type`, `session_id`, `payload`, `created_at`) |
| `agents` | projeção de agente (nome, instruções, workspace, provedor/modelo, acesso) |
| `messages` | projeção de mensagens por thread |
| `audit_log` | decisões de permissão e ações sensíveis |
| `schema_migrations` | versão aplicada |

`PRAGMA journal_mode = WAL` e `foreign_keys = ON`. Migrations rodam em transação e falham de forma atômica.

## 9. Motor de permissões

Entrada: `PermissionScope { access, workspaceRoot, extraRoots }` + `ToolRequest { name, risk, path?, destructive? }`.

| Situação | `restricted` | `workspace` | `full` |
| --- | --- | --- | --- |
| Leitura dentro de raiz autorizada | allow | allow | allow |
| Leitura fora de raiz | deny | deny | deny |
| Escrita dentro de raiz | deny | allow | allow |
| Escrita fora de raiz | deny | deny | deny |
| Execução de shell | ask | ask | allow |
| Ação destrutiva (`destructive: true`) | ask | ask | **ask** |
| Caminho relativo | deny | deny | deny |

Invariantes:

- Nada é permitido por padrão.
- Raízes autorizadas são explícitas; o pendrive entra como `extraRoots`.
- Ação destrutiva nunca é silenciosa, nem em `full`.
- Toda decisão `ask`/`deny` vai para `audit_log`.

## 10. Contrato de provedor

```ts
interface ProviderDescriptor {
  id: string;
  name: string;
  kind: "http" | "acp" | "cli" | "local";
  auth: "none" | "api-key" | "oauth" | "cli-login";
  baseUrl?: string;
  models: string[];
  connected: boolean;
}
```

Um adaptador deve:

1. declarar capabilities (streaming, tools, visão, áudio);
2. normalizar deltas em `message.delta`;
3. reportar uso em `usage`;
4. nunca lançar erro cru para a UI — falha vira `turn.failed` com mensagem legível;
5. persistir `external_session_id`/`resume_cursor` quando o provedor permitir retomada.

## 11. Voz (M4)

Pipeline:

```
microfone → VAD → STT (VoiceStudio) → turno do agente → TTS (stream) → alto-falante
                     ▲                                   │
                     └──────── interrupção (barge-in) ◄──┘
```

- Wake word local, sem enviar áudio para a nuvem.
- `voice.state` reflete o pipeline na UI.
- Interrupção cancela o stream de TTS e marca o turno como `interrupted`.
- Se o VoiceStudio estiver offline, a UI mostra o estado real; não há simulação.

## 12. Segurança

| Risco | Mitigação |
| --- | --- |
| Renderer comprometido | `contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP restritiva |
| Ferramenta maliciosa | motor de permissões + auditoria + confirmação para destrutivo |
| Credencial em texto puro | armazenamento no cofre do SO (a implementar no M2); nunca no SQLite |
| Prompt injection vindo de página/arquivo | conteúdo externo é dado, não instrução; ferramentas de risco exigem decisão |
| Vazamento entre agentes | workspace e raízes por agente; sem raiz global implícita |
| Código AGPL no binário | VoiceStudio só por HTTP/MCP, em processo separado |

## 13. Distribuição

- **Instalador**: `electron-builder` (NSIS) no M7, com assinatura quando houver certificado.
- **Pendrive**: build portátil (`--dir` + launcher), dados em `data/` ao lado do executável quando `YAMI_PORTABLE=1`.
- **Atualizações**: desativadas por padrão até existir canal assinado.

## 14. Testes

| Nível | Ferramenta | Cobertura mínima |
| --- | --- | --- |
| Unidade | Vitest | permissões, event store, agentes, schemas |
| Integração | Vitest + SQLite em memória | migrations, projeções, auditoria |
| Ponta a ponta | `pnpm smoke` (Electron real) | renderer carrega, preload expõe bridge, IPC abre o banco |
| Manual | checklist por marco | fluxos de UI e voz |

Regra: um marco só fecha quando `pnpm build`, `pnpm typecheck`, `pnpm test` e `pnpm smoke` passam.

## 15. Metas de desempenho (M0–M2)

- Abertura da janela: < 2 s em SSD.
- Listagem de 200 agentes: < 50 ms.
- Append de evento: < 5 ms (WAL).
- Memória residente em repouso: < 300 MB.
- Build completo: < 60 s.

## 16. Questões abertas

1. Qual cofre de credenciais usar no Windows (DPAPI direto vs `safeStorage` do Electron)?
2. Como representar tool calls parciais/streaming sem inflar o log?
3. Limite de retenção do log de eventos (compactação por snapshot?).
4. Estratégia de fallback entre provedores: por erro, por custo ou manual?
5. Modelo local viável no i5-13420H sem GPU dedicada (3B–8B Q4) — validar no M2.

## 17. Registro de aprovação

- 05/11/2026 — stack Electron + React + TypeScript aprovada pelo proprietário.
- 05/11/2026 — prioridade do MVP: agentes e provedores antes de voz.
- 05/11/2026 — M0 implementado e verificado (`build`, `typecheck`, `test`, `smoke`).
