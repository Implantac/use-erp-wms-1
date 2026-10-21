# Situação das funcionalidades — avaliação pré-produção (08/10/2026)

**Este arquivo não é certificado de prontidão.** `Não comprovado` = há implementação, mas falta prova de banco/E2E em ambiente representativo. `Bloqueado` = ação final desabilitada ou rejeitada por segurança. Consulte `docs/governance/PARECER_PRONTIDAO_PRODUCAO_2026-10-08.md`, `docs/governance/ENSAIO_RLS_A_B.md` e o relatório de auditoria atualizado antes de firmar escopo comercial.

| Área | Estado verificável | Evidência faltante ou limite |
|---|---|---|
| Multiempresa, unidades e RLS/RBAC | **Não comprovado** | Runner A/B existe, mas não foi executado em banco; testar leitura/escrita, Storage, Edge, administradores e histórico de suporte |
| Produtos, clientes, fornecedores | **Não comprovado** | CRUD/validação/paginação e isolamentos A/B por tabela e refresh |
| Vendas e pedidos O2C | **Não comprovado ponta a ponta** | `tests/e2e/sales-golden-path.spec.ts` está `fixme`; fiscal bloqueado |
| Compras P2P | **Não comprovado ponta a ponta** | `tests/e2e/purchase-golden-path.spec.ts` está `fixme` |
| Estoque, kardex e transferências | **Não comprovado; avanço WMS bloqueado** | Migration de guarda de status deve ser aplicada/testada; concorrência, rollback, estoque e permissões não homologados |
| WMS (recebimento, picking, packing) | **Não comprovado** | Transições diretas de status bloqueadas; fluxo real ainda precisa de RPC autorizada e efeitos atômicos |
| Inventário em loja | **Bloqueado** | Tela só mostra prévia; não grava contagem nem ajuste |
| Produção / PCP | **Homologado na stack local do usuário; centrais por setor (fiação/malharia/tecelagem/tinturaria) sobre o mesmo motor** | Migrations `20261019100000`/`20261019110000` passaram na suíte SQL embarcada (snapshot, reserva por lote, capacidade finita, etapas sequenciais, qualidade, conclusão com genealogia, MRP idempotente, multiempresa e concorrência) e a UI chama as RPCs; replay embarcado 459/459 e jornada SQL do gerente 104/104 via `scripts/live-manager-journey.mjs`. Na stack Docker do usuário (2026-10-20): 459/459 migrations aplicadas, BIL cadastrada, login funcionando e o fluxo pedido→fiação→malharia→tinturaria→estoque executado com os mesmos números da prova (93/87/75 kg); telas navegadas na interface. Centrais por setor: `SectorPcpCentral` filtra OPs por setor; cada setor tem perfil técnico e eventos próprios (migration `20261019180000`: fiação título/torção, malharia galga/diâmetro, tinturaria cor/partida/relação de banho/CIELAB; tecelagem mantém urdume/trama/tear), provados no replay embarcado de 460 migrations com SETOR VERIFY 23/23 e vitest 59/59 + `typecheck:weaving` OK. Ver `docs/REVISAO-PCP-POR-SETOR.md`. Pendente: usuário rodar o teste guiado de tecelagem plana (`PREPARAR-TECELAGEM.bat`, provado no harness 36/36) e confirmar as quatro centrais na stack dele, regenerar tipos Supabase, rodar `tests/e2e/textile-weaving-pcp.spec.ts` com navegador e fechar os critérios de aceite 1–13; IoT não mede sensores reais |
| Financeiro (pagar/receber, OFX/CSV) | **Não comprovado ponta a ponta** | Conciliação, concorrência, idempotência e RLS em banco a testar |
| Governança e auditoria | **Não comprovado** | Scanner não implementado; trilha e retenção exigem evidências |
| Fiscal: todos os DF-e usados por cada cliente | **Não homologado** | NF-e Edge responde 503; regime/modelo/UF, certificado, XSD, assinatura, transporte e retorno oficial por operação ainda exigem validação fiscal |
| Entrada de NF-e por XML | **Parcial / lançamento bloqueado** | Leitura não prova entrada transacional em estoque e financeiro |
| PIX, boleto, TEF | **Bloqueado sem provedor** | Não prometer cobrança sem PSP/banco e webhook autenticado |
| Loja pública / checkout | **Finalização bloqueada** | Itens, frete, preço server-side, PSP, webhook e conciliação a implementar/testar |
| IA e e-mails transacionais | **Dependem de integração** | Segurança, indisponibilidade e idempotência do provedor não comprovadas |
| IoT e logística inteligente | **Sem medição real** | Dashboard avisa ausência de sensores; serviços legados não fabricam rastreamento |

