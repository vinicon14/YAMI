# TASKS

Checklist vivo. `[x]` = verificado com evidência; `[ ]` = pendente.

## M0 — Fundação ✅

- [x] Criar repositório e workspace pnpm
- [x] `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.nvmrc`
- [x] `packages/contracts`: schemas zod + tipos + `YamiBridge`
- [x] `packages/core`: `db.ts` com migrations
- [x] `packages/core`: `EventStore` (append + leitura)
- [x] `packages/core`: `AgentService` (criar, listar, obter, remover)
- [x] `packages/core`: `PermissionEngine` (raízes, risco, destrutivo)
- [x] Testes de permissões (7 casos)
- [x] Testes de event store e agentes (3 casos)
- [x] `apps/desktop`: main com IPC `agents:list`, `agents:create`, `events:recent`
- [x] `apps/desktop`: preload isolado com `contextBridge`
- [x] `apps/desktop`: renderer React com visão geral e agentes
- [x] `apps/desktop`: CSS próprio, tema escuro
- [x] Smoke E2E do Electron (`--yami-smoke`)
- [x] `pnpm build` verde
- [x] `pnpm typecheck` verde
- [x] `pnpm test` verde (10 testes)
- [x] `pnpm smoke` verde
- [x] Documentação da Fase 1 (8 docs)
- [x] README, ROADMAP, TASKS, PROGRESS, DECISIONS, CHANGELOG
- [x] Workflow de CI
- [x] Commit e push para `origin/main` (commit `47fb82f`)

## M1 — Núcleo confiável ⏳

- [ ] CRUD completo de agente (editar/remover com confirmação)
- [ ] Threads e mensagens com paginação
- [ ] Fila de tarefas por thread (um turno por vez)
- [ ] Sessões de turno e estados observáveis
- [ ] Auditoria encadeada com verificação de integridade
- [ ] Painel de permissões (concessões, negações, histórico)
- [ ] Reconstrução de projeções a partir do log (`rebuild`)
- [ ] Teste de equivalência log ↔ projeção
- [ ] Cobertura de `packages/core` ≥ 80%
- [ ] Smoke cobrindo criação de agente e listagem após reinício

## M2 — Provedores e conversa real

- [ ] Contrato de adaptador com capabilities
- [ ] Adaptador HTTP OpenAI-compatible com streaming
- [ ] Adaptador CLI/ACP com detecção de instalação
- [ ] Adaptador local (Ollama)
- [ ] Cofre de credenciais (`safeStorage`/DPAPI)
- [ ] Painel de provedores (conectar, testar, desconectar)
- [ ] Uso e custo por turno
- [ ] Fallback de modelo com política explícita
- [ ] Retomada de sessão (`resume_cursor`)
- [ ] Testes com fixtures de streaming

## M3 — Ferramentas, MCP e computador

- [ ] Ferramentas de arquivo sob permissão
- [ ] Execução de shell com política por comando
- [ ] Integração cua-driver com aprovação
- [ ] Cliente MCP stdio
- [ ] Cliente MCP HTTP
- [ ] Modal de aprovação com risco e escopo
- [ ] Acessibilidade: teclado e contraste AA

## M4 — Memória e voz

- [ ] Memória por agente com origem e turno
- [ ] Busca FTS5
- [ ] Seleção de memórias para contexto
- [ ] Editar/esquecer memória
- [ ] Detectar VoiceStudio em `127.0.0.1:3900`
- [ ] STT com streaming
- [ ] TTS com streaming
- [ ] Wake word
- [ ] VAD
- [ ] Barge-in
- [ ] Estado de voz na UI
- [ ] Comportamento honesto com backend offline

## M5 — Rotinas e skills

- [ ] Rotina agendada por agente
- [ ] Políticas de atraso e limite
- [ ] Biblioteca de skills local
- [ ] Catálogo curado de conectores

## M6 — Fluxos entre agentes

- [ ] Encadeamento de agentes
- [ ] Gatilho manual
- [ ] Gatilho agendado
- [ ] Visualização de execução por etapa
- [ ] Webhooks com idempotência e revogação

## M7 — Distribuição

- [ ] Instalador NSIS
- [ ] Modo portátil em pendrive
- [ ] Backup e restauração
- [ ] Exportar/importar agente
- [ ] Avisos de licenças de terceiros
- [ ] Assinatura de código (quando houver certificado)

## Backlog técnico

- [ ] Investigar crash do Electron 45 nesta máquina (issue upstream?)
- [ ] Compactação/retensão do log de eventos
- [ ] Telemetria local opt-in (nunca por padrão)
- [ ] Perfil de desempenho com 10k eventos
- [ ] Testes de recuperação após corrupção do SQLite
