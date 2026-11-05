# PROGRESS

Registro cronológico com evidência. Não é changelog: aqui ficam decisões de execução, obstáculos e verificações.

## 05/11/2026 — Fase 1: investigação

- OpenBot 0.59.0 identificado em `%LOCALAPPDATA%\Programs\OpenBot`.
- `app.asar` (393.502.051 bytes, SHA-256 `bbe708…5c5d`) inspecionado com REA 6.7.0.
- Evidence `ev_c0dbd4c7b003d21c0c32fd77b54694636304137f5bccd2c3a0211782d2d70f94`; grafo com 33.303 nós, 35.145 ocorrências e 35.144 arestas; zero contradições de integridade.
- Banco `%APPDATA%\OpenBot\openbot.db` lido em modo somente-leitura: 78 tabelas, 43 migrations, 2.417 eventos de orquestração.
- Documentação oficial baixada (7 documentos, ~380 KB).
- VoiceStudio 0.5.6 detectado; backend HTTP em `127.0.0.1:3900` estava offline.
- Hardware: i5-13420H, 15,6 GB, Intel UHD; Windows 11 build 26300.

## 05/11/2026 — Fase 1: arquitetura

- Stack aprovada: Electron + React + TypeScript.
- Persistência definida como `node:sqlite`, validada no Node 24.19 (`DatabaseSync`, `exec`, `prepare().run/get/all`).
- Monorepo definido: `contracts` → `core` → `desktop`.
- Modelo de eventos, motor de permissões e isolamento do renderer documentados.

## 05/11/2026 — M0: implementação

Criado:

- `packages/contracts/src/index.ts` — 8 tipos de evento, agente, provedor, risco, permissão e `YamiBridge`.
- `packages/core/src/db.ts` — migrations versionadas com WAL e transação.
- `packages/core/src/events.ts` — append e leitura paginada.
- `packages/core/src/agents.ts` — criação/lista/obtenção/remoção.
- `packages/core/src/permissions.ts` — decisão determinística.
- `apps/desktop` — main, preload, renderer React, CSS, Vite.
- `packages/core/tests` — 10 testes.

## 05/11/2026 — M0: verificação

Problemas encontrados e corrigidos:

1. `@types/node` ausente em `apps/desktop` → adicionado.
2. Aviso do Vite sobre `__dirname` em config CommonJS → arquivo renomeado para `vite.config.mts` e uso de `import.meta.dirname`.
3. pnpm 10 não executa `postinstall` do Electron por padrão → `pnpm.onlyBuiltDependencies: ["electron"]`.
4. **Electron 45.2.3 crashava o renderer** nesta máquina: `ERR_FAILED (-2)` até em `about:blank`, exceção `0x80000003`. Testado com `--disable-gpu`, `--no-sandbox` e `--single-process`, todos falharam. Electron 42.11.18 funcionou no mesmo teste. Versão fixada em 42.11.18.

Saída final:

```
pnpm build      → contracts, core, renderer e electron OK
pnpm typecheck  → 3 projetos OK
pnpm test       → 2 arquivos, 10 testes aprovados
pnpm smoke      → {"title":"YAMI","brand":"YAMI","navItems":6,"bridge":true,"agents":0,"events":0}
```

O smoke abre o Electron real, carrega o renderer, atravessa o preload, chama o IPC e abre o SQLite em `%APPDATA%\@yami\desktop\yami.db` (49.152 bytes).

## 05/11/2026 — Documentação

Criados os 8 documentos de `docs/` e os arquivos de acompanhamento. Todos os números citados vêm da inspeção registrada em `docs/ANALISE_REA.md` e das contagens do SQLite.

## Pendências

- Push para `origin/main` bloqueado: `gh` com token inválido; é necessário `gh auth login` ou PAT.
- Validação real de voz depende do VoiceStudio online (M4).
