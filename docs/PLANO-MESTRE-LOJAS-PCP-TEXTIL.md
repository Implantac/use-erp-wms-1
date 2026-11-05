# Plano-mestre — Controle de Lojas e PCP Têxtil

- **Situação:** documento canônico de planejamento a partir de 05/11/2026.
- **Escopo:** lojas, CD/fábrica, abastecimento e PCP de fiação, malharia, tecelagem e tinturaria.
- **Baseline revisada:** Git `8a5dbb35b328e890c377dffcdb595fc618d04c34`.
- **Índice dos documentos revisados:** [INDICE-PLANOS-LOJAS-PCP-TEXTIL.md](INDICE-PLANOS-LOJAS-PCP-TEXTIL.md).
- **Estado de produção:** **NO-GO**. Este documento não publica app, não aplica migrations e não autoriza uso operacional.

---

## 1. Decisões de governança

1. **Este é o plano ativo.** Planos `.lovable/plan`, revisões datadas, `FEATURE_STATUS.md`, `FLUXO-PCP-OPERACIONAL.md` e auditorias antigas permanecem como histórico e evidência da época, não como checklist vigente.
2. O inventário e o destino de cada documento estão no índice associado. Não se apaga histórico nem se reescreve uma evidência antiga para fazê-la parecer atual.
3. Uma pendência só pode ser reaberta a partir de documento antigo depois de confrontar o código e os testes atuais.
4. Uma melhoria só pode ser declarada concluída com indicação da camada de evidência. “Existe código”, “harness verde”, “E2E de navegador verde”, “usuário homologou” e “está em produção” são estados diferentes.
5. Toda mudança futura deste escopo deve atualizar a matriz deste plano, informar commit/ambiente e anexar evidência. Contagens antigas não serão copiadas como se fossem atuais.
6. O escopo funcional desta revisão é documental. As lacunas abaixo são um plano de trabalho, não funcionalidades entregues nesta rodada.

### 1.1 Vocabulário obrigatório

| Rótulo | Significado |
| --- | --- |
| **Implementado** | Há implementação aderente e evidência automatizada no nível informado. Não implica homologação por usuário nem produção. |
| **Parcial** | Parte do requisito existe, mas faltam invariantes, profundidade, integração ou prova exigida. |
| **Pendente** | Requisito necessário ao ciclo atual ainda não entregue ou não comprovado no nível exigido. |
| **Visão futura** | Diferencial não comprometido para a liberação atual; depende de demanda, dados ou integração real. |

Evidências são registradas separadamente como **código**, **unit/contrato**, **harness SQL**, **navegador E2E**, **usuário/piloto** e **produção**.

---

## 2. Veredito executivo

O núcleo transacional de estoque/produção e grande parte da especialização têxtil estão implementados e possuem testes automatizados. A baseline atual tem CI verde e o harness recente registra 244 asserções aprovadas. Isso **não** fecha a homologação operacional.

A revisão encontrou três bloqueios que os planos anteriores não fechavam de forma explícita:

1. **O abastecimento intercompany por produção não fecha o ciclo.** A OP é criada e vinculada atomicamente, mas não existe transição da conclusão produtiva para demanda de venda, disponibilização, expedição e recebimento da loja.
2. **O recebimento intercompany não está vinculado à expedição.** A RPC exige apenas solicitação `aprovada`, não consulta a expedição do `sales_order_id` e não limita a quantidade recebida ao restante solicitado/expedido.
3. **Indicadores da Central da Loja ainda podem produzir falsa confiança.** Sem divergências — inclusive quando a consulta não retorna dados — a confiabilidade assume `99,2`; ranking usa posição da unidade na lista, e erros de contagens podem virar zero.

Além disso, os E2E autenticados não foram aceitos, os golden paths de produção continuam sem prova de navegador, a atualização/restauração não fecha o serviço de funções, fiscal/PSP depende de homologação externa e o piloto real não foi comprovado.

### 2.1 Baseline e limites da evidência

