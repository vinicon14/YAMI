# Referências — Fase 1

Data da coleta: **05/11/2026**
Método: inspeção do artefato instalado (REA), leitura do banco local do OpenBot e documentação pública de arquitetura. Nenhum código do OpenBot foi copiado para este repositório.

## 1. Software de referência

| Item | Valor observado |
| --- | --- |
| Produto | OpenBot |
| Versão | 0.59.0 (`FileVersion 0.59.0`, `ProductVersion 0.59.0.0`) |
| Fabricante declarado | Norbert Bodziony / SYNTHETIFY LABS SP. Z O.O. |
| Repositório oficial | https://github.com/nightly-labs/openbot |
| Licença declarada no `package.json` do app | `PolyForm-Noncommercial-1.0.0` |
| Instalação analisada | `C:\Users\vinim\AppData\Local\Programs\OpenBot` |
| Artefato principal | `resources\app.asar` — 393.502.051 bytes |
| SHA-256 do `app.asar` | `bbe7083332ec6c201747d9e68c031ce3f2167ab2d6edf3f11635b10506085c5d` |
| Runtime declarado | Node `>=24.0.0` |
| UI | SolidJS (observado no `package.json` do artefato) — **não** usada como base |

O `app.asar` contém, entre outros: `agent-import`, `agent-runtime`, `cli`, `cua-driver`, `managed-skills`, `plugin-catalog`, `remote-desktop-runtime`, `voice`, `licenses`.

### Licenças de terceiros empacotadas pelo OpenBot

- `Electron-LICENSE`
- `LICENSES.chromium.html`
- `onnxruntime-LICENSE`
- `sherpa-onnx-LICENSE`
- `OpenAI-Whisper-LICENSE`
- `NVIDIA-Parakeet-TDT-0.6B-v3-LICENSE`
- `Supertone-Supertonic-3-LICENSE`
- `Underdog-Bark-3.0-Plus-LICENSE`

Essas licenças foram lidas apenas para entender obrigações de atribuição de dependências que o YAMI também pode vir a usar (ver `docs/LICENCIAMENTO.md`).

## 2. Banco de dados local do OpenBot

| Item | Valor |
| --- | --- |
| Caminho | `%APPDATA%\OpenBot\openbot.db` |
| Tabelas de usuário | **78** (inclui 4 tabelas sombra de FTS5) |
| Migrations aplicadas | 43 (`schema_migrations`) |
| Eventos de orquestração | 2.417 |
| Receipts de comando | 2.414 |
| Mensagens projetadas | 588 |
| Atividades de thread | 1.504 |
| Sessões de provedor | 32 |
| Registros de uso | 140 |
| Agentes | 6 |

O schema é a evidência funcional mais forte: mostra o que o produto realmente persiste, não apenas o que a documentação promete.

## 3. Documentação oficial consultada

Baixada em 05/11/2026 para leitura offline (não versionada neste repositório):

| Documento | Tamanho | Conteúdo usado |
| --- | --- | --- |
| `agents.md` | 87.748 B | rotinas, fluxos, workflows, threads, pastas, importação, políticas de comunicação |
| `providers.md` | 99.341 B | catálogo de modelos, ACP/CLI, failover, compactação, memória em segundo plano |
| `browser.md` | 38.035 B | cliente de navegador, execução de ferramentas, sessões, autenticação segura |
| `channels-and-messaging.md` | 65.605 B | canais compartilhados, conexões de mensageria, fila mobile |
| `integrations.md` | 48.901 B | MCP, login remoto, relay de callback, conectores |
| `events.md` | 20.489 B | webhooks de rotina, ciclo de vida de rotas, modelo de ameaças |
| `skills-and-plugins.md` | 20.529 B | pastas de skills, biblioteca local, distribuição de plugins |

## 4. Ferramentas usadas na investigação

| Ferramenta | Versão | Uso |
| --- | --- | --- |
| REA | 6.7.0 | `rea inspect-artifact` no `app.asar`; Evidence `ev_c0dbd4c7b003d21c0c32fd77b54694636304137f5bccd2c3a0211782d2d70f94` |
| Node.js | 24.19.0 | leitura somente-leitura do SQLite via `node:sqlite`; validação do runtime |
| pnpm | 10.28.2 | workspace e instalação |
| `@electron/asar` | via npx | extração pontual de `package.json` e `LICENSE` do artefato |
| VoiceStudio | 0.5.6 | backend de voz local (API HTTP em `127.0.0.1:3900`) |

## 5. Ambiente de destino

| Item | Valor |
| --- | --- |
| CPU | Intel Core i5-13420H |
| RAM | 15,6 GB |
| GPU | Intel UHD Graphics (sem GPU dedicada) |
| SO | Windows 11 build 26300 (26H2), x64 |
| Node | 24.19.0 |
| Gerenciador | pnpm 10.28.2 |
| Ollama | ausente no momento da coleta |

## 6. O que foi deliberadamente descartado

- Código-fonte, assets, ícones, nomes de classes, textos de interface e identidade visual do OpenBot.
- Esquema SQL copiado literalmente: o YAMI tem schema próprio, escrito a partir dos requisitos.
- Dependências do OpenBot: a stack do YAMI foi escolhida de forma independente (Electron + React + TypeScript).