**Decisão:** não oferecer o conjunto como ERP/WMS pronto para produção. Escopo reduzido só após provas específicas da jornada vendida, RLS, backup/restore, CI verde, suporte e homologações necessárias.

## Atualização 2026-10-21 (tarde) — PCP alinhado às skills setoriais

Auditoria dos 3 documentos de skill (fiação, tecelagem/malharia, tinturaria)
em `docs/AUDITORIA-PCP-SKILLS.md`. Melhorias entregues e provadas:
classificação de desvios por setor com causa em investigação/confirmada
(migration `20261019190000`, RPCs revalidadas), cartão de indicadores do
setor com fórmulas documentadas (aderência, prazo, inspeções, paradas por
classificação/máquina, WIP, retingimento) e prontidão mínima de cadastros
por central. Harness embarcado: 461 migrations, 17/17 PASS. Pendentes
registrados na auditoria: permissões por gerente de setor, OEE/utilidades
(sem medição real não entram), dosagem automática (só com receita aprovada
cadastrada) e sequenciamento por cor/setup.

## Atualização 2026-10-21 (noite) — catálogo por processo + pedido até a entrega

Catálogo realista por processo com categorias (Fibras e Plumas, Fios,
Tecidos Planos, Malhas, Corantes e Auxiliares, Serviços) classificando
também os produtos de teste — urdume/trama passam a listar só a categoria
Fios (consulta de categorias corrigida: são globais). Fluxo comercial
provado no harness (33/33): pedidos de tecido/fio/malha tingida expedidos
pelo WMS com baixa do lote certo e tinturaria para terceiro com OP
vinculada ao pedido e devolução expedida. `PREPARAR-PEDIDOS.bat`.

## Revisão de ponta a ponta 2026-10-21 — rumo à excelência têxtil

Revisão completa (código, telas, migrations e provas) em
`docs/REVISAO-PONTA-A-PONTA-EXCELENCIA.md`. Veredito: o núcleo produtivo
(PCP por setor, qualidade, genealogia, expedição por lote, pedido até a
entrega) está provado; o que falta para excelência numa indústria de
fios/malha/tecido é o entorno — P0: fiscal homologado (incl. remessa/
retorno de beneficiamento), permissões por gerente de setor, custos
industriais, rolo/peça como unidade, prova em uso real e RLS/restore
executados. P1: laboratório com ΔE, NC estruturada, manutenção, horas
por turno (OEE), urdimento/engomagem próprios, sequenciamento assistido,
facção outbound e relatórios têxteis.

## Plano de entrada em produção 2026-10-21

Plano completo em `docs/PLANO-ENTRADA-PRODUCAO.md`. Decisão do cliente:
instalação local simulando nuvem (multiempresa, mesmo código da futura
nuvem). O sistema se molda ao cliente por CNPJ + nicho escolhido, com
bloqueio em três camadas (menu, rota e backend/RLS) e matriz nicho→telas
testada. Fases: 0 régua/CI → 1 fundação nicho+permissões+RLS → 2 custos e
rolo/peça → 3 fiscal/financeiro → 4 verticais (confecção, alimentos,
ração, químicos) no molde têxtil → 5 operação → 6 piloto/aceite → 7 nuvem.