| Camada | Evidência disponível na revisão | Limite |
| --- | --- | --- |
| Código | 502 migrations; centrais setoriais, fluxo de transferências e intercompany inspecionados | Inspeção não substitui execução de cada jornada |
| Banco | Harness recente: **244 PASS / 0 FAIL**; regressão completa das migrations | Prova regras no harness, não uso real |
| Unitários | **430/430** na validação da baseline; CI `42060882583` verde | Não prova interface nem dados do cliente |
| Navegador público | Smoke anônimo de login: 3/3 no CI mais recente | Não autentica nem executa operação |
| Navegador autenticado | Job do run `42060882594` falhou; jornadas não foram aceitas | Não tratar como homologação nem presumir causa sem relatório |
| E2E de lojas | Spec transacional usa API real com auth/RLS; smoke de interface não envia operação | A jornada completa por cliques ainda não existe/foi aceita |
| E2E industrial | `production-golden-path.spec.ts` segue `fixme`; tecelagem depende de fixture/ambiente | Quatro setores não homologados por navegador |
| Usuário/produção | Sem evidência de piloto concluído, homologação fiscal ou publicação desta baseline | Produção permanece NO-GO |

---

## 3. Achados que exigem correção de plano

| ID | Achado | Evidência atual | Tratamento |
| --- | --- | --- | --- |
| **REV-01** | Planos antigos ainda pedem permissões por gerente/setor, ΔE/lab dip, receitas, rolo/peça, eficiência e outros recursos já entregues | Migrations `20261019210000` e T81–T92; código setorial atual | Reclassificar como implementados no nível de harness; não reabrir automaticamente |
| **REV-02** | “Todos os temas provados” foi confundido com prontidão operacional | T92/T98 versus T101 e E2E atuais | Manter aceite de navegador, usuário e piloto separados |
| **REV-03** | `produzir` era pendente em documentos antigos; depois passou a ser descrito como ciclo resolvido | P0-03 entrega somente OP+vínculo atômicos | Fechar P0-03 e abrir explicitamente LOJ-05/LOJ-06 |
| **REV-04** | Solicitação de produção fica em `producao_solicitada`; recebimento aceita somente `aprovada` | `20261105150000` e `receive_intercompany_delivery` | LOJ-05, bloqueio do ciclo intercompany por produção |
| **REV-05** | Recebimento intercompany pode ocorrer sem expedição e sem teto de quantidade | RPC não lê `sales_order_id`, expedição nem restante | LOJ-06, integridade P0 antes do piloto |
| **REV-06** | Central da Loja ainda contém métricas não confiáveis | `storeService.getStockReliability/getStoreHealth` | LOJ-08, P0 de honestidade de dados |
| **REV-07** | “Atualização segura entregue” não inclui comprovação de rebuild/rollback das functions | Ressalva T102 continua aplicável | OPS-01, validar atualização completa e restore |
| **REV-08** | Roteiro antigo de lojas tem login fixo e comandos sem portão explícito de isolamento | `ROTEIRO-TESTES-Lojas.md` | Não usar como aceite canônico; prevalece `E2E-Lojas.md` revisado |
| **REV-09** | Documentos usam 459/476 migrations, 94/104/233 testes e estados divergentes | São fotografias de datas diferentes | Baseline e evidência devem sempre trazer commit, data e ambiente |
| **REV-10** | Beneficiamento aparece como quinto setor em parte do código/documentação | `SectorKind` inclui `beneficiamento` | Manter como capacidade compartilhada; os quatro setores pedidos têm pacotes próprios |

---

## 4. Matriz consolidada — Controle de Lojas

“Homologação” abaixo significa usuário/navegador real; sua ausência não apaga a evidência de harness.

