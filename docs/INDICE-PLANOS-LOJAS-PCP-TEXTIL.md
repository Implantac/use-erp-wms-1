# Índice de planos — Controle de Lojas e PCP Têxtil

- **Data da revisão:** 05/11/2026.
- **Baseline:** Git `8a5dbb35b328e890c377dffcdb595fc618d04c34`.
- **Plano canônico:** [PLANO-MESTRE-LOJAS-PCP-TEXTIL.md](PLANO-MESTRE-LOJAS-PCP-TEXTIL.md).
- **Estado de produção:** **NO-GO**.
- **Mudanças de estado posteriores à revisão:** ver §6 (SEC-02/03, QA-01 e INC-01). As seções 1–5 e a baseline `8a5dbb35` permanecem como fotografia de 05/11/2026.

---

## 1. Finalidade e regra de substituição

Este índice classifica os **101 documentos candidatos** localizados em `docs/` e `.lovable/` por nome e por conteúdo. A busca é propositalmente ampla: inclui referências periféricas para que nenhuma origem de requisito fique fora da revisão.

**Substituir não é apagar.** Nenhum arquivo foi removido, reescrito ou convertido em “atual”. A substituição vale apenas para responder *“qual é o estado e a prioridade agora?”*: nessa pergunta, prevalece o plano-mestre. O documento antigo continua sendo a evidência do que se decidiu, do que se testou e das contagens válidas na sua data.

| Código | Classificação | Como usar |
| --- | --- | --- |
| **C** | Canônico/navegação | Entrada de leitura e links para o plano ativo. |
| **H** | Histórico substituído | Consultar para cronologia e desenho; não copiar pendências nem contagens. |
| **E** | Evidência/governança datada | Valor probatório limitado à data, commit e ambiente registrados. |
| **R** | Requisito/manual | Fonte de escopo; confrontar com código antes de declarar entrega. |
| **A** | Roteiro com ressalvas | Usar somente em ambiente isolado, atualizando baseline e evidências. |
| **X** | Não canônico/inseguro | Não usar como aceite; ver seção 6 e REV-08. |
| **P** | Contexto periférico | Manter como histórico; não altera a matriz do plano. |

Além dos 101 candidatos, a revisão **criou o plano-mestre e este índice** (commit `5982a064`). O resumo executivo fica fora do repositório, em `/home/user/REVISAO-PLANOS-LOJAS-PCP-TEXTIL-2026-11-05.md`.

Documentos acrescentados na etapa de implementação, que não fazem parte dos 101 candidatos: [DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md](DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md) (contrato proposto para LOJ-05/06, não implementado) e o parecer externo `/home/user/AVALIACAO-TECNICA-ERP-2026-11-05.md` (due diligence de aquisição). O índice continua classificando apenas o inventário histórico; mudanças de estado são governadas pelo plano-mestre.

---

## 2. Inventário classificado

Distribuição: **C** = 1, **H** = 30, **E** = 25, **R** = 8, **A** = 13, **X** = 1, **P** = 23; total **101**.

### 1. Canônico e navegação

Documento que organiza a leitura atual.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 56 | [Documentação Técnica — READ & GROW](README.md) | Índice de navegação da documentação; atualizado com os links canônicos. | §1 |

### 2. Planos e estados históricos — substituídos para leitura de estado atual

