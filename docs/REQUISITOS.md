# Requisitos

Rastreabilidade: cada requisito tem ID, critério de aceite verificável e marco de entrega. Requisitos sem critério de teste não entram no escopo.

## 1. Requisitos funcionais

### 1.1 Núcleo e agentes

| ID | Requisito | Critério de aceite | Marco |
| --- | --- | --- | --- |
| FR-01 | Criar agente com nome, instruções, workspace e nível de acesso | Agente aparece na lista após criar; persiste após reiniciar o app | M0 ✅ |
| FR-02 | Listar agentes com workspace e nível de acesso | Lista reflete o banco; teste de integração cobre criação e leitura | M0 ✅ |
| FR-03 | Editar e remover agente | Alteração e remoção persistem; remoção pede confirmação | M1 |
| FR-04 | Cada agente tem threads e histórico próprios | Mensagens de um agente não aparecem em outro | M1 |
| FR-05 | Turno de conversa com streaming de resposta | Deltas chegam incrementalmente e são gravados como eventos | M2 |
| FR-06 | Cancelar turno em andamento | Cancelamento encerra o stream e grava `turn.failed`/estado final | M2 |
| FR-07 | Rotina agendada por agente | Rotina dispara no horário e registra execução | M5 |
| FR-08 | Encadear agentes em fluxo | Resultado de um agente vira entrada do próximo | M6 |

### 1.2 Provedores

| ID | Requisito | Critério de aceite | Marco |
| --- | --- | --- | --- |
| FR-09 | Cadastrar provedor HTTP com chave | Chave não aparece em texto puro no banco nem em log | M2 |
| FR-10 | Detectar provedores CLI/ACP instalados | Lista mostra instalado/não instalado sem executar prompt | M2 |
| FR-11 | Selecionar modelo por agente | Modelo escolhido é usado no turno seguinte | M2 |
| FR-12 | Reportar tokens e custo por turno | `usage` gravado e visível no painel | M2 |
| FR-13 | Retomar sessão externa | `external_session_id` reutilizado quando o provedor suportar | M2 |
| FR-14 | Fallback de modelo | Falha do primário aciona secundário conforme política | M2 |
| FR-15 | Provedor local (Ollama) | Lista modelos locais e completa um turno | M2 |

### 1.3 Ferramentas e permissões

| ID | Requisito | Critério de aceite | Marco |
| --- | --- | --- | --- |
| FR-16 | Avaliar risco de ferramenta antes de executar | Nenhuma execução sem decisão registrada | M0 ✅ |
| FR-17 | Bloquear acesso fora das raízes autorizadas | Teste cobre caminho absoluto fora da raiz e caminho relativo | M0 ✅ |
| FR-18 | Exigir confirmação para ação destrutiva | Ação destrutiva retorna `ask` mesmo em acesso `full` | M0 ✅ |
| FR-19 | Painel de concessão e auditoria | Toda decisão `ask`/`deny` visível com horário e ator | M1 |
| FR-20 | Ferramentas de arquivo (ler, escrever, listar) | Operações respeitam o motor de permissões | M3 |
| FR-21 | Execução de shell com sandbox de política | Comando fora da política é bloqueado antes de rodar | M3 |
| FR-22 | Automação de GUI via cua-driver | Ação de UI exige aprovação e é auditada | M3 |
| FR-23 | Servidores MCP configuráveis | Conectar, listar ferramentas e desconectar | M3 |

### 1.4 Memória

| ID | Requisito | Critério de aceite | Marco |
| --- | --- | --- | --- |
| FR-24 | Salvar memória por agente com origem | Memória guarda texto, origem e turno de origem | M4 |
| FR-25 | Busca full-text em memórias | Consulta retorna resultados ranqueados | M4 |
| FR-26 | Injetar memórias relevantes no contexto | Contexto inclui apenas memórias selecionadas | M4 |
| FR-27 | Editar e esquecer memória | Exclusão remove da busca e do contexto | M4 |

### 1.5 Voz

