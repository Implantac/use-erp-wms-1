# Plano de implementação, correção e ajustes — entrada em produção

Data: 2026-10-21 · Escopo: levar o USE ERP-WMS de "provado localmente" a
**produto em produção**, moldado ao ramo de cada cliente.

## 1. Decisões e premissas

**Decisão do cliente (2026-10-21):** a implantação será **local, simulando
a nuvem** — a stack Docker local passa a se comportar como o ambiente
multiempresa de produção (várias empresas, uma instalação), e tudo que for
provado nela vale como ensaio da nuvem. A migração futura para nuvem real
é troca de ambiente, não de arquitetura.

**Premissas (não respondidas; mudar aqui não refaz o plano):**
- Lançamento em fases por nicho: **têxtil primeiro** (único vertical
  provado), depois confecção, alimentos, ração e químicos.
- Fiscal via **provedor de NF-e** (API), com homologação assistida por
  contador; emissão própria na SEFAZ fica fora do caminho crítico.
- Onboarding **assistido com importadores**: a equipe importa e valida;
  o sistema ganha importação por planilha validada para escalar.

## 2. Como o sistema se molda ao cliente (o coração do pedido)

Fluxo-alvo do cliente novo:

1. Cadastra o **CNPJ da empresa principal** → o sistema cria a empresa,
   a filial matriz e o administrador.
2. **Escolhe o nicho** (segmento) e, quando aplicável, os **processos**
   que opera (uma empresa pode ter mais de um: a BIL é tecelagem **e**
   tinturaria).
3. O sistema libera **somente as telas do ramo**: menu, rotas, módulos e
   permissões nascem do nicho — o que não é do ramo **não aparece e não
   pode ser acessado nem por URL**.
4. Trocar/ampliar o nicho depois é configuração auditada, nunca gambiarra.

### O que já existe para isso (não partir do zero)

- Taxonomia de segmentos pronta (`src/config/adaptive.ts`): `textile`,
  `apparel`, `food_factory`, `animal_feed`, `chemicals`, `pharma`,
  distribuição, varejo etc.
- Roteamento por segmento (`verticalAccess.ts`, `nichePresentation.ts`) e
  pacotes verticais (`/vertical/...`) — hoje é **apresentação**; falta o
  **backend** (módulos por empresa + RLS) para virar barreira real.
- Planos com `allowed_modules` e acesso por módulo já funcionam e foram
  provados com a BIL (34 módulos, enterprise local).

### Desenho a implementar (Fase 1)

- `companies` ganha: segmento principal, **lista de nichos/processos**
  habilitados e **pacote de módulos derivado do nicho** (editável por
  suporte com auditoria).
- **Três camadas de bloqueio** (todas obrigatórias):
  1. Menu e rotas filtrados pelo nicho (UX);
  2. Guard de rota que nega URL fora do nicho (segurança de navegação);
  3. **Backend**: RPCs e RLS negam módulo/processos fora do pacote da
     empresa (segurança de verdade — esconder tela não é permissão).
- Matriz oficial **nicho → telas** (abaixo), versionada em código e
  testada por teste automatizado: para cada nicho, o teste prova que as
  telas do ramo abrem e as dos outros ramos são negadas.

### Matriz nicho → o que o cliente vê

Base comum a todos (ERP): cadastros, comercial/pedidos, compras,
estoque/WMS, financeiro, fiscal, relatórios. Sobre a base, o pack do ramo:

| Nicho | Telas e regras do ramo (além da base) | Reaproveitamento |
| --- | --- | --- |
| **Têxtil** (fios/malha/tecido) | 4 centrais PCP, perfis/eventos por setor, urdume/trama, lotes e genealogia, Lab de cor, indicadores setoriais | **Pronto e provado** — é a referência |
| **Confecção** | Central PCP Confecção: ficha técnica da peça, grade cor×tamanho, OP por grade, facções (costura terceirizada), custo por peça, expedição por grade | Motor de OP/BOM/lotes/qualidade; grade e facção são novos |
| **Alimentícia** | Produção com receita/ficha, lote e **validade** (FEFO), rastreabilidade MP→produto, controle de qualidade/APPCC básico, ficha nutricional como cadastro | Motor genérico + validade/qualidade reforçados |
| **Ração animal** | Formulação (receita com premix/núcleos), lote/validade, registro de produto, produção por batelada | Idem alimentos, com vocabulário próprio |
| **Químicos** | Ficha de segurança (FISPQ) no produto, produtos controlados, incompatibilidade no armazenamento, lote e validade, produção por batelada/reator | Motor genérico + segurança química |

Cada pack novo nasce do mesmo molde do têxtil: **perfil técnico próprio,
eventos próprios, indicadores próprios** — nunca uma tela genérica
disfarçada. Nicho sem pack profundo vende só a base ERP, sem prometer o
que não existe.

## 3. Fases do plano (com portão de saída objetivo)

### Fase 0 — Congelamento e régua (antes de tudo)
Congelar o escopo atual, CI verde obrigatório (testes de unidade +
typecheck + harness SQL), e a regra: **nada entra em produção sem prova
executável**. Portão: harness 33/33 e suíte de unidade verdes no CI.