| ID | Requisito | Estado | Evidência/lacuna atual | Homologação real |
| --- | --- | --- | --- | --- |
| **LOJ-01** | Transferência mesmo CNPJ: solicitar/criar, aprovar, reservar, separar, expedir, receber por item, divergência e cancelamento | **Implementado** | Motor, telas e harness do fluxo oficial | Não aceita nesta baseline |
| **LOJ-02** | Loja pede sem escolher origem; gestor analisa Loja/CD/Fábrica e decide | **Implementado** | Caixa de entrada, análise e testes de banco | Spec de API não executada/aceita; cliques ponta a ponta pendentes |
| **LOJ-03** | Grupo multi-CNPJ: visão consolidada, vender/transferir CD/remanejar, pedido de venda e recebimento | **Parcial** | Decisão e pedido existem; recebimento não é conciliado com expedição (LOJ-06) | Não |
| **LOJ-04** | Decisão `produzir` cria OP idempotente e vincula à solicitação na mesma transação | **Implementado** | P0-03; harness cobre atomicidade, replay, concorrência, tenant e regressão | Não |
| **LOJ-05** | Produção intercompany: OP → produto acabado → demanda/reserva → expedição → recebimento → encerramento | **Pendente** | Não há consumidor de `production_order_id` na conclusão nem criação de pedido de venda no caminho `produzir`; status é incompatível com recebimento | Não se aplica até implementar |
| **LOJ-06** | Recebimento intercompany por expedição, quantidade restante, parciais/divergências e idempotência | **Pendente** | RPC atual lança entrada direta no ledger com status `aprovada`; não limita `p_quantity` nem comprova saída | Não |
| **LOJ-07** | Central da unidade com fila, alertas, tarefas e ações reais | **Parcial** | Estrutura e integrações existem; erros de consulta e UX por papel precisam de prova; não toda ação foi E2E | Não |
| **LOJ-08** | Saúde, confiabilidade, ranking e KPIs somente com base e fórmula reais | **Parcial / bloqueado** | Fallback `99,2`, ranking por posição e erros ignorados; P0-04 permanece aberto | Não usar para decisão |
| **LOJ-09** | Políticas SKU×local, projetado, cobertura, excesso/ruptura e recomendação de origem | **Implementado** | Motor determinístico e consultas reais; automação autônoma não faz parte deste estado | Falta prova com dados do piloto |
| **LOJ-10** | Recebimento, inventário/contagem, perda e divergência pelo contexto da loja | **Implementado** | RPCs e componentes existem | Jornadas reais e mobile não homologadas |
| **LOJ-11** | Mapa de estoque, Produto 360 e alerta prescritivo com ação | **Parcial** | Componentes e caminhos existem; prescrição não equivale a IA autônoma e depende de KPIs confiáveis | Não |
| **LOJ-12** | Contexto empresa/unidade/canal, navegação, RBAC e isolamento | **Implementado** | Guards, matriz, harness e testes negativos | E2E de troca de contexto e papéis ainda necessário |
| **LOJ-13** | NF-e intercompany/varejo, NFC-e, PDV offline e financeiro | **Parcial / bloqueado externo** | Código/fila/configuração não equivalem a provedor, certificado, SEFAZ/PSP e reconciliação homologados | Não; impede venda como ERP completo |
| **LOJ-14** | Instalação, atualização, backup/restore e rollback de todos os serviços | **Parcial** | Scripts existem; restore, máquina limpa e atualização das functions não fechados | Não |
| **LOJ-15** | Torre/visão executiva com SLA, lead time e exceções calculadas | **Parcial** | Há visões reais, mas faltam definição e reconciliação de todos os indicadores | Dados contínuos ausentes |
| **LOJ-16** | Transportadora, rastreio externo, RFID, IA autônoma e abastecimento sem aprovação | **Visão futura** | Não comprometer nem simular | Sob demanda e integração real |

### 4.1 Decisão de desenho obrigatória para LOJ-05/LOJ-06

Não se deve “corrigir” o ciclo apenas trocando `producao_solicitada` por `aprovada`. O desenho a implementar e revisar deve:

1. vincular solicitação, OP, pedido de venda/expedição, lotes e recebimentos por identificadores explícitos;
2. definir quando nasce a demanda comercial no caminho `produzir`, sem duplicá-la no replay;
3. concluir a OP pelo motor atual e somente então disponibilizar/reservar o lote elegível para atendimento;
4. expedir pela origem com baixa única e documento fiscal aplicável entre CNPJs;
5. permitir recebimento somente contra quantidade expedida e ainda não recebida, por item/lote;
6. acumular recebimentos parciais, registrar falta/excesso/avaria, impedir over-receipt e definir encerramento com divergência;
7. reconciliar solicitação, OP, pedido, reserva, expedição, ledger, lote e saldo em sucesso, falha, cancelamento e concorrência;
8. manter RLS, papéis e idempotência no servidor. A tela nunca será a garantia dessas regras.

