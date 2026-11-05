# DECISIONS

ADRs curtos. Cada decisão registra contexto, escolha e consequência.

## ADR-001 — Monorepo com pnpm workspaces

**Data:** 05/11/2026
**Contexto:** contratos, núcleo e app precisam compartilhar tipos sem publicar pacotes.
**Decisão:** monorepo com `packages/*` e `apps/*`, dependências `workspace:*`.
**Consequência:** build em ordem (`pnpm -r build`), versão única de TypeScript e testes por pacote.

## ADR-002 — Electron + React + TypeScript

**Data:** 05/11/2026
**Contexto:** precisa de desktop Windows com acesso a disco, processos e UI rica.
**Alternativas:** Tauri 2 (Rust), Neutralino, app web local.
**Decisão:** Electron + React + TypeScript.
**Consequência:** binário maior, mas runtime uniforme, `node:sqlite` disponível e ecossistema maduro.

## ADR-003 — `node:sqlite` em vez de módulo nativo

**Data:** 05/11/2026
**Contexto:** persistência local sem exigir toolchain C++ no build e no empacotamento.
**Alternativas:** `better-sqlite3`, `sql.js`, arquivos JSON.
**Decisão:** `node:sqlite` (`DatabaseSync`), embutido no Node 24 do Electron 42.
**Consequência:** sem rebuild por versão de Electron; API experimental, coberta por testes. Migrar para `better-sqlite3` só se faltar recurso.

## ADR-004 — Fixar Electron 42.11.18

**Data:** 05/11/2026
**Contexto:** Electron 45.2.3 (Chromium 156) crasha o processo de renderização nesta máquina (Windows 11 build 26300): `ERR_FAILED (-2)` em `about:blank`, exceção `0x80000003`. Reproduzido com `--disable-gpu`, `--no-sandbox` e `--single-process`. Electron 42.11.18 (Chromium 148, Node 24.19) funciona.
**Decisão:** fixar `electron@42.11.18` até investigação do upstream.
**Consequência:** `node:sqlite` continua disponível; revisar quando houver correção. Registrar a investigação no backlog.

## ADR-005 — Event sourcing com projeções

**Data:** 05/11/2026
**Contexto:** auditoria, retomada e reconstrução de estado são requisitos.
**Decisão:** `events` é a fonte de verdade append-only; `agents`, `messages` e futuras projeções guardam `last_event_sequence`.
**Consequência:** escrita um pouco maior e necessidade de `rebuild()`; em troca, histórico completo e auditoria confiável.

## ADR-006 — Permissões: negar por padrão

**Data:** 05/11/2026
**Contexto:** agentes executam ferramentas no computador do usuário.
**Decisão:** motor determinístico; nada é permitido por padrão; acesso a disco só em raízes explícitas; ação destrutiva sempre pede confirmação, inclusive em `full`.
**Consequência:** mais atrito para o usuário, menos risco de dano silencioso. Toda decisão vai para `audit_log`.

## ADR-007 — VoiceStudio por HTTP, em processo separado

**Data:** 05/11/2026
**Contexto:** VoiceStudio é AGPL-3.0; o YAMI pode ser comercial.
**Decisão:** integração exclusivamente por HTTP local (`127.0.0.1:3900`) e MCP; sem linkagem ou cópia de código.
**Consequência:** usuário precisa do VoiceStudio instalado para voz; o YAMI detecta e mostra indisponibilidade sem simular.

## ADR-008 — Sem código do OpenBot

**Data:** 05/11/2026
**Contexto:** OpenBot é PolyForm Noncommercial 1.0.0 e o YAMI pode ter uso comercial.
**Decisão:** referência apenas funcional. Nenhum código, asset, texto de UI ou schema copiado. Schema do YAMI escrito a partir de requisitos.
**Consequência:** mais trabalho de design, risco jurídico eliminado.

## ADR-009 — Main/preload em CommonJS, renderer em ESM

**Data:** 05/11/2026
**Contexto:** Electron main carrega CommonJS por padrão; Vite produz ESM.
**Decisão:** `tsconfig.electron.json` compila para CommonJS; renderer usa ESM via Vite; config do Vite em `.mts`.
**Consequência:** sem `"type": "module"` no app, evitando conflito com `main` CJS.

## ADR-010 — Licença `UNLICENSED` até definição de distribuição

**Data:** 05/11/2026
**Contexto:** ainda não há decisão sobre produto comercial ou aberto.
**Decisão:** manter `UNLICENSED` (todos os direitos reservados).
**Consequência:** nenhuma permissão implícita; revisar antes de publicar.