### Fase 1 — Fundação "como nuvem" e nicho de verdade
- Onboarding por CNPJ + escolha de nicho/processos (tela e backend).
- Pacote de módulos por nicho; três camadas de bloqueio da §2.
- **Permissões por gerente de setor** (P0 já mapeado).
- **Ensaio RLS A/B executado em banco** (o runner existe e nunca rodou) e
  teste automatizado da matriz nicho→telas.
Portão: duas empresas de nichos diferentes na mesma instalação; nenhuma
enxerga dado, tela ou RPC da outra — provado por teste.

**Progresso (2026-10-21):** itens 1 e 2 **entregues e provados** —
migration `20261019200000` (`niche_packages`, `company_niche_history`,
`set_company_niche`/`get_company_niche`), onboarding aplicando o pacote,
matriz nicho→telas em `src/config/nicheMatrix.test.ts` e prova no harness
(462 migrations, **41/41 PASS**: segundo tenant químico criado por CNPJ na
mesma instalação, troca para ração reaplicando módulos, auditoria,
admin de outra empresa negado, BIL têxtil sem perder a produção).
Faltam da fase: **permissões por gerente de setor** e o **ensaio RLS A/B
completo** (policies permissivas legadas em tabelas operacionais são o
alvo) — próximo lote (1c).

### Fase 2 — Correções P0 do núcleo
- **Custos industriais v1**: custo por lote/OP (matéria-prima real +
  conversão rateada) e margem por pedido.
- **Rolo/peça como unidade** (tecido/malha) com etiqueta e romaneio.
- Caminhos de ouro E2E (vendas e compras) saindo de `fixme` para verde;
  transições WMS e inventário destravados com RPC auditada.
Portão: jornada completa de cada caminho verde em E2E + harness.

### Fase 3 — Fiscal e financeiro ponta a ponta
- Integração com provedor de NF-e (emissão, cancelamento, carta de
  correção, entrada por XML baixando estoque/financeiro), **remessa e
  retorno de beneficiamento** com saldo de terceiros.
- Financeiro: pedido → faturamento → contas a receber → baixa, com
  conciliação; contas a pagar idem compras.
Portão: notas reais de homologação SEFAZ emitidas e um ciclo
pedido→nota→recebimento conferido com o contador.

### Fase 4 — Verticais novos (um por vez, molde têxtil)
Confecção → alimentos → ração → químicos. Cada um: auditoria do processo,
perfil/eventos/indicadores próprios, seed de demonstração executável,
testes de aceite do ramo e piloto. Portão por nicho: ciclo completo do
ramo provado no harness local-como-nuvem.

### Fase 5 — Operação de produção (mesmo local)
- Backup com **restauração testada** e cópia fora da máquina; rotina de
  atualização versionada (migrations numeradas, sem reset); logs e
  diagnóstico; monitoramento básico (saúde dos serviços); manual de
  operação e de suporte; LGPD (dados pessoais, retenção, exportação).
Portão: simulação de desastre — derrubar e restaurar a instalação só com
o manual, cronometrado.

### Fase 6 — Piloto e aceite formal
- BIL como piloto têxtil com **dados reais** (carga assistida), um ciclo
  comercial completo real, treinamento dos usuários por função e o
  **checklist formal de aceite (13 critérios)** assinado.
Portão: aceite assinado; só então o nicho é declarado "em produção".

### Fase 7 — Nuvem real (quando fizer sentido comercial)
Mesma stack (Supabase/Postgres) em VPS/nuvem, restore do backup local,
troca de DNS/URL, revalidação dos portões das Fases 1/3/5. Por desenho,
nenhum código muda — é o motivo de "local como se estivesse em nuvem".

## 4. Correções herdadas (não esquecer)

Do `FEATURE_STATUS.md` e das revisões: financeiro e WMS avançado ainda
"não comprovados" ponta a ponta; scanner de governança/auditoria não
implementado; tipos do Supabase a regenerar; IoT continua **sem medição
real** (não vender como telemetria). Nada disso se promete a cliente até
virar "provado".

## 5. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Fiscal subestimado (UF, regime, CFOP de beneficiamento) | Provedor + contador desde a Fase 3; homologação antes do piloto |
| Nicho novo virar "tela genérica" | Molde têxtil obrigatório (perfil/evento/indicador próprios) e portão por nicho |
| Isolamento multiempresa falhar na prática | Ensaio RLS A/B na Fase 1, antes de qualquer segundo cliente |
| Cliente esperar nuvem e receber local | Contrato claro: fase local-como-nuvem com plano de migração (Fase 7) |
| Dados reais quebrarem o que o teste não viu | Piloto com carga assistida e ciclo real antes do aceite (Fase 6) |

## 6. Primeiros lotes executáveis (ordem de ataque)

1. **Fase 1a** — nicho no cadastro: CNPJ → segmento/processos → pacote de
   módulos derivado, com auditoria da troca.
2. **Fase 1b** — bloqueio em três camadas + teste automatizado da matriz.
3. **Fase 1c** — permissões por gerente de setor + ensaio RLS A/B.
4. **Fase 2** — custos v1 e rolo/peça (em paralelo por frentes).
5. **Fase 3** — provedor fiscal (trilha externa, começar já).

Cada lote segue a régua do projeto: migration incremental quando houver
banco, testes no harness local-como-nuvem, documentação atualizada e
pacote novo — sem declarar pronto o que não foi executado.
