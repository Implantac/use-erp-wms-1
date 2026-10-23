# Revisão geral do projeto — USE ERP + WMS

Data: 2026-10-21 · Método: verificação direta (git, GitHub API, replay de
banco, typecheck, suíte de testes) — nenhum item declarado sem evidência.

## Resumo executivo

O núcleo do sistema está **saudável e provado**: banco com 465 migrations
reproduzíveis (77/77 asserções), typecheck integral limpo, 297/297 testes
unitários, cadeia têxtil e fluxo de lojas executados de ponta a ponta no
banco. O problema atual **não é código: é sincronização** — o lote das abas
da Central da Loja existe e está validado, mas ainda não entrou no GitHub
(o push depende de um token válido), e o Lovable mantém uma branch paralela
(`lovable-sync`) com divergência pequena e conhecida.

## 1. Versões e sincronização (o ponto frágil)

| Ponta | Estado | Observação |
| --- | --- | --- |
| GitHub `main` | `a2e48cbf` | Meu `0cabd43d` (correção JSX) + merge do Lovable (tipos Supabase, Onboarding) |
| GitHub `lovable-sync` | `d84052ae` | Branch de trabalho do Lovable; diverge da `main` |
| Workspace local (dev) | = `main` + lote F6/F7 | Abas validadas, **não publicadas** |
| Instalação local (usuário) | zip de 21/10 17:05 | Tem F6/F7; depende de extrair + ATUALIZAR-WEB |
| Lovable (publicado) | pós-merge 18:15 UTC | Sem as abas F6/F7 (arquivo 404 no GitHub) |

Divergência `main` × `lovable-sync`: apenas 4 arquivos, todos do lado do
Lovable — `drizzle/migrations/0007_niche_packages.sql` (+ snapshot/journal)
e 1 linha em `Onboarding.tsx`. `StoreOperations.tsx` está idêntico nas duas
(sem conflito). **Ação:** merge `lovable-sync` → `main` e, depois, manter
uma branch só.

## 2. Banco de dados

- **465 migrations** sequenciais; a última é
  `20261019230000_store_transfer_atomic_workflow.sql` (fluxo de lojas).
- Replay completo em Postgres limpo + seeds: **77 PASS / 0 FAIL** (rerrodado
  nesta revisão), cobrindo: isolamento multiempresa (empresa alheia lê 0),
  PCP dos 4 setores, grupo multi-CNPJ, filiais, fluxo de lojas, fluxo
  comercial e reparos.
- Invariantes-chave vivas: ledger único (saldo derivado de
  `stock_movements`), saldo imutável por guard, conclusão de OP idempotente,
  gate de qualidade, capacidade finita, RLS por empresa.
- Dívida conhecida: nenhuma migration pendente de prova.

## 3. Código e testes

- `tsgo --noEmit` (typecheck integral): **limpo**.
- Vitest: **297/297** testes em 68 arquivos (rerodado nesta revisão).
- ESLint: sem nova classe de erro nas áreas recentes; dívida preexistente de
  `as any` em 91 pontos (concentrada nos serviços Supabase) — tipagem dos
  retornos do banco é trabalho de endurecimento, com RLS como defesa real.
- TODO/FIXME no `src`: **1** ocorrência.
- Escala: 2.434 arquivos versionados, 147 páginas, 13 módulos
  (accounting, admin, commercial, core, financial, fiscal, nps, operational,
  production, purchasing, relacionamento, store-operations, success, wms).

## 4. Funcionalidades por domínio (estado honesto)