Permanecem no repositório como origem e cronologia. Para saber o que está entregue ou pendente, usar o plano-mestre.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 6 | [USE Platform — Revisão Consolidada de Todos os Planos](../.lovable/plan-review-2026-08-02.md) | Antiga revisão consolidada de planos; substituída por este índice como inventário e pelo plano-mestre como estado. | §1, §7 |
| 8 | [Consolidação enterprise e contexto operacional canônico](../.lovable/plan/consolidação-enterprise-e-contexto-operacional-canônico-2026-09-11.md) | Consolidação enterprise/contexto canônico da época; requisitos absorvidos. | LOJ-12, PCP-06 |
| 9 | [Gestão de Rede: Lojas + CD + Fábrica — Fase 1 a 5](../.lovable/plan/gestão-de-rede-lojas-cd-fábrica-fase-1-a-5-2026-09-10.md) | Plano fase 1–5 da rede Lojas+CD+Fábrica; não usar como checklist vigente. | LOJ-01 a LOJ-03, §4 |
| 12 | [Plano de Consolidação: Central de Abastecimento e Ecossistema de Lojas](../.lovable/plan/plano-de-consolidação-central-de-abastecimento-e-ecossistema-2026-08-14.md) | Consolidação da Central de Abastecimento; substituído pela matriz de lojas. | LOJ-02, LOJ-09, LOJ-15 |
| 14 | [Plano de Estabilização e Auditoria do Motor de Abastecimento](../.lovable/plan/plano-de-estabilização-e-auditoria-do-motor-de-abastecimento-2026-08-14.md) | Auditoria do motor de abastecimento; estado já superado por consultas reais. | LOJ-09, §4 |
| 16 | [Plano de Expansão: Torre de Controle e Inteligência de Abastecimento](../.lovable/plan/plano-de-expansão-torre-de-controle-e-inteligência-de-abaste-2026-08-14.md) | Torre de controle e inteligência; separa entregue de visão futura. | LOJ-15, LOJ-16, P2 |
| 20 | [Plano de Implementação - Hardening Enterprise & Automação Fiscal](../.lovable/plan/plano-de-implementação-hardening-enterprise-automação-fiscal-2026-08-15.md) | Hardening e automação fiscal da época; configuração não é homologação externa. | LOJ-13, EXT-01 |
| 21 | [Plano de Implementação: Store Management 2.0 (Minha Loja)](../.lovable/plan/plano-de-implementação-store-management-2-0-minha-loja-2026-08-15.md) | Store Management 2.0 — Minha Loja; origem do programa, não estado atual. | LOJ-07, LOJ-08, §4 |
| 22 | [Plano de Implementação: Testes E2E e Rastreabilidade Logistic-Fiscal](../.lovable/plan/plano-de-implementação-testes-e2e-e-rastreabilidade-logistic-2026-08-15.md) | Plano antigo de E2E/rastreabilidade logistic-fiscal; não é prova de aceite. | QA-01, QA-02, LOJ-13 |
| 23 | [Plano de Reestruturação: Sistema Operacional da Unidade (SOU)](../.lovable/plan/plano-de-reestruturação-sistema-operacional-da-unidade-sou-2026-08-12.md) | SOU — Sistema Operacional da Unidade; requisitos absorvidos pela central e contexto. | LOJ-07, LOJ-12 |
| 25 | [Plano: Inteligência e Auditoria de Abastecimento Read & Grow](../.lovable/plan/plano-inteligência-e-auditoria-de-abastecimento-read-grow-2026-08-14.md) | Inteligência e auditoria de abastecimento; separar motor real de IA/automação. | LOJ-09, LOJ-15, P2 |
| 26 | [Reforma de UX, navegação e intuitividade — USE SISTEMAS ERP](../.lovable/plan/reforma-de-ux-navegação-e-intuitividade-use-sistemas-erp-2026-09-10.md) | Reforma de UX/navegação; origem de requisitos de interface. | LOJ-12, P1/UX |
| 27 | [USE Platform — Revisão Consolidada dos Planos e Prontidão para Produção](../.lovable/production-readiness-2026-07-30.md) | Revisão consolidada e prontidão de produção julho/2026; portão antigo. | §8.3 |
| 32 | [READ & GROW — PROGRAMA DE EVOLUÇÃO ENTERPRISE](../.lovable/strategy/store-management-2.0-directive.md) | Diretiva Store Management 2.0; programa enterprise confrontado nesta revisão. | LOJ-07, LOJ-08, LOJ-11, §4 |
| 33 | [Diagnóstico Funcional e Arquitetural: Ecossistema de Abastecimento e Lojas](../.lovable/strategy/supply-chain-diagnostic-2026.md) | Diagnóstico funcional de abastecimento e lojas; lacunas reavaliadas. | LOJ-02, LOJ-03, LOJ-09 |
| 36 | [Auditoria do PCP contra as skills setoriais (fiação, tecelagem/malharia, tinturaria)](AUDITORIA-PCP-SKILLS.md) | Auditoria contra skills setoriais; várias pendências foram superadas por T81–T92. | §5, §6, REV-01 |
| 40 | [Situação das funcionalidades — avaliação pré-produção (08/10/2026)](FEATURE_STATUS.md) | Situação das funcionalidades em 08/10/2026; contagens e estados antigos. | §4, §5, REV-09 |
| 53 | [Plano de implementação, correção e ajustes — entrada em produção](PLANO-ENTRADA-PRODUCAO.md) | Plano de entrada em produção com contagens e pendências antigas. | §7, §8.3, REV-09 |
| 54 | [Plano — de piloto avançado a produto vendável (v1.1.0)](PLANO-PRODUTO-VENDAVEL.md) | Plano de produto vendável v1.1.0; estado comercial/homologação antigo. | §7, §8.3 |
| 57 | [Relatório — o que ainda falta para a excelência](RELATORIO-O-QUE-FALTA.md) | Relatório “o que falta” com contagens/estados da época. | §7, REV-09 |
| 58 | [Revisão do fluxo operacional de controle de lojas](REVISAO-FLUXO-LOJAS.md) | Revisão do fluxo operacional de lojas; pendências reavaliadas. | §4, LOJ-01 a LOJ-04 |
| 60 | [Revisão do fluxo operacional — Central PCP Tecelagem (`/vertical/weaving`)](REVISAO-FLUXO-TECELAGEM.md) | Revisão da Central PCP Tecelagem; lacunas de ficha/rolo superadas. | §6.3, REV-01 |
| 62 | [Revisão dos PCPs têxteis — na cadeira do gerente de chão de fábrica](REVISAO-PCP-GERENTE-CHAO-2026-10-27.md) | Revisão na cadeira do gerente de chão em 27/10; parte já corrigida. | §6, P1/UX, REV-01 |
| 63 | [Revisão — PCP por setor têxtil (fiação, malharia, tecelagem, tinturaria)](REVISAO-PCP-POR-SETOR.md) | Revisão PCP por setor; pendências parcialmente superadas. | §5, §6, REV-01 |
| 64 | [Revisão completa dos PCPs — Indústria Têxtil](REVISAO-PCP-TEXTIL.md) | Revisão completa dos PCPs; estado anterior às migrations T81–T92. | §5, §6, REV-01 |
| 65 | [Revisão de pendências — ERP/WMS, T101](REVISAO-PENDENCIAS-T101-2026-11-03.md) | Predecessor imediato: revisão de pendências T101; P0-02/P0-03 já fechados. | §3, §7, REV-03 |
| 66 | [Revisão de ponta a ponta — o que falta para atender com excelência](REVISAO-PONTA-A-PONTA-EXCELENCIA.md) | Revisão ponta a ponta de excelência; contagens e prioridades antigas. | §7, REV-09 |
| 88 | [Parecer de prontidão para uso real — 08/10/2026](governance/PARECER_PRONTIDAO_PRODUCAO_2026-10-08.md) | Parecer de prontidão 08/10/2026 com NO-GO e evidências antigas. | §8.3, REV-09 |
| 92 | [Plano de recuperação funcional — 08/10/2026](governance/PLANO_RECUPERACAO_2026-10-08.md) | Plano de recuperação funcional 08/10/2026; bloqueios reavaliados. | §7, §8.3 |
| 93 | [Portão de produção — ERP industrial (14/10/2026)](governance/PRODUCTION_GATE_2026-10-14.md) | Portão de produção 14/10/2026: NÃO LIBERADO naquela baseline. | §8.3 |