| ID | Requisito | Critério de aceite | Marco |
| --- | --- | --- | --- |
| FR-28 | Ativar por wake word | Palavra de ativação inicia escuta sem clique | M4 |
| FR-29 | Transcrever fala em texto | Texto transcrito inicia turno do agente | M4 |
| FR-30 | Responder em voz com streaming | Áudio começa antes do fim da resposta | M4 |
| FR-31 | Interromper fala (barge-in) | Falar durante a resposta cancela o áudio | M4 |
| FR-32 | Refletir estado de voz na UI | Estados `idle`…`error` correspondem ao pipeline real | M4 |
| FR-33 | Funcionar com VoiceStudio offline | UI mostra indisponível; nenhuma resposta simulada | M4 |

### 1.6 Operação e distribuição

| ID | Requisito | Critério de aceite | Marco |
| --- | --- | --- | --- |
| FR-34 | Instalador Windows | Instala, cria atalho e abre | M7 |
| FR-35 | Modo portátil em pendrive | Executa a partir da unidade removível com dados locais | M7 |
| FR-36 | Backup e restauração | Exporta e importa banco + configurações | M7 |
| FR-37 | Exportar/importar agente | Arquivo versionado com schema validado | M7 |
| FR-38 | Atualização desativada por padrão | Nenhuma chamada de update sem canal assinado | M7 |

## 2. Requisitos não funcionais

| ID | Requisito | Métrica | Marco |
| --- | --- | --- | --- |
| NFR-01 | Abertura rápida | Janela visível em < 2 s em SSD | M2 |
| NFR-02 | Evento rápido | Append em < 5 ms (WAL) | M1 |
| NFR-03 | Memória em repouso | < 300 MB RSS | M2 |
| NFR-04 | Build reprodutível | `pnpm build` limpo em < 60 s | M0 ✅ |
| NFR-05 | Cobertura de testes do núcleo | ≥ 80% em `packages/core` | M1 |
| NFR-06 | Sem módulo nativo | Nenhuma dependência exige compilador C++ | M0 ✅ |
| NFR-07 | Segurança do renderer | `contextIsolation`, `sandbox`, sem Node, CSP restritiva | M0 ✅ |
| NFR-08 | Credenciais protegidas | Nenhuma chave em texto puro no SQLite/log | M2 |
| NFR-09 | Auditoria completa | 100% das decisões de risco registradas | M1 |
| NFR-10 | Acessibilidade | Navegação por teclado e contraste AA nas telas principais | M3 |
| NFR-11 | Idioma | Interface em pt-BR; código e contratos em inglês | M0 ✅ |
| NFR-12 | Offline-first | Núcleo funciona sem rede; rede só para provedor | M0 ✅ |

## 3. Restrições

- Windows é o alvo primário; o código evita APIs exclusivas, mas não há suporte testado a outros SOs.
- Hardware de referência sem GPU dedicada: modelos locais limitados a ~3–8B em Q4.
- VoiceStudio é dependência opcional em processo separado (AGPL).
- Nenhum código, asset ou schema do OpenBot.
- Sem credenciais em texto puro.
- Ações destrutivas sempre exigem confirmação.

## 4. Fora de escopo (ciclo atual)

- Canais de mensageria e apps mobile.
- Editor visual de workflow.
- Marketplace de plugins.
- Sincronização em nuvem.
- macOS/Linux empacotados.

## 5. Matriz de rastreabilidade (resumo)

| Marco | Requisitos |
| --- | --- |
| M0 | FR-01, FR-02, FR-16, FR-17, FR-18, NFR-04, NFR-06, NFR-07, NFR-11, NFR-12 |
| M1 | FR-03…FR-04, FR-19, NFR-02, NFR-05, NFR-09 |
| M2 | FR-05…FR-15, NFR-01, NFR-03, NFR-08 |
| M3 | FR-20…FR-23, NFR-10 |
| M4 | FR-24…FR-33 |
| M5 | FR-07 |
| M6 | FR-08 |
| M7 | FR-34…FR-38 |
