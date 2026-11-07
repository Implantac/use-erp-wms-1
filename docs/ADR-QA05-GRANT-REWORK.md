# ADR — achado de RLS em `production_rework_orders` (QA-05)

**Data:** 07/11/2026 · **Status:** 🟡 **PROPOSTO — NENHUMA OPÇÃO APLICADA**
**Decisão pendente do responsável** · **Produção: NO-GO**
**Relacionado:** `tests/e2e/isolated-production-rls-finding.spec.ts`, `docs/E2E-Lojas.md` §0, `docs/E2E-SEGREDOS-E-ROTACAO.md`

> **Regra desta rodada:** nenhuma migration, grant, policy, função ou trigger foi
> alterado. `supabase/migrations/20261028200000_rework_orders.sql` permanece
> intacta. Qualquer correção exige **autorização explícita**, uma **migration
> nova** (nunca editar a histórica, para não quebrar o replay de 504
> migrations) e revalidação completa.

## 1. Contexto e evidência congelada

QA-05 reproduziu o achado de QA-03b no Postgres embarcado (suíte isolada
**24 testes, `skip=0`**, CI `42327963567` / job `128267583622` ✅).

| Fato | Evidência |
| --- | --- |
| `GRANT SELECT` a `authenticated`; `GRANT ALL` a `service_role` | migration linhas 42–44 |
| RLS habilitado, **uma única policy: `FOR SELECT`** | linhas 37–41 |
| `sync_rework_order_status()` é `SECURITY INVOKER` (`prosecdef=false`), com `SET search_path = public, pg_temp` | linhas 402–407; probe `/tmp/rls-probe.mjs` |
| Trigger `AFTER UPDATE OF status` faz `UPDATE … WHERE rework_order_id = NEW.id` **incondicionalmente** | linhas 409–425 |
| `UPDATE` direto de `status` por usuário autenticado → `permission denied for table production_rework_orders` | spec QA-05 |
| `UPDATE` de `notes` funciona; `record_production_step_progress()` muda status | spec QA-05 |
| `completed` é barrado **antes** pelo `BEFORE` `tr_block_unverified_production_completion` (intencional) | spec QA-05 |

O Postgres verifica o privilégio de tabela **antes** de procurar linhas: o
`WHERE` não protege. Mesmo sem haver retrabalho para a OP, o UPDATE interno
do trigger exige o grant.

## 2. Por que a via oficial funciona (e o que isso muda na análise)

As RPCs `create_rework_order`, `complete_rework_order` e
`record_production_step_progress` são `SECURITY DEFINER`. O owner é superusuário
da instância, e **os triggers disparados dentro de uma função DEFINER herdam
esse contexto de execução**. Por isso o mesmo `UPDATE` interno tem `ALL` quando
a mudança de status vem pela RPC e falha quando vem de um `UPDATE` direto do
cliente. O spec QA-05 prova exatamente essa assimetria.

Consequência: **o defeito não bloqueia nenhuma jornada oficial**. Ele atinge
apenas a escrita direta em `production_orders.status` — que já é desencorajada
pelo trigger `BEFORE` de conclusão. Isso reduz a urgência de um `GRANT` amplo e
reforça a recomendação desta ADR.

## 3. Achado novo desta rodada: a "correção simples" produz falso verde

`GRANT UPDATE ON public.production_rework_orders TO authenticated` **não
corrige o defeito**. A tabela tem RLS e **nenhuma policy `FOR UPDATE`**: sem
`USING`/`WITH CHECK`, o UPDATE interno do trigger passa a ser permitido no
nível de privilégio, mas o RLS devolve **zero linhas**. O trigger terminaria
sem erro e **sem sincronizar nada** — trocando uma falha visível por uma
inconsistência silenciosa de `status` entre a OP e o registro de reprocesso.

Para a opção 1 funcionar seria obrigatório criar *também* uma policy:

```sql
CREATE POLICY production_rework_orders_update ON public.production_rework_orders
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
```

Isso abriria escrita **direta** de `status`, `quantity`, `reason` e
`output_lot_id` a qualquer usuário autenticado do tenant, burlando a
idempotência e a trilha das RPCs. É uma ampliação de superfície grande demais
para resolver um trigger redundante.

## 4. Opções