### 3. Evidência datada e governança — preservar, não reciclar como estado

Valem pelo que comprovaram na data indicada; não autorizam release nem provam uso real.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 41 | [Fluxo do PCP por setor — como funciona e por que "não andava"](FLUXO-PCP-OPERACIONAL.md) | Diário T81–T102; localizar decisões e migrations, não inferir estado atual. | §2.1, §5, REV-02 |
| 49 | [Mapa: Manual PCP Têxtil × Sistema (T92, 28/10/2026)](MAPA-MANUAL-PCP-TEXTIL.md) | Mapa Manual PCP Têxtil × Sistema até T92; rastreabilidade, não aceite de uso real. | §6, REV-02 |
| 55 | [Poda de telas — menu como ferramenta de trabalho (2026-10-23)](PODA-DE-TELAS.md) | Poda de telas e menu como ferramenta de trabalho; decisão datada. | P1/Legados |
| 59 | [Revisão do fluxo da Loja — testando como usuário de Loja](REVISAO-FLUXO-Loja-USUARIO.md) | Revisão como usuário de Loja; evidência de jornada, não aceite atual. | LOJ-12, QA-02 |
| 67 | [Revisão da tecelagem como o gerente de PCP usa](REVISAO-TECELAGEM-USUARIO.md) | Revisão da tecelagem pelo gerente de PCP; evidência de uso datada. | §6.3, QA-03 |
| 69 | [Teste do fluxo operacional entre as quatro centrais de PCP](TESTE-FLUXO-SETORES.md) | Cenário de fluxo entre as quatro centrais; base para QA-03, não aceite. | QA-03, §8.2 |
| 72 | [Relatório de evidências — Lote P0](audits/p0-evidence-report-2026-09-11.md) | Relatório de evidências do lote P0 em 11/09/2026; datado. | §2.1 |
| 73 | [Auditoria de UX — USE SISTEMAS ERP](audits/ux-audit.md) | Auditoria de UX; origem de melhorias, não estado atual. | P1/UX |
| 74 | [Score de UX — USE SISTEMAS ERP](audits/ux-score.md) | Score de UX; fotografia datada, não aceite. | P1/UX |
| 78 | [Contenção da transferência legada e do ajuste direto de estoque](governance/CONTENCAO_TRANSFERENCIAS_LEGADAS_2026-10-08.md) | Contenção das transferências legadas e ajuste direto de estoque. | LOJ-01, P1/Legados |
| 79 | [Playwright CI — estado e limites](governance/E2E_CI_STATUS_2026-10-08.md) | Estado/limites do Playwright CI em 08/10/2026; golden paths seguem não provados. | QA-01, QA-03, §2.1 |
| 80 | [Ensaio real de isolamento RLS entre empresas](governance/ENSAIO_RLS_A_B.md) | Ensaio real A/B de RLS; evidência a repetir nos fluxos novos. | SEC-01, PCP-06 |
| 81 | [Gate RLS SQL do CI — escopo e segurança](governance/GATE_RLS_CI_2026-10-08.md) | Escopo e segurança do gate RLS no CI; evidência datada. | SEC-01 |
| 82 | [Execução industrial: primeiro incremento transversal — 15/10/2026](governance/INDUSTRIAL_EXECUTION_INCREMENT_2026-10-15.md) | Primeiro incremento transversal de execução industrial, 15/10/2026. | §5 |
| 83 | [Auditoria industrial têxtil — USE ERP-WMS (19/10/2026)](governance/INDUSTRIAL_TEXTILE_AUDIT_2026-10-19.md) | Auditoria industrial têxtil 19/10/2026; matriz e lacunas da época. | §5, §6 |
| 84 | [Lote 1 — Diagnóstico e matriz de rastreabilidade industrial têxtil](governance/INDUSTRIA_TEXTIL_RASTREABILIDADE_2026-10-13.md) | Diagnóstico e matriz de rastreabilidade industrial, lote 1. | §5, PCP-05 |
| 85 | [PCP / Lovable — tela de OP e publicação controlada (16/10/2026)](governance/LOVABLE_PCP_OP_PRESENTATION_GATE_2026-10-16.md) | Gate de apresentação da tela de OP em 16/10/2026; não é release. | §8.3 |
| 86 | [Pacote controlado GitHub → Lovable → Supabase (16/10/2026)](governance/LOVABLE_PCP_RELEASE_PACKAGE_2026-10-16.md) | Pacote controlado GitHub → Lovable → Supabase em 16/10/2026. | OPS-01, REV-07 |
| 89 | [Incremento após `023edbd2` — qualidade de amostras de datas no BI](governance/PCP_BI_INCREMENTAL_2026-10-14.md) | Incremento de qualidade de datas no BI, 14/10/2026. | PCP-10 |
| 90 | [PCP operacional — gate para apresentação têxtil integrada (16/10/2026)](governance/PCP_PRESENTATION_GATE_2026-10-16.md) | Gate para apresentação têxtil integrada, 16/10/2026. | §8.3 |
| 94 | [Relatório executivo — evolução da produção industrial](governance/RELATORIO_PRODUCAO_STATUS_2026-10-15.md) | Relatório executivo de evolução industrial, 15/10/2026; datado. | §2.1 |
| 95 | [Incremento: cadastro de equipamentos de produção — 15/10/2026](governance/TEXTILE_EQUIPMENT_INCREMENT_2026-10-15.md) | Incremento de cadastro de equipamentos, 15/10/2026. | §6 |
| 96 | [Genealogia têxtil — segundo incremento, 16/10/2026](governance/TEXTILE_LINEAGE_GATE_2026-10-16.md) | Genealogia têxtil, segundo incremento 16/10/2026. | PCP-05, PCP-07 |
| 97 | [Núcleo têxtil parametrizável — primeiro incremento (16/10/2026)](governance/TEXTILE_PROCESS_FOUNDATION_2026-10-16.md) | Núcleo têxtil parametrizável, primeiro incremento 16/10/2026. | §5 |
| 98 | [Matriz de rastreabilidade crítica](governance/TRACEABILITY_MATRIX.md) | Matriz de rastreabilidade crítica; evidência de governança. | §5, §8.3 |