---

## 5. Matriz consolidada — núcleo comum do PCP Têxtil

| ID | Requisito | Estado | Evidência/lacuna atual | Homologação real |
| --- | --- | --- | --- | --- |
| **PCP-01** | Produto elegível, BOM/roteiro, OP manual/pedido, snapshot e versionamento técnico | **Implementado** | Criação idempotente, snapshot, fichas de artigo/receitas versionadas | Não nos quatro setores |
| **PCP-02** | MRP líquido com reservas, bloqueios, entradas, lote mínimo/múltiplo e lead time | **Implementado** | Cálculo e compra em rascunho idempotente | Falta validar com dados reais |
| **PCP-03** | Capacidade finita, conflito, fila, setup/changeover e sequenciamento por cor | **Implementado** | RPCs e painéis; sugestões não são APS autônomo | Não |
| **PCP-04** | Reserva por lote liberado, etapas sequenciais, eventos e qualidade bloqueante | **Implementado** | Motor comum e harness sob RLS | Não |
| **PCP-05** | Conclusão atômica, consumo, saída, ledger e genealogia | **Implementado** | `complete_production_order`, idempotência e concorrência no harness | Não |
| **PCP-06** | Permissões por papel/setor e isolamento multiempresa | **Implementado** | `user_sector_access`, guards e ensaio RLS A/B | Jornada por papel pendente |
| **PCP-07** | Rolo/peça/fardo/volume, inspeção e expedição por unidade | **Implementado** | `stock_lot_units`, inspeções e expedição | Dispositivo/romaneio real não homologado |
| **PCP-08** | Retrabalho e etapa externa/terceirização no roteiro | **Implementado** | OP de retrabalho e envio/retorno externos | Fiscal de remessa/retorno segue bloqueado |
| **PCP-09** | Indicadores setoriais e eficiência com denominador configurado | **Implementado** | Fórmulas reais; sem dados retorna nulo | Precisa de dados contínuos do piloto |
| **PCP-10** | Custo previsto×real de materiais | **Implementado** | Painel por componente/lote | Não |
| **PCP-11** | Custo industrial completo: conversão, mão de obra, energia, depreciação e margem | **Parcial** | Não fechar custo completo a partir do painel de materiais | Pendente de regras do cliente |
| **PCP-12** | Manutenção, escala/equipe/turnos e OEE completo | **Parcial** | Há cadastros/janelas/eventos, não o ciclo completo de OS/horas/OEE | Não |
| **PCP-13** | Guia de prontidão e próxima ação para o gerente | **Implementado** | Checklists e cockpit, principalmente tecelagem | Teste moderado pendente |
| **PCP-14** | E2E persistido dos quatro setores, falhas, concorrência, papéis e dispositivos | **Pendente** | Harness forte; golden path `fixme`, specs autenticadas não aceitas | Não |
| **PCP-15** | Telemetria, sensores, IA generativa/otimização e OEE automático | **Visão futura** | Não fabricar leitura nem denominador | Exige integração e dados reais |

---

## 6. Requisitos por setor

### 6.1 Fiação

| Requisito | Estado | Revisão |
| --- | --- | --- |
| Recebimento de pluma/fibra com lote, qualidade e saldo | **Implementado** | T81 e harness; precisa de prova na interface |
| Perfil de processo, máquinas, composição/mistura, eventos de tirada/ruptura e paradas | **Implementado** | Perfis/eventos e parâmetros por setor presentes |
| Consumo real dos lotes da mistura e genealogia pluma→fio | **Implementado** | Genealogia registra os lotes efetivamente consumidos, não apenas a composição planejada |
| Título/qualidade e indicadores por máquina | **Implementado / parcial na profundidade** | Campos e indicadores existem; instrumentos e ensaios automáticos não integrados |
| Otimização de mistura, telemetria de filatório e recomendação autônoma | **Visão futura** | Só com dados e demanda real |
| Aceite pelo gerente/operador | **Pendente** | Criar, programar, apontar, bloquear qualidade, concluir e rastrear sem ajuda |

### 6.2 Malharia

