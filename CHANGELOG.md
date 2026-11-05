# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico a partir de 0.1.0.

## [0.1.0] — 2026-11-05

### Adicionado

- Monorepo pnpm com `packages/contracts`, `packages/core` e `apps/desktop`.
- Contratos canônicos com zod: eventos de turno, mensagem, ferramenta, uso e voz; agente; provedor; risco; decisão de permissão; `YamiBridge`.
- Persistência SQLite via `node:sqlite` com migrations versionadas, WAL e transações.
- `EventStore` append-only com leitura paginada por sessão.
- `AgentService` para criar, listar, obter e remover agentes.
- `PermissionEngine` determinístico: raízes autorizadas, negação fora do escopo, confirmação de ação destrutiva e suporte a raízes extras (pendrive).
- Shell Electron com IPC tipado (`agents:list`, `agents:create`, `events:recent`), preload isolado, `sandbox`, `contextIsolation` e CSP restritiva.
- Interface React com visão geral, criação/listagem de agentes e painéis explicitamente marcados como planejados.
- Tema escuro próprio em CSS, sem kit visual de terceiros.
- Smoke E2E (`pnpm smoke`) que abre o Electron real e valida renderer, preload, IPC e SQLite.
- 10 testes de unidade/integração.
- Documentação da Fase 1: referências, análise REA, inventário funcional, arquitetura, requisitos, plano, dependências e licenciamento.
- README, ROADMAP, TASKS, PROGRESS, DECISIONS e workflow de CI.

### Alterado

- Electron fixado em **42.11.18** (o 45.2.3 crashava o renderer nesta máquina; ver ADR-004).
- Config do Vite renomeada para `vite.config.mts` e uso de `import.meta.dirname`.

### Segurança

- Renderer sem acesso a Node.
- Nenhuma credencial persistida nesta versão.
- Ações destrutivas exigem confirmação no motor de permissões.

### Conhecido

- Voz ainda não integrada (marco M4).
- Provedores ainda não implementados (marco M2).