### 4. Requisitos, manuais e mapas — fontes de escopo

Descrevem o comportamento esperado; não declaram implementação nem aceite.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 37 | [Avaliação — cliente "indústria + 04 lojas" × USE ERP WMS](AVALIACAO-INDUSTRIA-LOJAS.md) | Avaliação do cliente “indústria + 4 lojas”; fonte de escopo, lacunas substituídas. | §4, §6, §8.2 |
| 42 | [Grupo multiempresa — lojas-filiais (mesmo CNPJ) × lojas-empresas (CNPJs)](GRUPO-MULTICNPJ.md) | Regras de filiais mesmo CNPJ × empresas com CNPJs distintos. | LOJ-01, LOJ-03, LOJ-05, LOJ-06 |
| 45 | [Guia operacional industrial têxtil — USE ERP-WMS](INDUSTRIAL_TEXTILE_GUIDE.md) | Guia industrial: perfis, PCP/MRP, qualidade, indicadores e limites. | §5, §6 |
| 48 | [Manual do usuário — por papel](MANUAL-DO-USUARIO.md) | Manual do usuário por papel; fonte de jornadas esperadas. | §8.2, QA-03 |
| 75 | [Mapa de Processos Empresariais (Business Processes)](business/BUSINESS_PROCESSES.md) | Mapa de processos empresariais; fonte de requisitos de negócio. | §4, §5 |
| 77 | [Produção configurável por empresa: contrato e limites](governance/ARQUITETURA_INDUSTRIAL_CONFIGURAVEL.md) | Contrato de produção configurável por empresa e limites. | PCP-01, PCP-06 |
| 100 | [MANUAL DE TREINAMENTO PARA IA](manuais/Manual_Treinamento_IA_PCP_Textil_Pluma_ao_Tecido.md) | Manual de treinamento para IA, pluma ao tecido; requisitos setoriais. | §6, P2 |
| 101 | [Instrução principal — IA especialista em PCP de Tinturaria](manuais/Prompt_IA_PCP_Tinturaria.md) | Prompt de IA para PCP de Tinturaria; insumo, não implementação nem evidência. | §6.4, P2 |

