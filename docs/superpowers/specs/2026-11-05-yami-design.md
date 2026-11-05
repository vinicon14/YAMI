# YAMI — especificação de design

**Data:** 05/11/2026
**Status:** aprovada pelo proprietário
**Escopo:** fundação (M0) e direção dos marcos M1–M7

## Problema

O proprietário precisa de um assistente pessoal de IA próprio, com agentes múltiplos, provedores variados, voz contínua, memória e controle do computador — sem depender de um produto de terceiro e sem herdar sua licença ou identidade visual.

## Resultado esperado

Um aplicativo desktop Windows, local-first, que:

1. executa agentes com workspace, instruções e permissões próprias;
2. conecta-se a provedores por adaptadores normalizados;
3. audita toda ação de risco;
4. conversa por voz com interrupção;
5. instala ou roda de um pendrive.

## Decisão de design

A especificação completa — stack, estrutura do monorepo, modelo de eventos, modelo de dados, motor de permissões, contrato de provedor, pipeline de voz, segurança, distribuição, testes e metas — está em [`docs/ARQUITETURA_PROPOSTA.md`](../../ARQUITETURA_PROPOSTA.md).

## Alternativas descartadas

| Alternativa | Motivo |
| --- | --- |
| Fork do OpenBot | Licença PolyForm Noncommercial e identidade de terceiro |
| Tauri 2 | Rust no caminho crítico e `node:sqlite` indisponível |
| App web + servidor local | Sem integração nativa de desktop e permissões de SO |
| `better-sqlite3` | Módulo nativo a recompilar por versão de Electron |

## Critério de sucesso do M0

`pnpm build`, `pnpm typecheck`, `pnpm test` e `pnpm smoke` verdes, com o aplicativo real abrindo e o SQLite persistindo agentes.

## Aprovação

- Stack Electron + React + TypeScript: aprovada em 05/11/2026.
- Prioridade agentes/provedores antes de voz: aprovada em 05/11/2026.
- M0 verificado e concluído em 05/11/2026.
