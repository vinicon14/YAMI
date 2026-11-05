# Plano de implantação

Cada marco termina com um relatório e **aguarda autorização** antes do próximo. Nenhum marco é declarado concluído sem `pnpm build`, `pnpm typecheck`, `pnpm test` e `pnpm smoke` verdes.

## M0 — Fundação (concluído em 05/11/2026)

**Objetivo:** provar que a stack escolhida funciona de ponta a ponta, sem simular funcionalidades.

| Entrega | Estado |
| --- | --- |
| Monorepo pnpm (`packages/contracts`, `packages/core`, `apps/desktop`) | ✅ |
| Contratos zod de evento, agente, provedor, risco e permissão | ✅ |
| SQLite com migrations, log de eventos, agentes, mensagens e auditoria | ✅ |
| Motor de permissões com raízes autorizadas e confirmação de destrutivo | ✅ |
| Shell Electron com IPC tipado, preload isolado, CSP e sandbox | ✅ |
| UI React com visão geral, lista/criação de agentes e painéis marcados como planejados | ✅ |
| Testes (10) e smoke E2E do Electron | ✅ |
| Documentação da Fase 1 (8 documentos + README/ROADMAP/TASKS/PROGRESS/DECISIONS/CHANGELOG) | ✅ |

**Evidência de verificação:**

```
pnpm build      → contracts, core, renderer e electron compilam
pnpm typecheck  → 3 projetos sem erros
pnpm test       → 2 arquivos, 10 testes aprovados
pnpm smoke      → {"title":"YAMI","brand":"YAMI","navItems":6,"bridge":true,"agents":0,"events":0}
```

**Riscos encontrados e tratados:**

- Electron 45.2.3 crasha o renderer nesta máquina → fixado em 42.11.18 (ADR-004).
- pnpm 10 bloqueia `postinstall` do Electron → `onlyBuiltDependencies` na raiz.
- `@types/node` ausente no app desktop → adicionado.

## M1 — Núcleo confiável (próximo)

**Objetivo:** transformar a fundação em um núcleo auditável e reconstruível.

| Entrega | Critério de saída |
| --- | --- |
| Edição/remoção de agente | CRUD completo com confirmação de remoção |
| Threads e mensagens persistidas | Histórico por agente, ordenado e paginado |
| Fila de tarefas e sessões de turno | Um turno por vez por thread; estado observável |
| Auditoria encadeada | Hash do registro anterior; verificação de integridade |
| Painel de permissões | Concessões, negações e histórico com filtro |
| Projeções reconstruíveis | `rebuild()` a partir do log com teste de equivalência |
| Cobertura de `packages/core` ≥ 80% | Relatório de cobertura no CI |

**Fora do M1:** chamadas reais a provedores, voz, ferramentas de disco.

## M2 — Provedores e conversa real

**Objetivo:** conversar com um modelo real e medir custo.

| Entrega | Critério de saída |
| --- | --- |
| Adaptador HTTP (OpenAI-compatible) | Turno completo com streaming |
| Adaptador CLI/ACP | Detecta instalação, inicia sessão, normaliza eventos |
| Adaptador local (Ollama) | Lista modelos e completa turno |
| Cofre de credenciais | `safeStorage`/DPAPI; nada em texto puro |
| Painel de provedores | Conectar, testar, desconectar, ver modelos |
| Uso e custo | Tokens e custo por turno no painel |
| Fallback | Política explícita e registrada em evento |
| Retomada de sessão | `resume_cursor` persistido e reutilizado |

**Riscos:** formatos de streaming divergentes; limites de rate; CLIs que mudam de contrato. Mitigação: contrato de adaptador + testes com fixtures gravadas.

## M3 — Ferramentas, MCP e controle do computador

**Objetivo:** o agente age no computador com segurança.

| Entrega | Critério de saída |
| --- | --- |
| Ferramentas de arquivo | Leitura/escrita/listagem sob permissão |
| Execução de shell | Política por comando; bloqueio antes da execução |
| Integração cua-driver | Ação de UI aprovada e auditada |
| Cliente MCP | stdio e HTTP; listar ferramentas; desconectar |
| Aprovação na UI | Modal com detalhes da ação, escopo e risco |
| Acessibilidade | Teclado e contraste AA nas telas principais |

## M4 — Memória e voz

**Objetivo:** continuidade e conversa por voz.

| Entrega | Critério de saída |
| --- | --- |
| Memória por agente | CRUD + origem + turno de origem |
| Busca FTS5 | Consulta ranqueada em < 50 ms para 10k memórias |
| Seleção de contexto | Memórias relevantes injetadas e visíveis |
| Integração VoiceStudio | STT, TTS e streaming via HTTP local |
| Wake word e VAD | Ativação sem clique; estado na UI |
| Barge-in | Interrupção cancela áudio e turno |
| Offline honesto | Sem VoiceStudio, UI mostra indisponível |

**Dependência externa:** VoiceStudio precisa estar online. Durante a Fase 1 estava offline; a validação real começa no M4.

## M5 — Rotinas e skills

| Entrega | Critério de saída |
| --- | --- |
| Rotina agendada por agente | Executa no horário, registra resultado |
| Política de atraso/limite | `missed_policy` e `limit_policy` observáveis |
| Biblioteca de skills local | Instalar, listar, remover |
| Catálogo curado de conectores | Poucos conectores, bem testados |

## M6 — Fluxos entre agentes

| Entrega | Critério de saída |
| --- | --- |
| Encadeamento de agentes | Saída de um vira entrada do próximo |
| Gatilhos | Manual e agendado |
| Visualização de execução | Etapas, status e erro por etapa |
| Webhooks de entrada | Idempotência e revogação |

## M7 — Distribuição

| Entrega | Critério de saída |
| --- | --- |
| Instalador NSIS | Instala, cria atalho, abre, desinstala |
| Modo portátil | Executa do pendrive com dados locais |
| Backup/restauração | Exporta e importa sem perda |
| Exportar/importar agente | Schema versionado e validado |
| Avisos de licença | Terceiros atribuídos corretamente |
| Assinatura de código | Quando houver certificado |

## Estratégia de verificação por marco

1. **Antes de codar:** requisito com critério de aceite (ver `docs/REQUISITOS.md`).
2. **Durante:** teste falhando primeiro para o comportamento novo.
3. **Fechamento:** `build`, `typecheck`, `test`, `smoke` + checklist manual do marco.
4. **Relatório:** o que entrou, o que ficou de fora, evidências e riscos.

## Riscos globais

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| Electron instável em Windows novo | Média | Alto | Versão fixada e smoke E2E em CI local |
| Provedor muda contrato | Alta | Médio | Adaptador + fixtures + fallback |
| Modelo local inviável sem GPU | Alta | Médio | Aviso de requisitos; foco em nuvem/CLI |
| VoiceStudio indisponível | Média | Médio | Detecção e estado honesto; sem simulação |
| Escopo crescer demais | Alta | Alto | Marcos fechados e autorização explícita |
| Credencial vazar | Baixa | Crítico | Cofre do SO + auditoria + revisão |

## Critério de parada

O projeto pausa e pede decisão humana quando:

- um requisito não puder ser verificado no ambiente;
- uma dependência crítica mudar de licença;
- uma ação exigir credencial ou permissão que o agente não possui;
- o custo de um marco exceder o valor entregue.