### 5. Roteiros de aceite/homologação — usar com as ressalvas

Continuam úteis, mas exigem ambiente isolado, baseline identificada e registro de evidência.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 4 | [Backup, Restore e Teste de Carga](../.lovable/ops/backup-restore.md) | Procedimento de backup/restore e carga; ensaio precisa ser datado e incluir funções/serviços. | OPS-01, §8.3 |
| 38 | [Backup e recuperação — procedimento pré-produção](BACKUP.md) | Plano de ensaio de backup; explicitamente NÃO HOMOLOGADO. | OPS-01, §8.3 |
| 39 | [E2E — Lojas e smoke de navegador](E2E-Lojas.md) | Regras de isolamento, limites dos testes e lacuna da jornada por cliques. | QA-01, QA-02, §8.1 |
| 43 | [Guia rápido de operação — USE ERP local (BIL)](GUIA-OPERACAO.md) | Guia rápido de operação local e PCPs; útil, mas instruções dependem da baseline. | OPS-01, §8.2 |
| 44 | [Roteiro de homologação local — USE ERP-WMS (produção têxtil)](HOMOLOGACAO-LOCAL.md) | Roteiro de homologação local; traz 459 migrations e 94/94, números históricos. | OPS-01, §8.3, REV-09 |
| 46 | [Instalação em máquina limpa — roteiro de teste](INSTALACAO-MAQUINA-LIMPA.md) | Instalação em máquina limpa; repetir no candidato exato de release. | OPS-01 |
| 47 | [USE ERP — Instalação 100% local (PostgreSQL local, sem nuvem)](INSTALL-LOCAL.md) | Instalação local self-hosted; atualização das funções/rollback ainda a ensaiar. | OPS-01, REV-07 |
| 50 | [PCP de Tecelagem — experiência do gerente](PCP-TECELAGEM-EXPERIENCIA-GERENTE.md) | Roteiro de teste moderado do gerente de tecelagem; ainda pendente. | §6.3, QA-03, P1/UX |
| 51 | [Piloto de 30 dias — roteiro operacional](PILOTO-30-DIAS.md) | Piloto de 30 dias; expandir para quatro setores e intercompany por produção. | EXT-01, §8.3 |
| 52 | [Piloto — Semana 1: cadastros reais (dia a dia)](PILOTO-SEMANA-1.md) | Piloto semana 1 de cadastros reais; executar só em ambiente isolado. | EXT-01 |
| 70 | [Treinamento por papel — sessões práticas (30–45 min cada)](TREINAMENTO-POR-PAPEL.md) | Treinamento por papel; usar com massa isolada e registrar aceite. | QA-03, EXT-01 |
| 76 | [Implantação fiscal por cliente — estrutura e gates](fiscal/ONBOARDING_CLIENTE_FISCAL.md) | Onboarding fiscal por cliente e gates; depende de homologação externa. | LOJ-13, EXT-01 |
| 91 | [Piloto integrado: pluma → tecido plano / malha → acabamento](governance/PILOTO_TEXTIL_PLUMA_A_PRODUTO_FINAL.md) | Piloto integrado pluma → tecido/malha → acabamento; executar com QA-03. | QA-03, EXT-01 |

### 6. Roteiro não canônico / inseguro

Não executar como aceite; contém instruções superadas ou sem portão de isolamento.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 68 | [Roteiro de testes — Controle de Lojas (rodada completa)](ROTEIRO-TESTES-Lojas.md) | Login fixo, comandos de reparo/atualização e sem portão de isolamento. | REV-08; substituído por E2E-Lojas.md e QA-01/02 |

### 7. Contexto periférico — não altera o plano

Auditorias amplas, estratégia, arquitetura e histórico fora do recorte de lojas/PCP.

