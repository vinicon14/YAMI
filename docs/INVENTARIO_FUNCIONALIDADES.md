# Inventário funcional (derivado de evidência)

Este documento lista o que o OpenBot **faz**, segundo três fontes independentes: o schema do banco local, os diretórios de recursos instalados e a documentação oficial. Nenhum item aqui é copiado: cada linha termina com uma decisão explícita para o YAMI.

Legenda de decisão:

- **Adotar** — mesmo conceito, implementação própria.
- **Adaptar** — conceito útil, mas com escopo ou forma diferente.
- **Postergar** — relevante, fora dos primeiros marcos.
- **Fora** — não faz parte do produto YAMI.

## 1. Evidência estrutural: 78 tabelas

Agrupamento por domínio (contagens do banco `openbot.db` em 05/11/2026):

| Domínio | Tabelas | Linhas | O que revela |
| --- | --- | --- | --- |
| Orquestração | `orchestration_events`, `orchestration_command_receipts`, `projection_queue_state` | 2.417 / 2.414 / 1 | Log de eventos append-only + receipts idempotentes de comando + estado de fila |
| Agentes | `projection_agents`, `projection_agent_threads`, `projection_agent_routines`, `projection_agent_memories` | 6 / 2 / 5 / 9 | Agente como projeção de eventos; rotinas por agente; memória textual |
| Threads e turnos | `projection_threads`, `projection_thread_messages`, `projection_turns`, `projection_thread_activities`, `projection_thread_summaries`, `projection_thread_reads`, `projection_thread_read_baselines` | 8 / 588 / 64 / 1.504 / 0 / 14 / 0 | Conversa com turnos, atividades, resumos e estado de leitura |
| Uso e custo | `agent_usage_records`, `agent_usage_activity`, `agent_usage_checkpoints` | 140 / 180 / 42 | Tokens, custo estimado, base de tarifa, checkpoints de leitura |
| Provedores | `projection_provider_sessions`, `provider_history_imports`, `provider_history_staging`, `provider_history_turns` | 32 / 32 / 1.321 / 85 | Sessão externa retomável, importação de histórico, staging |
| MCP | `projection_mcp_servers` | 5 | Servidores MCP com transporte, comando, env, headers |
| Memória | `agent_memory_search` + 4 tabelas FTS5, `agent_memory_selections`, `projection_agent_memories` | 9 / 12 / 9 | Busca full-text e seleção de memórias por agente |
| Rotinas | `projection_routine_runs`, `projection_routine_triggers`, `projection_routine_webhooks`, `routine_flow_steps`, `routine_flow_links`, `routine_flow_positions`, `routine_result_deliveries`, `routine_result_destinations` | 8 / 5 / 0 / 8 / 0 / 0 / 0 / 0 | Rotina agendada, gatilhos, fluxo entre agentes, entrega de resultado |
| Workflows | `workflows`, `workflow_versions`, `workflow_nodes`, `workflow_steps`, `workflow_edges`, `workflow_runs`, `workflow_triggers`, `workflow_*_deliveries`, `workflow_*_receipts`, `workflow_github_*` | 1 / 0 / 0 / 0 / 0 / 0 / 0 / 0 | Editor visual de fluxo com nós, arestas, versões e integrações GitHub |
| Canais | `projection_channels`, `projection_channel_*` (contexts, memories, messages, reads, routines, routine_runs, routine_triggers, routine_webhooks, summaries, tasks, assignments) | 0 | Chat compartilhado por canal, com rotina e resumo próprios |
| Mensageria | `projection_messaging_connections`, `projection_messaging_threads`, `projection_messaging_memories`, `projection_messaging_allowed_roles`, `projection_mailbox_messages`, `projection_deliveries` | 0 / 0 / 0 / 0 / 63 / 63 | Conexões por plataforma (bot, workspace, app id), mailbox e entregas |
| Direct messages | `projection_direct_threads`, `projection_direct_messages`, `projection_direct_reads` | 0 | Conversa 1:1 fora de canais |
| Browser | `browser_profiles` | 0 | Perfis de navegador isolados |
| Arquivos | `file_deletion_outbox` | 0 | Fila de exclusão segura de arquivos |
| Anexos e reações | `projection_attachments`, `projection_reactions` | 2 / 0 | Anexos e reações em mensagens |
| Webhooks | `projection_webhook_receipts`, `projection_webhook_route_revocations`, `workflow_webhook_receipts` | 0 | Idempotência e revogação de rotas |
| Infra | `schema_migrations` | 43 | Versionamento de schema |

**Leitura arquitetural:** o OpenBot grava *eventos* (`orchestration_events`) e mantém *projeções* materializadas para consulta. `last_event_sequence` aparece em quase todas as projeções, confirmando o padrão event-sourcing com checkpoint por projeção.

## 2. Funcionalidades observadas

### 2.1 Núcleo de agentes

| ID | Funcionalidade | Evidência | Decisão YAMI |
| --- | --- | --- | --- |
| F-01 | Múltiplos agentes, cada um com thread, modelo e instruções próprios | `projection_agents.agent_json`, `projection_threads`, docs `agents.md` | **Adotar** (M1) |
| F-02 | Rotinas agendadas por agente, com timezone e política de atraso | `projection_agent_routines.limit_policy`, `missed_policy` | **Adaptar** (M5): começar por agendamento simples |
| F-03 | Fluxo entre agentes (rotina chama agente e entrega resultado) | `routine_flow_steps`, `routine_flow_links` | **Postergar** (M6) |
| F-04 | Editor visual de workflow com nós, arestas e versões | `workflow_nodes.x/y/width/height`, `workflow_versions` | **Postergar** (M6+) |
| F-05 | Pastas e ordenação de agentes na barra lateral | `projection_agents.sort_order`, docs `agents.md` | **Adaptar** (M3): agrupamento simples |
| F-06 | Importação/exportação de agente e transferência de instância | `agent-import/`, docs `agents.md` | **Postergar** (M7) |
| F-07 | Agentes ocultos e cores exatas por agente | docs `agents.md` | **Fora** (cosmético) |

