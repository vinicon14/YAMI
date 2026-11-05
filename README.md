# YAMI

Assistente pessoal de IA **local-first** para Windows: múltiplos agentes, múltiplos provedores, memória, voz contínua e controle do computador com permissões explícitas.

> Estado: **M0 — fundação concluída**. O que aparece na interface como "planejado" ainda não existe no código.

## O que já funciona

- Contratos canônicos (zod) de evento, agente, provedor, risco de ferramenta e decisão de permissão.
- SQLite (`node:sqlite`) com migrations versionadas, log de eventos append-only, agentes, mensagens e auditoria.
- Motor de permissões determinístico: raízes autorizadas, negação fora do escopo e confirmação para ação destrutiva.
- Shell Electron com IPC tipado, preload isolado, `sandbox`, `contextIsolation` e CSP restritiva.
- Interface React com visão geral, criação/listagem de agentes e painéis marcados como planejados.
- Testes unitários/integração e smoke E2E do aplicativo real.

## Stack

Electron 42.11.18 · React 19.3.1 · TypeScript 5.9.3 · Vite 8.3.6 · zod 4.6.7 · `node:sqlite` · Vitest 5.1.0 · pnpm 10.28.2

## Começando

```powershell
pnpm install
pnpm build
pnpm test
pnpm smoke   # abre o Electron real e valida renderer + preload + IPC + SQLite
pnpm start   # abre o aplicativo
```

Requisitos: Node 24+, pnpm 10+, Windows 10 1809+.

## Estrutura

```
packages/contracts   contratos e schemas compartilhados
packages/core        SQLite, event store, agentes, permissões
apps/desktop         Electron main + preload + renderer React
docs                 referências, requisitos, arquitetura e plano
```

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`docs/REFERENCIAS.md`](docs/REFERENCIAS.md) | fontes, versões, hashes e ambiente |
| [`docs/ANALISE_REA.md`](docs/ANALISE_REA.md) | evidência REA do artefato de referência |
| [`docs/INVENTARIO_FUNCIONALIDADES.md`](docs/INVENTARIO_FUNCIONALIDADES.md) | funcionalidades observadas e decisão para o YAMI |
| [`docs/ARQUITETURA_PROPOSTA.md`](docs/ARQUITETURA_PROPOSTA.md) | arquitetura, modelo de eventos, permissões, segurança |
| [`docs/REQUISITOS.md`](docs/REQUISITOS.md) | requisitos funcionais e não funcionais com critérios |
| [`docs/PLANO_DE_IMPLANTACAO.md`](docs/PLANO_DE_IMPLANTACAO.md) | marcos M0–M7 e critérios de saída |
| [`docs/DEPENDENCIAS.md`](docs/DEPENDENCIAS.md) | dependências, versões e licenças |
| [`docs/LICENCIAMENTO.md`](docs/LICENCIAMENTO.md) | política de licença e uso da referência |
| [`ROADMAP.md`](ROADMAP.md) | visão de marcos |
| [`TASKS.md`](TASKS.md) | checklist vivo |
| [`PROGRESS.md`](PROGRESS.md) | diário de execução com evidências |
| [`DECISIONS.md`](DECISIONS.md) | ADRs |
| [`CHANGELOG.md`](CHANGELOG.md) | mudanças por versão |

## Licença

`UNLICENSED` — todos os direitos reservados. Ver `docs/LICENCIAMENTO.md`.

O YAMI não é afiliado ao OpenBot e não contém código, assets ou schema daquele produto.