| # | Documento | Finalidade / ressalva | Destino no plano |
| --- | --- | --- | --- |
| 1 | [USE Platform — Auditoria Global (Fase 1)](../.lovable/audit-2026-07-21-global.md) | Auditoria global de julho/2026; contexto de plataforma, anterior ao recorte de lojas/PCP. | §1, §2.1 |
| 2 | [USE Enterprise Evolution Pack v1.0 — Inventário & Auditoria Consolidada](../.lovable/evolution-pack-inventory.md) | Inventário do pacote de evolução enterprise; contexto histórico. | §1 |
| 3 | [UEEF Maturity Audit — 2026-06](../.lovable/maturity-audit-2026-06.md) | Auditoria de maturidade junho/2026; sem estado do escopo atual. | §1 |
| 5 | [Fase 0 — Auditoria de Segurança & Estabilização](../.lovable/phase-0-audit.md) | Fase 0 de segurança e estabilização; evidência antiga. | §8.3 |
| 7 | [AUD-3 — Refactor de Tipagem por Domínio](../.lovable/plan/aud-3-refactor-de-tipagem-por-domínio-2026-08-11.md) | Refatoração de tipagem por domínio; fora do escopo funcional. | §1 |
| 10 | [Master Plan — Fase de Governança e Consolidação (Equipe Software House)](../.lovable/plan/master-plan-fase-de-governança-e-consolidação-equipe-softwar-2026-08-11.md) | Master plan de governança de software house; contexto. | §1 |
| 11 | [Objetivos](../.lovable/plan/objetivos-2026-08-15.md) | Objetivos gerais de agosto/2026; contexto. | §1 |
| 13 | [Plano de Estabilização de Renderização (Definitivo)](../.lovable/plan/plano-de-estabilização-de-renderização-definitivo-2026-08-14.md) | Estabilização de renderização; fora do escopo. | §1 |
| 15 | [Plano de Evolução ERP Enterprise — READ & GROW](../.lovable/plan/plano-de-evolução-erp-enterprise-read-grow-2026-08-15.md) | Plano de evolução ERP enterprise; contexto estratégico. | §1 |
| 17 | [Plano de Implementação: Evolução ERP Enterprise](../.lovable/plan/plano-de-implementação-evolução-erp-enterprise-2026-08-14.md) | Plano de implementação enterprise amplo; contexto. | §1 |
| 18 | [Plano de Implementação: Evolução ERP Enterprise 2026 - Auditoria & Hardening](../.lovable/plan/plano-de-implementação-evolução-erp-enterprise-2026-auditori-2026-08-16.md) | Auditoria e hardening enterprise; contexto. | §8.3 |
| 19 | [Plano de Implementação - Evolução ERP Enterprise (Fase 3 & 4)](../.lovable/plan/plano-de-implementação-evolução-erp-enterprise-fase-3-4-2026-08-15.md) | Fases 3 e 4 enterprise; contexto. | §1 |
| 24 | [Plano de Refatoração Profunda — Read & Grow ERP (Phase: Architecture Hardening)](../.lovable/plan/plano-de-refatoração-profunda-read-grow-erp-phase-architectu-2026-08-13.md) | Refatoração arquitetural profunda; fora do escopo. | §1 |
| 28 | [Auditoria de Revisão do Projeto - Read & Grow Enterprise ERP 2026](../.lovable/strategy/auditoria-revisao-projeto-2026-08-17.md) | Auditoria de revisão de projeto; contexto. | §1 |
| 29 | [Auditoria e Plano de Implementação: READ & GROW Enterprise](../.lovable/strategy/enterprise-audit-report.md) | Auditoria/plano enterprise READ & GROW; contexto. | §1 |
| 30 | [Evolução Estratégica READ & GROW - 11/08/2026](../.lovable/strategy/evolution-analysis-2026-08-11.md) | Evolução estratégica agosto/2026; contexto. | §1 |
| 31 | [Status Sprints S4/S5/S6 — 21 jul 2026](../.lovable/strategy/sprint-status-2026-07-21.md) | Status de sprints S4/S5/S6; evidência datada alheia ao recorte. | §1 |
| 34 | [Use ERP → Plataforma Moldável (Commerce + Marketplace) — Revisão Estratégica](../.lovable/strategy/use-erp-platform-vision-review.md) | Visão de plataforma moldável/commerce; fora do escopo. | §1 |
| 35 | [Auditoria completa (software house) + análise de mercado — USE ERP WMS](ANALISE-COMPLETA-SOFTWARE-HOUSE.md) | Auditoria completa de software house e mercado; contexto externo. | §1 |
| 61 | [Revisão geral do projeto — USE ERP + WMS](REVISAO-GERAL-PROJETO.md) | Revisão geral do projeto USE ERP + WMS; contexto. | §1 |
| 71 | [System Map (Mapa Oficial do Sistema)](architecture/SYSTEM_MAP.md) | Mapa oficial do sistema; contexto arquitetural. | §1 |
| 87 | [Master Transformation Audit (Diagnóstico Mestre) - 2026-08-11](governance/MASTER_TRANSFORMATION_AUDIT.md) | Master Transformation Audit de agosto/2026; contexto. | §1 |
| 99 | [READ & GROW — PLANO MASTER DE HARDENING ANTES DE NOVAS FUNCIONALIDADES](hardening/MASTER_PLAN.md) | Plano master de hardening; histórico de evolução, não plano ativo deste escopo. | §1 |