### 2.2 Provedores e modelos

| ID | Funcionalidade | Evidência | Decisão YAMI |
| --- | --- | --- | --- |
| F-08 | Múltiplos provedores: HTTP, CLI/ACP, runtimes locais | `projection_provider_sessions.provider`, docs `providers.md` | **Adotar** (M2) |
| F-09 | Sessão externa retomável (`external_session_id`, `resume_cursor`) | `projection_provider_sessions` | **Adotar** (M2) |
| F-10 | Catálogo de modelos e fallback/failover | docs `providers.md` | **Adaptar** (M2): fallback manual primeiro |
| F-11 | Importação de histórico de provedor (staging → turns) | `provider_history_staging` (1.321 linhas) | **Postergar** (M7) |
| F-12 | Medição de uso e custo por turno | `agent_usage_records.tokens_json`, `estimated_cost_usd`, `rate_basis` | **Adotar** (M2) |
| F-13 | Compactação de contexto e memória em segundo plano | docs `providers.md` | **Adaptar** (M4) |

### 2.3 Memória

| ID | Funcionalidade | Evidência | Decisão YAMI |
| --- | --- | --- | --- |
| F-14 | Memória textual por agente com origem e turno de origem | `projection_agent_memories.origin`, `source_turn_id` | **Adotar** (M4) |
| F-15 | Busca full-text (FTS5) sobre memórias | `agent_memory_search_*` | **Adotar** (M4) |
| F-16 | Seleção explícita de memórias relevantes para o contexto | `agent_memory_selections` | **Adaptar** (M4) |

### 2.4 Ferramentas e integrações

| ID | Funcionalidade | Evidência | Decisão YAMI |
| --- | --- | --- | --- |
| F-17 | Servidores MCP configuráveis (stdio/HTTP, env, headers) | `projection_mcp_servers` (14 colunas) | **Adotar** (M3) |
| F-18 | Catálogo de plugins/conectores (~dezenas) | `resources/plugin-catalog` | **Adaptar** (M5): catálogo curado |
| F-19 | Skills locais e gerenciadas | `managed-skills/`, docs `skills-and-plugins.md` | **Adaptar** (M5) |
| F-20 | Navegador controlado com perfis isolados | `browser_profiles`, docs `browser.md` | **Postergar** (M6) |
| F-21 | Driver de UI desktop nativo | `resources/cua-driver` | **Adotar** (M3) via integração MIT |
| F-22 | Webhooks de entrada com idempotência e revogação | `projection_webhook_receipts`, docs `events.md` | **Postergar** (M6) |
| F-23 | Canais compartilhados e mensageria (Slack/Discord/Telegram) | `projection_messaging_connections`, docs `channels-and-messaging.md` | **Postergar** (M7) |
| F-24 | Notificações mobile e Live Activities | docs `channels-and-messaging.md` | **Fora** |

### 2.5 Voz

| ID | Funcionalidade | Evidência | Decisão YAMI |
| --- | --- | --- | --- |
| F-25 | STT/TTS local com sherpa-onnx e ONNX Runtime | `resources/voice/`, licenças empacotadas | **Adaptar** (M4): VoiceStudio como backend |
| F-26 | Wake word, VAD e interrupção de fala | docs e binários de voz | **Adotar** (M4) |
| F-27 | Modelos de voz empacotados (Whisper, Parakeet, Supertonic, Bark) | licenças em `resources/licenses` | **Adaptar** (M4): só o necessário |

### 2.6 Segurança e operação

| ID | Funcionalidade | Evidência | Decisão YAMI |
| --- | --- | --- | --- |
| F-28 | Log de auditoria e receipts idempotentes | `orchestration_command_receipts`, `audit_log` (schema próprio do YAMI) | **Adotar** (M1) |
| F-29 | Fila de exclusão de arquivos (outbox) | `file_deletion_outbox` | **Adaptar** (M3) |
| F-30 | Aprovação de ferramentas e escopo de acesso | docs `agents.md` (política de comunicação) | **Adotar** (M1) |
| F-31 | Autenticação OAuth/MCP com relay de callback | docs `integrations.md` | **Postergar** (M3) |
| F-32 | Migrations versionadas | `schema_migrations` (43) | **Adotar** (M0, feito) |

## 3. O que o YAMI não reproduz

- Interface, textos, ícones, paleta e nomes de tela do OpenBot.
- Estrutura interna de arquivos, nomes de classes, tabelas e colunas idênticas.
- Catálogo completo de plugins na primeira versão.
- Canais, mobile, Live Activities e desktop remoto nos primeiros marcos.
- Qualquer código sob PolyForm Noncommercial.

## 4. Lacunas conhecidas

1. O schema mostra **o que é persistido**, não a lógica de decisão (ex.: como o failover escolhe modelo).
2. A documentação descreve o comportamento **declarado**, não garante que esteja ativo na 0.59.0.
3. Não houve execução controlada do OpenBot para medir latência, consumo ou qualidade.
4. O backend VoiceStudio estava offline durante a coleta; a integração de voz será validada no marco M4.
