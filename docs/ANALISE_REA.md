# Análise REA do OpenBot 0.59.0

## 1. Objetivo

Usar o REA (Reverse Engineering Anything) para obter evidência verificável sobre o que existe **dentro** do artefato distribuído do OpenBot, sem executá-lo e sem copiar código. O resultado alimenta o inventário funcional e as decisões de arquitetura do YAMI.

## 2. Comando executado

```powershell
rea inspect-artifact "C:\Users\vinim\AppData\Local\Programs\OpenBot\resources\app.asar" --format json
```

Saída bruta: `C:\Users\vinim\AppData\Local\Temp\opencode\rea-openbot-inventory.json` (40.297.633 bytes).

## 3. Identidade da evidência

| Campo | Valor |
| --- | --- |
| Evidence ID | `ev_c0dbd4c7b003d21c0c32fd77b54694636304137f5bccd2c3a0211782d2d70f94` |
| Provider | `rea-artifact-graph` v1 |
| Autoridade | `observed` |
| Confiança | `shipped-artifact` |
| Predicado | `inspects` |
| Formato raiz | `asar` |
| SHA-256 do artefato | `bbe7083332ec6c201747d9e68c031ce3f2167ab2d6edf3f11635b10506085c5d` |
| Manifest ID | `agm_b0c542aca224ced7447eea5be44542e1420a2479c81839618ae095c3d099c621` |
| Root artifact ID | `art_319787188c2e9f5a98bd4998775250953b9e746525a0ff3ac925f1c962cd6a13` |
| Graph SHA-256 | `51127b6c7bda4009fe238055ee4f0ed2ac31c15ae8fe9319d484ff346b8659e5` |

## 4. Tamanho do grafo

| Métrica | Valor |
| --- | --- |
| Nós | 33.303 |
| Ocorrências | 35.145 |
| Arestas | 35.144 |
| Contradições de integridade | 0 |
| Cobertura | `container-entries` / `complete` |

Cada nó tem `artifact_id`, `sha256`, `size`, `format`, `media_type`, `content_state` e limitações. Cada ocorrência tem `logical_path`, `entry_kind`, `artifact_kind`, `hash_status` e aponta para o pai — ou seja, o grafo reconstrói a árvore de diretórios do `app.asar` com hash verificado.

## 5. O que a evidência sustenta

1. **O artefato é um único ASAR de ~393 MB**, com árvore interna completa e hashes conferidos (`hash_status: verified`).
2. **Existem recursos fora do ASAR** (`app.asar.unpacked`), incluindo runtimes nativos de voz (ONNX Runtime, sherpa-onnx) e o `cua-driver`.
3. **O produto empacota um catálogo de plugins** (`plugin-catalog` com dezenas de conectores: Aave, Airtable, Apple Apps, Atlassian, Brave Search, Canva, ClickUp, Cloudflare, Composio, Context7, Figma, …).
4. **O produto empacota skills gerenciadas** (`openbot-data`, `openbot-site-hosting`, `openbot-skill-creator`).
5. **O produto inclui runtime de agente e CLI próprios**, além de um runtime de desktop remoto.
6. **As licenças de terceiros estão presentes**, o que permite mapear obrigações de atribuição.

## 6. O que a evidência NÃO sustenta

Limitação declarada pelo próprio REA:

> "Inspection derives bounded static hypotheses and next probes; it does not execute the artifact or claim format-specific semantics."

Portanto, esta evidência **não** prova:

- comportamento em tempo de execução;
- qualidade, bugs ou segurança das implementações;
- semântica de cada arquivo JavaScript empacotado;
- que uma funcionalidade documentada está ativa na versão instalada.

Essas lacunas foram cobertas parcialmente por:

- **schema do banco local** (estado real persistido: 78 tabelas, contagens de linhas);
- **documentação oficial** (contratos de comportamento declarados);
- **observação direta da instalação** (diretórios de recursos, versões, licenças).

## 7. Conclusões para o YAMI

| Conclusão | Consequência |
| --- | --- |
| O OpenBot é event-sourced: `orchestration_events` + dezenas de `projection_*` | O YAMI adota log de eventos como fonte de verdade e projeções derivadas, mas com schema próprio e menor superfície inicial. |
| O produto cobre muitos domínios (canais, mobile, webhooks, browser, voz, MCP) | O YAMI entra por um núcleo enxuto (agentes + provedores + permissões) e cresce por marcos. |
| Há forte dependência de runtimes externos (CLIs de provedores, MCP, ONNX) | O YAMI trata provedores como adaptadores plugáveis e isola voz em processo separado. |
| A licença é PolyForm Noncommercial | Nenhum código, asset ou schema do OpenBot entra no YAMI. Referência é funcional, não textual. |

## 8. Reprodutibilidade

Para repetir a inspeção:

```powershell
rea inspect-artifact "<caminho>\app.asar" --format json > rea-inventory.json
```

O SHA-256 do `app.asar` deve ser `bbe708…5c5d` para que os números acima sejam comparáveis. Versões diferentes do OpenBot produzirão outro grafo.