---

## 3. Crosswalk das pendências antigas

Estas são as conversões que mais causavam leitura duplicada. A coluna do meio é o estado confirmado nesta revisão; a da direita é onde o assunto passa a ser governado.

| Alegação em documento antigo | Estado confirmado na baseline | Governo atual |
| --- | --- | --- |
| Permissões por gerente/setor e RLS pendentes | `user_sector_access`, guards e ensaio A/B implementados; falta jornada por papel no navegador | PCP-06, SEC-01, QA-03 |
| ΔE/lab dip, receitas versionadas, dosagem e composição ausentes | T85 e motor de consumo implementados; valores são medidos/informados, não simulados | §6.4, PCP-01 |
| Gramatura/largura/ficha do artigo/rolo de tecelagem inexistentes | `textile_article_sheets`, unidades logísticas e inspeção implementados | §6.3, PCP-07 |
| Preparação de urdume e eficiência pendentes | Urdimento/engomagem registrados; rolo de urdume ainda é identificador textual, não lote intermediário autônomo | §6.3 (Parcial) |
| Indicadores e OEE “por implementar” | Fórmulas reais com denominador configurado; sem dados retornam nulo. OEE completo e telemetria não estão integrados | PCP-09, PCP-12, P2 |
| Decisão `produzir` pendente | P0-03 fechado: OP criada e vinculada atomicamente. O ciclo posterior **não** fecha | LOJ-04, LOJ-05, LOJ-06 |
| “Todos os temas provados” = sistema pronto | Harness 244 PASS / 430 unitários / CI verde provam regras; não provam cliques, usuário, fiscal nem piloto | §2.1, QA-01 a QA-03 |
| 438/459/476 migrations; 94/104/165/233 testes | Fotografias de datas diferentes. Baseline desta revisão: 502 migrations, harness 244 PASS, 430/430 unitários | §2.1, REV-09 |
| Atualização segura entregue | Resta comprovar rebuild/rollback de funções, restore cronometrado e máquina limpa no candidato exato | OPS-01, REV-07 |
| Homologação de Lojas concluída por roteiro antigo | Spec por API não prova cliques; smoke autenticado não é jornada; roteiro com login fixo não é aceite | QA-02, REV-08 |
| IA/OEE/IoT como entregas do PCP | São visão futura, condicionadas a sensores, dados e demanda reais | P2 |
| Portões de produção antigos | Decisão permanece **NO-GO**; mudanças de baseline não reabrem autorização | §8.3 |

---

## 4. Números e instruções que não devem ser copiados

- **Contagens desatualizadas:** `FEATURE_STATUS.md`, `HOMOLOGACAO-LOCAL.md`, `PLANO-ENTRADA-PRODUCAO.md`, `PLANO-PRODUTO-VENDAVEL.md`, `RELATORIO-O-QUE-FALTA.md`, `REVISAO-PONTA-A-PONTA-EXCELENCIA.md`, `REVISAO-PENDENCIAS-T101-2026-11-03.md`, `governance/PARECER_PRONTIDAO_PRODUCAO_2026-10-08.md`, `governance/PRODUCTION_GATE_2026-10-14.md` e `governance/E2E_CI_STATUS_2026-10-08.md`. Citar sempre com data, commit e ambiente; nunca como estado de 05/11/2026.
- **Instruções sem portão de isolamento:** `ROTEIRO-TESTES-Lojas.md` contém conta fixa e comandos de reparo/atualização. Prevalecem `E2E-Lojas.md`, QA-01 e a regra de nunca usar contas ou bancos de produção.
- **Evidência ausente:** nenhum teste `fixme`, `skip`, job autenticado falho ou smoke público conta como aceite. O golden path de produção continua `fixme`.
- **Documentos de apresentação:** gates de 16/10/2026 autorizam demonstração, não release nem aplicação de migrations.

## 5. Regra de precedência

Em divergência, usar esta ordem: **código/migrations e evidência identificada da baseline `8a5dbb35` → plano-mestre → índice → roteiros de aceite com ressalvas → documentos históricos**. Um documento novo que altere estado deve atualizar o plano-mestre e a linha correspondente deste índice na mesma mudança.

Para a sequência de trabalho, prioridades, dependências e critérios de saída, ver exclusivamente as seções 7 e 8 do [plano-mestre](PLANO-MESTRE-LOJAS-PCP-TEXTIL.md).

---

## 6. Registro de mudanças de estado posteriores à revisão (06/11/2026)

Esta seção cumpre a regra da §5 **sem reclassificar os 101 candidatos e sem reescrever a baseline `8a5dbb35`**: as seções 1–5 continuam sendo a fotografia de 05/11/2026. Ela apenas aponta onde o estado corrente passou a ser governado. **Produção: NO-GO em todas as linhas.**