| Domínio | Estado |
| --- | --- |
| Multiempresa + nichos (o sistema se molda ao ramo) | Implementado e provado (Fase 1: pacotes de nicho, navegação/rotas por vertical) |
| PCP têxtil por setor (fiação, malharia, tecelagem, tinturaria) | Real e provado: perfis/eventos/indicadores próprios por setor; cadeia 27/27; permissão por gerente de setor |
| Comercial (pedidos → produção → expedição) | Provado (33/33 no harness), inclui beneficiamento p/ terceiros |
| Estoque/WMS (ledger, lotes, genealogia, expedição por lote) | Provado; sem segundo ledger |
| Controle de lojas (solicitação → aprovação do gestor → reserva → separação → conferência → expedição → trânsito → recebimento com divergência → perda/inventário) | Implementado e provado no servidor (77/77); diálogos reais; **abas F6/F7 prontas aguardando publicação** |
| Grupo multi-CNPJ (indústria × lojas) + filiais mesmo CNPJ | Provado no banco e com telas; recebimento pelo ledger único |
| Financeiro/contábil/compras | Presentes como módulos; profundidade varia por área (ver `FEATURE_STATUS.md`) |
| Fiscal (NF-e etc.) | **Bloqueador nº 1** (auditoria: 4,0/10): não homologado; permanece bloqueado para uso real |
| PCP avançado | Pendentes: indicadores finos por máquina (dependem de apontamento contínuo) e sequenciamento automático (hoje decisão assistida) |

## 5. Segurança

- Tokens do GitHub foram colados no chat em várias sessões; os dois últimos
  já nasceram/revogaram inválidos ("Bad credentials"). **Revogar todos os
  tokens antigos** em github.com/settings/tokens e usar sempre token com
  vida curta, revogado após o uso.
- Isolamento entre empresas provado por teste A/B (0 linhas cruzadas).
- Decisões críticas com regra no servidor: aprovação de transferência só de
  gestor (sem autoaprovação), escopo por setor com erro 42501/403.
- Superfície de atenção: 91 `as any` (tipagem), secrets apenas via variáveis
  de ambiente; nenhum segredo versionado encontrado nesta revisão.

## 6. Operação (local × Lovable)

- Instalação local (Docker): pacote zip + REPARAR-BANCO (migrations) +
  ATUALIZAR-WEB (build) funcionou no ciclo; o último build quebrou por um
  JSX meu e foi corrigido/publicado (`0cabd43d`) — **convém confirmar o
  ATUALIZAR-WEB mais recente concluído aí na máquina**.
- Lovable: voltou a acompanhar a `main` (merge das 18:15 UTC), mas mantém a
  `lovable-sync`; enquanto houver duas branches, toda publicação exige
  conferir "o que está em qual".
- Documentação: extensa e atualizada (revisões por domínio, guias de
  operação/homologação, kit PCP têxtil em Python). `FEATURE_STATUS.md` é a
  fonte viva de status por funcionalidade.

## 7. Achados (priorizados)

| # | Severidade | Achado |
| --- | --- | --- |
| R1 | **Alta** | Lote F6/F7 (abas da Central da Loja) validado mas **fora do GitHub/Lovable** — risco de perda e de divergência crescer |
| R2 | **Alta** | Duas branches (`main` × `lovable-sync`) com divergência; fluxo de publicação confuso |
| R3 | **Alta** | Fiscal não homologado — bloqueia uso real de venda/NF-e (já registrado; decisão de produto pendente) |
| R4 | Média | Publicação depende de token colado no chat (processo frágil e inseguro) |
| R5 | Média | 91 `as any` nos serviços (tipagem do retorno do Supabase) |
| R6 | Média | Indicadores finos por máquina e sequenciamento do PCP ainda não entregues (dependem de apontamento real/desenho) |
| R7 | Baixa | `drizzle/migrations/0007_*` só existe na `lovable-sync` (artefato gerado do Lovable fora da `main`) |
| R8 | Baixa | ATUALIZAR-WEB local mais recente não confirmado pelo usuário após a correção do JSX |

## 8. Plano de ação sugerido

**P0 (agora)**
1. Publicar F6/F7 (token válido ou upload guiado) e confirmar as abas no Lovable publicado.
2. Merge `lovable-sync` → `main`; passar a operar com branch única; revogar tokens antigos.

**P1 (curto prazo)**
3. Confirmar ATUALIZAR-WEB local concluído (build + telas novas no ar).
4. Retomar a trilha fiscal (homologação) — é o que destrava a operação real de ponta a ponta.

**P2 (evolução)**
5. Indicadores por máquina com apontamento contínuo; apoio a sequenciamento no PCP.
6. Reduzir `as any` por área (tipos gerados do Supabase nos serviços).
7. "Produzir em um clique" a partir da solicitação do grupo (OP via MRP) — refinamento já desenhado.
