# Dependências

Atualizado em 05/11/2026. Versões fixadas (sem `^`) nas dependências de runtime para builds reprodutíveis.

## 1. Runtime do aplicativo

| Pacote | Versão | Licença | Papel | Por que foi escolhido |
| --- | --- | --- | --- | --- |
| `electron` | 42.11.18 | MIT | Shell desktop | Chromium 148 + Node 24.19 com `node:sqlite` embutido |
| `react` | 19.3.1 | MIT | UI | Componentização e ecossistema |
| `react-dom` | 19.3.1 | MIT | Renderer | — |
| `zod` | 4.6.7 | MIT | Validação e contratos | Schema e tipo no mesmo lugar |
| `@yami/contracts` | workspace | UNLICENSED | Contratos internos | Fonte única de verdade |
| `@yami/core` | workspace | UNLICENSED | Núcleo | Separação de responsabilidades |

### Embutidos no Electron (não são dependências npm)

| Componente | Licença | Observação |
| --- | --- | --- |
| Chromium | BSD-3-Clause + licenças de terceiros | Ver `LICENSES.chromium.html` distribuído com o Electron |
| Node.js | MIT | Runtime do processo main |
| SQLite (`node:sqlite`) | Public Domain | Sem módulo nativo adicional |

## 2. Desenvolvimento

| Pacote | Versão | Licença | Papel |
| --- | --- | --- | --- |
| `typescript` | 5.9.3 | Apache-2.0 | Compilação e checagem |
| `vite` | 8.3.6 | MIT | Build do renderer |
| `@vitejs/plugin-react` | 6.2.1 | MIT | JSX/Fast Refresh |
| `vitest` | 5.1.0 | MIT | Testes |
| `@types/node` | ^24.0.0 | MIT | Tipos do Node |
| `@types/react` | 19.3.0 | MIT | Tipos do React |
| `@types/react-dom` | 19.3.0 | MIT | Tipos do React DOM |
| `pnpm` | 10.28.2 | MIT | Gerenciador e workspaces |

## 3. Integrações externas (não instaladas por npm)

| Componente | Versão observada | Licença | Forma de integração | Obrigação |
| --- | --- | --- | --- | --- |
| VoiceStudio | 0.5.6 instalado / 0.5.7 no fonte | **AGPL-3.0-only** | HTTP local (`127.0.0.1:3900`) e MCP | Processo separado; sem linkagem; oferecer fonte se distribuído |
| cua-driver | empacotado no OpenBot | **MIT** | Executável/CLI | Incluir aviso de copyright e texto da licença |
| Ollama | não instalado | MIT | HTTP local | Opcional; usuário instala |
| CLIs de provedores (Codex, Claude, Gemini, Cursor…) | variadas | proprietárias | ACP/CLI | Usuário instala e autentica; o YAMI não redistribui |

## 4. Dependências rejeitadas

| Candidato | Motivo da rejeição |
| --- | --- |
| `better-sqlite3` | Módulo nativo: exige toolchain e rebuild por versão de Electron |
| `electron-store` | Simples demais para o modelo de eventos; adiciona dependência |
| `@electron/remote` | Superfície insegura; viola o princípio de renderer sem Node |
| SDKs de provedores | Acoplamento e peso; HTTP direto é suficiente no M2 |
| `keytar` | Módulo nativo; `safeStorage` do Electron cobre o caso no Windows |
| Framework de UI pesado | O renderer usa React + CSS próprio, sem kit visual de terceiros |

## 5. Requisitos de ambiente

| Requisito | Mínimo | Observado |
| --- | --- | --- |
| Windows | 10 1809+ | Windows 11 26H2 build 26300 |
| Node | 24 (para build) | 24.19.0 |
| pnpm | 10 | 10.28.2 |
| RAM | 8 GB | 15,6 GB |
| Disco | 1,5 GB livres | — |
| GPU | não obrigatória | Intel UHD |

## 6. Notas de instalação

- O download do binário do Electron é feito no `postinstall`. Em redes restritas, use `ELECTRON_SKIP_BINARY_DOWNLOAD=1` e instale o binário depois com `node node_modules/electron/install.js`.
- pnpm 10 bloqueia scripts de instalação por padrão; `onlyBuiltDependencies: ["electron"]` está declarado na raiz.
- `node:sqlite` é experimental no Node 24, mas estável o suficiente para uso local; não requer flag no Electron 42.

## 7. Atualização de dependências

1. Rodar `pnpm outdated`.
2. Atualizar uma família por vez.
3. Executar `pnpm build && pnpm typecheck && pnpm test && pnpm smoke`.
4. Registrar em `CHANGELOG.md` e, se mudar decisão estrutural, em `DECISIONS.md`.