| Requisito | Estado | Revisão |
| --- | --- | --- |
| Tear circular/máquina, fios/lotes, diâmetro/galga/agulhas e eventos próprios | **Implementado** | Perfil, filtros e eventos de quebra/troca de rolo |
| Gramatura/largura alvo×medida e parâmetros de processo | **Implementado** | Achado antigo foi corrigido; não reabrir sem novo teste |
| Rolos, inspeção por unidade, qualidade e expedição | **Implementado** | Unidade logística e inspeção existem |
| Mapa de defeitos por posição e classificação comercial detalhada por rolo | **Parcial** | Modelo atual guarda decisão, notas e contagem de defeitos; não equivale a mapa completo |
| Eficiência, setup e sequenciamento | **Implementado** | Exigem capacidade/janelas e apontamentos reais |
| Aceite em computador/tablet do chão de fábrica | **Pendente** | Incluir rapidez de apontamento e leitura |

### 6.3 Tecelagem

| Requisito | Estado | Revisão |
| --- | --- | --- |
| OP por pedido/avulsa, urdume/trama, tear, eventos e qualidade | **Implementado** | Central e motor específico |
| Urdimento/engomagem, receita de engomagem versionada e parâmetros | **Implementado** | T81/T83/T84; antiga lacuna de “preparação inexistente” está superada |
| Ficha do artigo com construção, gramatura, largura, densidades e versão | **Implementado** | `textile_article_sheets`; ligamento/construção não deve mais constar como ausente |
| Rolo/peça, inspeção e expedição por unidade | **Implementado** | Antiga ausência de rolo individual foi superada |
| Rolo de urdume como lote intermediário genealogico e capacidade dedicada de preparação | **Parcial** | `beam_code` continua identificador textual no perfil; preparação registrada não prova entidade/capacidade independente |
| Mapa de defeitos por rolo | **Parcial** | Mesma limitação de malharia |
| Cockpit do gerente e mapa de teares | **Implementado** | Código e unitários; “nota 10” exige teste moderado |
| Aceite com gerente e tecelão | **Pendente** | Roteiro existente deve ser executado e arquivado |

### 6.4 Tinturaria

| Requisito | Estado | Revisão |
| --- | --- | --- |
| Cuba/máquina, carga mínima/máxima, banho, paradas e retingimento | **Implementado** | Perfis, limites e eventos próprios |
| Receita versionada, dosagem, insumos por lote e snapshot | **Implementado** | T85 e motor de consumo |
| Lab dip, CIELAB/ΔE, tolerância e aprovação bloqueante | **Implementado** | T85; valores medidos/informados, não simulados |
| Sequenciamento claro→escuro e setup/changeover | **Implementado** | Sugestão configurável, não automação cega |
| Retrabalho/retingimento e terceirização | **Implementado / parcial no fiscal** | Motor operacional existe; remessa/retorno fiscal não homologado |
| Espectrofotômetro, dosagem automática, sensores e efluentes integrados | **Visão futura** | Integração real, fora do aceite atual |
| Aceite pelo laboratório/gerente/operador | **Pendente** | Provar aprovação/reprovação, retenção, retrabalho e liberação por cliques |

---

## 7. Plano revisado, dependências e critérios de saída

### P0 — integridade e evidência antes de qualquer liberação

| Ordem | Pacote | Depende de | Critério de saída |
| --- | --- | --- | --- |
| **0** | **DOC-01 — governança canônica** | Esta revisão | Plano e índice versionados; novas entregas referenciam IDs e evidências |
| **1** | **LOJ-08 — KPIs honestos da loja** | DOC-01 | Sem `99,2`/ranking artificial; erro e ausência de base explícitos; fórmulas/unitários; tela confere com banco |
| **2** | **LOJ-05+06 — ciclo intercompany íntegro** | LOJ-04 concluído; desenho fiscal revisado | Harness e E2E: produzir→OP→pedido/reserva→expedir→receber parcial/integral→encerrar; sem over-receipt, recebimento sem expedição ou duplicidade |
| **3** | **QA-01 — ambiente E2E isolado repetível** | Credenciais somente de homologação e massa determinística | CI executa sem `skip`; relatórios, traces e limpeza/reset do ambiente; nenhum acesso à produção |
| **4** | **QA-02 — jornada de lojas por cliques e API** | QA-01 e LOJ-05/06 para o caminho produzir | Mesmo CNPJ e multi-CNPJ; divergência, cancelamento, RLS, falha e replay; saldos reconciliados |
| **5** | **QA-03 — golden paths dos quatro setores** | QA-01 | Um E2E persistido por setor e uma cadeia integrada; papéis, bloqueios, qualidade, lote, concorrência e ledger; nenhum `fixme` no caminho crítico |
| **6** | **OPS-01 — atualização e continuidade** | Build/artefatos versionados | Restore cronometrado, cópia externa, máquina limpa, web+db+functions atualizados e rollback ensaiado |
| **7** | **SEC-01 — segurança dos novos fluxos** | LOJ-05/06 e QA-02/03 | Testes A/B, papel/setor, payload adulterado, concorrência e grants negativos aprovados |
| **8** | **EXT-01 — fiscal/PSP e piloto** | Candidato estável após P0 interno | Homologação com terceiros e aceite do cliente; sem isso, não declarar ERP completo nem produção |