| Commit | Mudança de estado | Onde está a evidência |
| --- | --- | --- |
| `5d1e1b64`, `91af8494` | LOJ-08 sem indicadores fabricados; desenho LOJ-05/06 (D1–D7) registrado **sem migration** | plano-mestre §7.1; `DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md` |
| `9080eead` | SEC-02/03: `.env` fora do índice, provisionamento por ambiente, refs/JWT legados removidos, `search_path` explícito e gates no harness/CI | `ENVIRONMENT.md` §0 |
| `582b9ee6` → `d7af1dfb` | QA-01: ambiente E2E isolado sem segredos (504 migrations, 7/7), correção das 3 regressões de CI e bundle MCP passando a ser gerado | `E2E-Lojas.md` §0; plano-mestre §7.1 |
| `14e793c` → QA-03 | Segunda identidade por papel, transporte com INSERT/UPDATE sob RLS, 3 golden paths convertidos de `fixme` e suíte isolada em 18/18 com `skip=0`; `complete_production_order()` registrado como pendência QA-03b | `E2E-Lojas.md` §0; plano-mestre §7.1 |
| QA-03b | `complete_production_order()` de ponta a ponta: BOM congelada, 3 etapas, qualidade, 2 lotes, lote de saída, ledger, `material_consumptions`, genealogia, replay idempotente e 3 cenários fail-closed; suíte isolada em **20/20, `skip=0`** | `E2E-Lojas.md` §0; plano-mestre §7.1 |
| QA-04 | Segundo tenant completo no boot e RLS entre empresas sem segredos; suíte isolada em **22/22, `skip=0`**. Inventário dos **18** segredos do gate autenticado e plano de rotação em `E2E-SEGREDOS-E-ROTACAO.md` — gate **não** afrouxado | `E2E-SEGREDOS-E-ROTACAO.md`; `E2E-Lojas.md` §0 |
| QA-05 | Diagnóstico causal do achado de RLS (`sync_rework_order_status` SECURITY INVOKER × grant só SELECT), duas barreiras congeladas em spec, decisão de **não** alterar schema; pré-voo validável dos 18 segredos; suíte isolada em **24/24, `skip=0`** | `E2E-Lojas.md` §0; `E2E-SEGREDOS-E-ROTACAO.md` |
| QA-06 | **Proposta não executada**: auditoria do ambiente Docker que já existia + overlay de homologação (`!reset` para loopback, tag fixa, `ANON_KEY` fail-closed), `bootstrap.sh`, template dos 18 nomes e validador estático com 14 testes; `ADR-QA05-GRANT-REWORK.md` com 4 opções e recomendação de não aplicar (o `GRANT UPDATE` isolado gera falso verde por RLS sem policy `FOR UPDATE`). Nenhum container, migration, grant, segredo ou gate alterado | `infra/homologacao/README.md`; `ADR-QA05-GRANT-REWORK.md`; `HOMOLOGACAO-LOCAL.md` §0 |
| `4365895` | Evidência dos runs de CI levada para os documentos versionados | `E2E-Lojas.md` §0; plano-mestre §7.1 |
| `0211229` | INC-01: publicação no Lovable sem `VITE_SUPABASE_*` resultou em `supabaseKey is required.`; correção é **operacional** (painel + rebuild), não versionar `.env` | `ENVIRONMENT.md` §0.1; `src/integrations/supabase/client.ts` |

**Documentos novos fora dos 101 candidatos:** `ENVIRONMENT.md`. `E2E-Lojas.md` e o plano-mestre já existiam na revisão e foram atualizados; suas linhas no inventário (§2) seguem válidas como classificação. O parecer de due diligence continua fora do repositório, em `/home/user/AVALIACAO-TECNICA-ERP-2026-11-05.md`.

| QA-02 (06–07/11/2026) | Primeira escrita de negócio e depois a **cadeia completa** de abastecimento (decisão, expedição, divergência e saldo) no ambiente isolado: 11 testes, `skip=0`, fixtures determinísticas no boot. Golden paths `fixme` e separação de papéis ainda abertos | `E2E-Lojas.md` §0; `isolated-store-journey.spec.ts`; `isolated-store-chain.spec.ts` |

**INC-02 (06/11/2026):** o merge `3e23d4f`, do bot do Lovable, reintroduziu `.env` e o ref legado e falhou no gate SEC-02; foi corrigido por commit posterior sem apagar o arquivo do disco nem reescrever histórico. Detalhe e procedimento em `ENVIRONMENT.md` §0.1.

**Ressalva de governança (INC-01):** `CI` verde valida diff de fontes, suítes e harness; **não executa o bundle com variáveis reais de ambiente**. Nenhuma linha desta seção é aceite formal — continua exigindo commit, ambiente, data, responsável e smoke pós-publicação.