## Fase 1 iniciada 2026-10-21 — nicho vira pacote de módulos (provado)

Migration `20261019200000`: `niche_packages` (pacote por segmento),
`company_niche_history` (auditoria) e RPCs `set_company_niche`/
`get_company_niche` — o plano compartilhado é clonado por empresa e os
módulos passam a derivar do nicho escolhido no onboarding (que já chama
a RPC). Matriz nicho→telas testada (vitest) e prova multiempresa no
harness: 462 migrations, 41/41 PASS com segundo tenant de outro nicho na
mesma instalação. Pendente da Fase 1: permissões por gerente de setor e
ensaio RLS A/B completo (lote 1c).

## Auditoria software house + mercado 2026-10-21

Relatório completo (técnico por especialidade + viabilidade comercial) em
`docs/ANALISE-COMPLETA-SOFTWARE-HOUSE.md`. Média técnica 6,5/10
(pré-produção avançada); bloqueadores: RLS completo (Fase 1c), fiscal
homologado via provedor, custos v1, restore ensaiado, CI formal.
Veredito comercial: viável como ERP têxtil moderno para PME industrial,
condicionado ao fiscal e a pilotos com métrica.

## Fase 1c concluída 2026-10-21 — permissão por setor + RLS A/B provado

Migration `20261019210000`: `user_sector_access` + `sector_access_allowed`/
`assert_sector_access`/`my_sector_access`/`set_user_sector_access` e
wrappers com guarda nas 4 RPCs de escrita do PCP setorial (impl renomeada
com execute revogado). Centrais PCP fecham por setor (viewer/operator/
manager; admin total; modo legado até configurar). Harness: **463
migrations, 55/55 PASS** incluindo o ensaio RLS A/B com papel
`authenticated` (SELECT/UPDATE/DELETE entre tenants = 0; controle positivo
ok) e a correção do catálogo `categories` (leitura global+própria; seed
determinístico por empresa). Vitest 81, typecheck e ESLint limpos.
**Fase 1 do plano de produção está completa.** Pendente de sincronização
com o GitHub (token anterior revogado): relatório de análise, esta fase e
a 1c aguardam novo token para push.

## Grupo multi-CNPJ + reparo de transferências 2026-10-21 (provado)

Migration `20261019220000`: grupo por `parent_company_id` com
`group_stock_overview` (só gestores do grupo), solicitações intercompany
(loja pede por SKU; indústria decide vender/transferir/remanejar/produzir/
rejeitar; venda vira pedido com a loja-cliente pelo CNPJ) e recebimento
pelo ledger único. **Reparo:** `fn_transferencia_canal_apply` usava coluna
inexistente (`movement_type`) e quebrava TODA transferência entre filiais —
redefinida no contrato atual do ledger. Harness: **464 migrations, 67/67
PASS**; suíte completa **294 testes**; typecheck integral limpo. Desenho em
`docs/GRUPO-MULTICNPJ.md`. Pendente de push ao GitHub (aguardando token).

## Fluxo de lojas destravado 2026-10-21 (provado, 77/77)

Revisão completa em `docs/REVISAO-FLUXO-LOJAS.md`. O fluxo de
transferências estava congelado (20261008223000) sem a transação atômica
prometida: construída na migration `20261019230000`
(create/transition_stock_transfer, register_stock_loss/inventory_count,
GUC app.stock_transfer_rpc), trigger legado aposentado, auto-aprovação da
loja removida (aprova só gestor), 4 diálogos da loja religados de verdade
e blocos demonstrativos da página trocados por dados reais. Harness 465
migrations 77/77; 297 testes; typecheck limpo. Pendente: abas restantes da
Central da Loja (F6) e KPI em trânsito (F7). Push ao GitHub pendente.