**Sequência recomendada:** DOC-01 → LOJ-08, SEC-02/SEC-03 e desenho LOJ-05/06 → QA-01 em paralelo → implementação do ciclo → QA-02/03/SEC-01 → OPS-01 → piloto/homologações externas. Não iniciar piloto transacional intercompany antes de LOJ-05/06.

### 7.1 Achados de due diligence incorporados ao P0

A avaliação técnica de 05/11/2026 (`/home/user/AVALIACAO-TECNICA-ERP-2026-11-05.md`) acrescentou três frentes ao P0, sem reabrir P0-02/P0-03:

| ID | Achado | Correção exigida | Critério de saída |
| --- | --- | --- | --- |
| **SEC-02** | `.env` versionado com chave publicável; JWTs anon embutidos em 3 migrations apontando para projeto antigo | Remover `.env` do índice do Git, limpar `.env.example`, mover configuração para cofre/ambiente e rotacionar chaves do projeto legado | Nenhum segredo ou identificador de projeto fixo versionado; instalação em projeto novo reproduzível |
| **SEC-03** | 33 migrations com `SECURITY DEFINER` sem `SET search_path` (10 com `GRANT ... TO authenticated`) | Migration corretiva com `SET search_path = public, pg_temp` e revalidação de grants | Harness de invocação aprovado; nenhuma função privilegiada sem `search_path` explícito |
| **DD-01/DD-02** | Golden paths `fixme` e E2E autenticado nunca executado | Já cobertos por QA-01/QA-02/QA-03, que passam a ser pré-requisitos de contrato, não apenas de engenharia | CI sem gates vazios e jornadas por cliques aceitas |

O contrato proposto para LOJ-05/06 está em [DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md](DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md). Ele fixa estados, invariantes, RPCs, matriz de testes e decisões em aberto; **não implementa** o ciclo e não autoriza aplicar migrations antes de QA-01.

### P1 — excelência operacional depois da integridade

1. **PCP-11:** custo de conversão e margem com regras aprovadas, sem estimativas ocultas.
2. **TEC/MAL:** mapa de defeitos por rolo e classificação comercial; decidir se o rolo de urdume será lote intermediário com capacidade própria.
3. **PCP-12:** manutenção, turnos/equipes e denominadores de OEE; OEE só depois de disponibilidade, performance e qualidade confiáveis.
4. **LOJ-15:** SLA, lead time e exceções com fórmulas, drill-down e reconciliação.
5. **UX:** teste moderado por papel nos quatro setores e na loja/CD/fábrica, em dispositivo real; corrigir dispersão sem duplicar módulos.
6. **Legados:** aposentar telas/modelos duplicados somente com inventário de consumidores, migração de leitura e prova de ausência de escrita.

### P2 — visão futura, condicionada a dados e demanda

- telemetria de máquinas, balanças e espectrofotômetros;
- otimização/IA prescritiva e autônoma com explicação, confirmação humana e trilha;
- OEE automático e previsão de demanda com qualidade de dados medida;
- rastreio de transportadora, RFID e automação de dosagem;
- automação ambiental/efluentes e demais integrações específicas do cliente.

Nenhum item P2 pode ser apresentado como entregue por haver dashboard, campo ou simulação.

