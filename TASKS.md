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

## M1 — Núcleo confiável ✅

- [x] CRUD completo de agente (criar, editar, remover com confirmação)
- [x] Threads e mensagens com paginação
- [x] Fila de tarefas por thread (um turno por vez)
- [x] Sessões de turno e estados observáveis (turn.started/completed/failed)
- [x] Auditoria encadeada com verificação de integridade
- [x] Painel de permissões (aprovações, concessões de sessão, histórico)
- [x] Reconstrução de projeções a partir do log (rebuild via db.ts)
- [x] Cobertura de `packages/core` (25 testes, 5 arquivos)
- [x] Smoke cobrindo renderer, preload, IPC e SQLite

## M2 — Provedores e conversa real ✅

- [x] Contrato de adaptador com capabilities
- [x] Adaptador HTTP OpenAI-compatible com streaming (SSE)
- [x] Adaptador HTTP Anthropic (Messages API)
- [x] Adaptador CLI/ACP com detecção de instalação
- [x] Cofre de credenciais (AES-256-GCM em arquivo separado)
- [x] Painel de provedores (conectar, testar, desconectar)
- [x] Uso e custo por turno (UsageEvent)
- [x] Fallback de modelo com política explícita
- [x] Retomada de sessão (resume_cursor)
- [x] Testes com fixtures de streaming (providers.test.ts)

## M3 — Ferramentas, MCP e computador ✅

- [x] Ferramentas de arquivo sob permissão (read/write/mkdir/delete/search)
- [x] Execução de shell com política por comando (deny/ask/allow)
- [x] Cliente MCP stdio
- [x] Cliente MCP HTTP
- [x] Modal de aprovação com risco e escopo
- [ ] Integração cua-driver com aprovação (backlog)
- [ ] Acessibilidade: teclado e contraste AA (parcial)

## M4 — Memória e voz ✅

- [x] Memória por agente com origem e turno
- [x] Busca FTS5
- [x] Seleção de memórias para contexto
- [x] Editar/esquecer memória (remover)
- [x] Detectar VoiceStudio em `127.0.0.1:3900`
- [x] STT com transcrição
- [x] TTS com fallback offline (speechSynthesis)
- [x] Estado de voz na UI
- [x] Comportamento honesto com backend offline
- [ ] Wake word (backlog)
- [ ] VAD (backlog)
- [ ] Barge-in (backlog)
- [ ] TTS/STT streaming (backlog)

## IA local — fallback offline ✅

- [x] Instalador de llama.cpp + GGUF (download, extração, verificação SHA-256)
- [x] Catálogo de modelos (Qwen 0.5B / 1.5B)
- [x] Supervisor de processo (start/stop/status/health)
- [x] Integração com orquestrador como fallback (texto apenas, sem ferramentas)
- [x] UI de instalação com progresso em tempo real
- [ ] Validação real do download (~400 MB) — pendente de execução manual

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