| | Opção | Prós | Contras / riscos |
| --- | --- | --- | --- |
| **1** | `GRANT UPDATE` (+ policy `FOR UPDATE`) | Mudança pequena | **Falso verde sem a policy**; com ela, escrita direta ampla; bypass da idempotência; não recomendada |
| **2** | `ALTER FUNCTION sync_rework_order_status() SECURITY DEFINER` | Resolve sem conceder escrita direta; `search_path` já está fixo | Eleva privilégio em **todo** UPDATE de status; o UPDATE interno passa a **bypassar RLS** e hoje não filtra `company_id`; exige `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` e auditoria das 11 funções/triggers do domínio |
| **3** | **Remover o `AFTER` e sincronizar dentro das RPCs oficiais** (já fazem `UPDATE` em `complete_rework_order`, linha 381), deixando um `BEFORE` **fail-closed** explícito para UPDATE direto | Elimina a dependência de grant; **não amplia superfície**; torna o contrato explícito; coerente com o fato de o status só mudar via RPC | Exige migration nova + revisar todos os pontos que mudam status; muda comportamento observável |
| **4** | **Manter como está** e tratar o achado como comportamento pretendido, congelado em spec | Zero risco de regressão; já é o estado atual; o gate e as RPCs funcionam | UPDATE direto de `in_progress`/`cancelled` continua com mensagem de permissão enganosa; dívida documental |

### Reforço para a opção 2, se escolhida

O `WHERE` do trigger usa apenas `rework_order_id` (UNIQUE global). Rodando como
DEFINER, o UPDATE ignora RLS; acrescentar `AND company_id = NEW.company_id`
fecha a fronteira de tenant de forma explícita, em vez de depender da
unicidade do UUID.

## 5. Recomendação (não aplicada)

**Agora: opção 4.** O achado está congelado em teste, não bloqueia jornada
oficial e corrigi-lo com grant criaria risco maior que o defeito. Registrar a
mensagem enganosa como dívida conhecida.

**Se e quando o responsável autorizar: opção 3**, precedida de autorização
explícita, migration **nova** com data posterior a `20261028200000`, revisão da
matriz de tenant e reexecução de tudo no item 6. As opções 1 e 2 ficam
**desaconselhadas** pelos motivos acima; a 2 só é aceitável com filtro de
tenant, `REVOKE EXECUTE` e auditoria.

**Nenhuma das quatro foi aplicada nesta rodada.** Não houve `GRANT`, `ALTER
FUNCTION`, `CREATE POLICY`, `DROP TRIGGER` nem edição de migration histórica.

## 6. Plano de teste obrigatório antes de qualquer aplicação

Acrescentar ao `isolated-production-rls-finding.spec.ts` (sem remover os 2
testes atuais):

1. **Não-regressão:** `notes` continua atualizável; `completed` continua
   barrado pelo `BEFORE`; RPC oficial continua mudando status.
2. **Fronteira de tenant:** com os 2 tenants do QA-04, provar que uma mudança
   de status no tenant A **não** altera `production_rework_orders` do tenant B.
3. **Ausência de escrita direta:** `authenticated` continua **sem** conseguir
   `UPDATE` de `status`/`quantity`/`reason` diretamente na tabela (se a opção 1
   for escolhida, este teste deve falhar e a opção ser rejeitada).
4. **Sincronização real:** após `cancelled` e `in_progress` pela via oficial,
   ler a linha de reprocesso e conferir `status`/`updated_at` — não apenas
   "nenhum erro" (protege contra o falso verde da opção 1).
5. **Replay limpo:** 504 migrations + 3 seeds no boot, sem patch manual.

Critérios de aceite: `bun run e2e:isolated` com **`skip=0`**,
`node --test scripts/test-rls-live.test.mjs scripts/rls-static-check.test.mjs`,
harness de banco, `CI` ✅ e `Playwright` com o job isolado ✅. O job
autenticado continua ❌ pelos **18 segredos** — isso não muda com esta ADR.

## 7. Decisão pendente

| Campo | Valor |
| --- | --- |
| Responsável | *a definir* |
| Opção escolhida | *nenhuma* |
| Migration nova autorizada | **não** |
| Dados reais / banco de produção | **não autorizados** |
| Aceite formal | **pendente** |

Enquanto não houver decisão registrada com commit, ambiente, data e
responsável, permanece **NO-GO**.
