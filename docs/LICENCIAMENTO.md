# Licenciamento

Este documento registra o que pode e o que não pode ser feito com o material de referência, e qual é a política de licença do próprio YAMI.

## 1. OpenBot — PolyForm Noncommercial 1.0.0

O `package.json` do artefato declara:

```json
"license": "PolyForm-Noncommercial-1.0.0"
```

O texto completo da licença está em `resources/app.asar` → `LICENSE`.

### O que a licença permite

- Usar o software para **qualquer finalidade não comercial**.
- Fazer alterações e obras derivadas para finalidade não comercial.
- Distribuir o software, desde que junto com o texto da licença e sem alterar as restrições.

### O que a licença proíbe

- **Qualquer uso comercial** do software ou de obra derivada.
- Distribuir obra derivada sem o texto da licença.
- Remover ou contornar avisos de licença.

### Consequência prática para o YAMI

O YAMI é um produto próprio, com possibilidade de uso comercial. Portanto:

1. **Nenhuma linha de código do OpenBot é copiada.**
2. **Nenhum asset** (ícone, imagem, fonte, texto de interface) é reutilizado.
3. **Nenhum schema SQL é copiado literalmente.** O schema do YAMI foi escrito a partir de requisitos, com nomes e colunas próprios.
4. **Nenhum nome de classe, módulo ou tela** é reproduzido.
5. O OpenBot é usado como **referência funcional** — como se consulta um produto concorrente para entender um mercado.

O inventário em `docs/INVENTARIO_FUNCIONALIDADES.md` é uma descrição de comportamento observado, não uma transcrição de implementação. Descrições funcionais e ideias não são protegidas por copyright; a expressão concreta é.

## 2. VoiceStudio — AGPL-3.0-only

O VoiceStudio é distribuído sob **GNU Affero General Public License v3.0** (confirmado em `LICENSE` e no campo `license` do `package.json`).

### Regra adotada

- O YAMI conversa com o VoiceStudio **por HTTP local e MCP**, em **processo separado**.
- O YAMI **não linka** bibliotecas do VoiceStudio, não importa seu código e não o empacota no mesmo binário.
- Se o YAMI vier a distribuir o VoiceStudio junto (ex.: instalador tudo-em-um), o conjunto passa a ter obrigações AGPL: disponibilizar o código-fonte correspondente e manter a licença.
- Por padrão, o VoiceStudio é **pré-requisito opcional**: o usuário instala e o YAMI detecta em `127.0.0.1:3900`.

### Obrigações se o VoiceStudio for distribuído

1. Incluir o texto da AGPL-3.0.
2. Disponibilizar o código-fonte da versão distribuída (ou oferta escrita válida).
3. Não impor restrições adicionais sobre o código AGPL.
4. Manter separação clara entre o código do YAMI e o código AGPL.

## 3. cua-driver — MIT

O `cua-driver` é licenciado sob MIT (permissiva). Se for empacotado com o YAMI:

- incluir o aviso de copyright original;
- incluir o texto da licença MIT;
- não usar o nome dos autores para endossar o YAMI.

## 4. Modelos de voz e runtime de IA

O OpenBot empacota modelos e runtimes com licenças próprias:

| Componente | Licença | Cuidado |
| --- | --- | --- |
| ONNX Runtime | MIT | Incluir aviso |
| sherpa-onnx | Apache-2.0 | Incluir aviso |
| OpenAI Whisper | MIT | Incluir aviso |
| NVIDIA Parakeet TDT 0.6B v3 | CC-BY-4.0 (verificar texto empacotado) | Atribuição obrigatória |
| Supertone Supertonic 3 | verificar texto empacotado | Pode ter restrição de uso |
| Underdog Bark 3.0 Plus | verificar texto empacotado | Pode ter restrição de uso |

**Decisão:** o YAMI não redistribui modelos de voz no primeiro ciclo. O usuário aponta para o backend de voz que já possui. Quando houver empacotamento, cada licença será revisada individualmente.

## 5. Licença do YAMI

Estado atual: `"license": "UNLICENSED"` no `package.json` — **todos os direitos reservados**, uso privado.

Motivo: o produto ainda não tem definição de distribuição. Escolher uma licença permissiva agora criaria expectativa difícil de reverter.

Opções futuras:

| Cenário | Licença sugerida |
| --- | --- |
| Produto comercial fechado | Proprietária |
| Núcleo aberto + app fechado | MIT/Apache-2.0 em `packages/*`, proprietária em `apps/*` |
| Projeto comunitário | MIT |

A decisão será registrada em `DECISIONS.md` antes de qualquer publicação.

## 6. Dependências do YAMI

Todas as dependências npm atuais são permissivas (MIT, Apache-2.0) ou domínio público (SQLite). Não há dependência copyleft no runtime do YAMI neste momento. Ver `docs/DEPENDENCIAS.md`.

## 7. Checklist antes de publicar

- [ ] Nenhum arquivo do OpenBot no repositório (`git log --all --stat`).
- [ ] Nenhum texto de interface copiado.
- [ ] `LICENSE` do YAMI definido.
- [ ] Avisos de terceiros gerados (`license-checker` ou equivalente).
- [ ] VoiceStudio tratado como processo separado.
- [ ] Modelos de voz não redistribuídos sem revisão.