---

## 8. Aceite mínimo por jornada

### 8.1 Lojas

1. Loja solicita sem origem; gestor decide CD, outra loja, venda e produção.
2. Cada caminho preserva empresa/unidade/canal e impede usuário não autorizado.
3. Reserva, separação, expedição e recebimento reconciliam quantidades por item e lote.
4. Recebimento parcial/divergente é explícito; excesso não autorizado é rejeitado; replay não duplica ledger.
5. No caminho produzir, uma solicitação gera no máximo uma OP e uma cadeia de atendimento coerente; concluir OP não encerra recebimento silenciosamente.
6. Cancelamento, falha no meio, concorrência e retentativa deixam estados recuperáveis e auditáveis.
7. KPIs sem base mostram “sem dados”, nunca valor inventado.
8. A jornada por cliques é executada em Chromium no ambiente isolado, sem testes ignorados, e repetida por papel.

### 8.2 Quatro setores

Para cada setor, o E2E deve executar e conferir:

1. cadastro/prontidão e criação de OP manual e por pedido;
2. snapshot/versão técnica e impossibilidade de alteração retroativa indevida;
3. reserva de lote liberado e rejeição de lote bloqueado/saldo insuficiente;
4. programação sem dupla alocação, setup e resequência aplicável;
5. apontamento sequencial e evento específico do setor;
6. qualidade pendente/reprovada bloqueando conclusão; aprovação formal liberando;
7. conclusão com consumo, perdas/rejeitos, lote de saída, unidade logística e genealogia;
8. replay/concorrência sem dupla baixa e acesso de outro setor/empresa negado;
9. expedição por lote/unidade e consulta de rastreabilidade;
10. usuário conclui sem ajuda e identifica a próxima ação.

Eventos mínimos adicionais: ruptura de fibra na fiação, quebra de fio/troca de rolo na malharia, ruptura de urdume/trama na tecelagem e retenção de cor/retingimento na tinturaria.

### 8.3 Portão de release

Uma release só se torna candidata quando houver:

- CI verde, migrations do zero, harness e unitários;
- typecheck/lint e build no ambiente suportado;
- E2E autenticado executado, não apenas descoberto;
- RLS/RBAC e concorrência aprovados;
- evidência identificada por commit, ambiente, data e responsável;
- documentação atualizada sem apagar limitações;
- backup/restore e rollback ensaiados;
- homologação do usuário e, quando aplicável, fiscal/provedor;
- decisão formal separada para publicar app e aplicar migrations.

**Nenhum desses itens autoriza automaticamente produção.** O aceite de produção exige decisão explícita após o piloto e as dependências externas.

---

## 9. Roteiros e referências que continuam úteis

- [E2E-Lojas.md](E2E-Lojas.md): regras de isolamento e limites dos testes atuais; deve ser atualizado junto com QA-01/02.
- [HOMOLOGACAO-LOCAL.md](HOMOLOGACAO-LOCAL.md): procedimento histórico útil, mas contagens e migrations devem ser atualizadas antes da execução.
- [PCP-TECELAGEM-EXPERIENCIA-GERENTE.md](PCP-TECELAGEM-EXPERIENCIA-GERENTE.md): roteiro de teste moderado de tecelagem.
- [TESTE-FLUXO-SETORES.md](TESTE-FLUXO-SETORES.md): cenário de cadeia produtiva; evidência histórica, não aceite atual.
- [PILOTO-30-DIAS.md](PILOTO-30-DIAS.md) e [PILOTO-SEMANA-1.md](PILOTO-SEMANA-1.md): base para piloto, a expandir dos quatro setores e intercompany por produção.
- [MAPA-MANUAL-PCP-TEXTIL.md](MAPA-MANUAL-PCP-TEXTIL.md): rastreabilidade de requisitos do manual até T92, não prova de uso real.
- [FLUXO-PCP-OPERACIONAL.md](FLUXO-PCP-OPERACIONAL.md): diário T81–T102, útil para localizar decisões e migrations.

Os demais documentos estão classificados no índice. Em divergência, prevalecem: **código/migrations atuais + evidência identificada da baseline → este plano → referências operacionais → documentos históricos**.
