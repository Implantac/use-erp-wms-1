# LOJ-05A — disponibilização gerencial com reserva e fiscal fechado

**Estado: incremento local isolado, não publicado; produção NO-GO.**

- Base de fontes: P0-BASE-01, Git `c93f91fb8e06cc39e2b86e3cf8138dc0c7d8c154` + overlay r17–19 verificado. Este incremento ainda não tem commit.
- Data de referência da sessão: **04/11/2026**. Relógios dos logs da sandbox e datas nos nomes históricos não são prova de cronologia; a versão da migration apenas sucede as 504 versões recuperadas.
- Schema acrescentado: `20261105181200_intercompany_production_release.sql` (**505ª migration**). Aplicação somente em Postgres embarcado descartável de teste.
- Não há autorização para migration em banco real, publicação, operação fiscal ou piloto transacional.

## 1. Decisões do responsável

As respostas posteriores ao relatório P0-BASE-01 aprovaram:

| Decisão | Limite confirmado |
|---|---|
| Operação | Ledger existente; disponibilização explícita pelo gestor; recebimento limitado ao expedido; legados sem expedição reconciliados individualmente. |
| Lotes | Conforme rastreabilidade do produto; no caminho de produção, preservar obrigatoriamente o lote produzido da OP vinculada. Não impor lote indiscriminadamente a todo SKU. |
| Fiscal | Fail-closed até regras e homologação aprovadas por contador/provedor; não inventar CFOP/CST. Cancelar documento no ERP não comprova o evento fiscal aplicável a uma NF-e autorizada. |
| Credenciais | O responsável declarou revogados os cinco PATs expostos. **Confirmação do responsável, não verificação independente** nem comprovação de rotação de outras credenciais. Nenhum token foi solicitado ou utilizado neste incremento. |

São decisões para desenvolvimento isolado, não aceite operacional/fiscal. O desenho original permanece como referência histórica em [DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md](DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md).

## 2. Recorte realmente implementado

A RPC `finalize_intercompany_production(p_request_id uuid)` exige gestor `admin`/`manager` **na indústria raiz**, com empresa ativa correspondente. A própria RPC autoriza, trava e valida no servidor:

1. solicitação no caminho `produzir`, OP única realmente vinculada e chave de criação correspondente ao UUID completo da solicitação;
2. OP concluída pelo motor oficial, `production_completion_requests`, quantidade produzida aprovada suficiente e lote de saída;
3. empresas/unidades corretas e grupo ainda válido; mesmo código de produto nas duas empresas e mesma unidade, sem conversão implícita;
4. lote produzido da empresa/produto/OP corretos, liberado, não vencido, com quantidade finita suficiente;
5. uma entrada oficial do lote no ledger e saldo único, livre e elegível na filial/canal da OP;
6. cliente ativo previamente cadastrado na indústria para o CNPJ da loja. Ausência/ambiguidade é erro de conciliação — **não criar cliente, documento ou contato fictício**;
7. preço de cadastro finito/não negativo. O pedido nasce **pendente**, sem aprovação financeira/fiscal nem cobrança; meio de pagamento permanece a definir.

Em uma transação, grava **um pedido pendente, um item, um hold em `stock_balances.reserved_qty`, uma reserva em `stock_reservations` do lote exato e um registro de lastro**. Preenche os vínculos já existentes `source_company_id`/`sales_order_id` na solicitação.

`intercompany_production_releases` é lastro operacional com RLS, não outro ledger. Referencia solicitação, OP, conclusão, lote, saldo, pedido/item/reserva, quantidade/unidade, gestor e instante. Não há escrita direta concedida a `authenticated` ou `service_role` nessa tabela.

**Sem efeito automático na conclusão da OP.** Não há trigger/job disparando a disponibilização.

### Estado e replay

- O status da solicitação **continua `producao_solicitada`**. A disponibilização parcial é diferenciada no registro de lastro e no retorno `release_status = reservada_bloqueada_fiscal`, `dispatch_enabled = false`.
- Não usar `aprovada`/`disponivel_expedicao` para aparentar um ciclo completo ou liberação fiscal que não existe.
- A solicitação fica travada por `FOR UPDATE` antes de ler o replay. Chaves únicas impedem duplicidade de OP/conclusão/pedido/item/reserva por disponibilização.
- Replay retorna os mesmos IDs sem segundo hold. Inconsistência dos vínculos exige conciliação, não novo pedido.
- Produção aprovada menor que a solicitada é bloqueada; este incremento não inventa redução da demanda nem regra de atendimento parcial de produção.
- Nenhuma movimentação de saída/entrada é criada pela disponibilização. A quantidade física e `remaining_qty` permanecem iguais.

## 3. Por que a expedição não foi acrescentada aqui

O WMS vigente debita saldo e lote **na separação**, auditando em `stock_movements` com `direction='transfer'`. A expedição é documental. Adicionar uma saída `out` no novo contrato duplicaria a baixa.

Por isso o candidato contém:

- guarda antes de `wms_pick_order_stock` e `wms_ship_order` para pedidos vinculados a solicitações intercompany, inclusive comerciais legados;
- bloqueio de alteração/exclusão de pedido e escrita de itens/reservas/alocações desses pedidos, impedindo contorno por UPDATE direto;
- piso nas quantidades físicas/reservadas dos saldos comprometidos e no lote produzido: outro pedido ou ajuste genérico não pode consumir/liberar o hold intercompany;
- nenhum parâmetro, feature flag, GUC ou configuração fiscal que habilite essa expedição neste incremento;
- assinatura antiga `receive_intercompany_delivery(uuid,numeric)` mantida **apenas para devolver erro explícito**: sem entrega identificada não há recebimento, independente da quantidade informada.

Os corpos WMS vigentes foram preservados, salvo a guarda após autorização do tenant e `search_path` explícito. O teste estático compara essas definições integralmente. O contrato de transferência mesmo-CNPJ não foi transformado em cross-CNPJ.

**Mudança de compatibilidade intencional:** o verde antigo do harness para receber sem expedição foi substituído por recusa e verificação de ausência de lançamento/promoção. Não há backfill nem alteração automática dos saldos/estados antigos.

A instalação isolada deste incremento bloqueia esses caminhos intercompany; **não se afirma que um ambiente real esteja protegido**, pois nenhuma migration foi aplicada nele. Antes de qualquer futura instalação real, será necessário inventário/reconciliação individual dos registros e janela aprovada. Freeze não é processo operacional completo de cancelamento.

## 4. Evidência e limites dos testes

Fontes permanentes:

- `tests/harness/intercompany-release-tests.mjs`, chamado pelo harness completo;
- `scripts/test-intercompany-production-release.mjs`, incluído no workflow local de CI;
- `.github/workflows/ci.yml`: preserva gates existentes e usa caminho de cache do gerador MCP no futuro build. Não houve execução/publicação de CI remoto.

O replay já executou **505 migrations, 336 PASS / 0 FAIL**. Os controles cobrem OP não concluída, liberação explícita, mesmo lote apesar de FIFO mais antigo, replay, RBAC/tenant/unidade, dados adulterados, lotes de outro produto/empresa ou em quarentena, unidades divergentes, quantidade NaN/Infinity, estoque livre insuficiente, cliente ausente, legado sem lastro, rollback após os inserts, retry, flags de lote ligada/desligada e bloqueios físicos/fiscais.

A concorrência usa duas conexões autenticadas e confirma `pg_blocking_pids` **antes** do primeiro commit; não se limita a disparar duas chamadas que talvez rodassem em série. Falhas comparam solicitação, pedidos, reservas, lotes, saldos e contagens de ledger/fiscal/financeiro, com controles positivos de visibilidade.

A primeira execução registrou 319 PASS / 1 FAIL: a fixture de sessão ausente montava `sub=''` no JSON (UUID malformado), produzindo `22P02`. Foi corrigida para claims ausentes, mantendo a expectativa `42501`, sem alterar autenticação nem stubs. Os logs das tentativas foram preservados fora do ZIP base.

Regressões executadas no candidato:

| Gate | Resultado / limite |
|---|---|
| Harness SQL completo | **336 PASS / 0 FAIL**, 505 migrations; inclui 87 verificações novas, além de dois antigos sucessos de recebimento convertidos em controles de recusa. |
| Contratos Node | **221/221**, incluindo os 8 novos testes estáticos intercompany. |
| Unitários Vitest | **517/517**, 107 arquivos, um worker. |
| Guardas RLS | **6/6**; além dos controles SQL específicos de empresa/unidade/papel. |
| Regressão API isolada existente | **37/37**, sem skip/unexpected/flaky. Não é a jornada intercompany por cliques. |
| Lint | **0 erros/avisos reportáveis**, com **1.236** achados históricos `no-explicit-any` suprimidos pelo gate existente. |
| SEC-02 | **2.727 arquivos / 0 referências fixas reportadas**; não é certificado universal de ausência de segredo. |
| Tipos | Node + focados Produtos/leituras relacionadas e feedback passaram. **Não substituem o typecheck global do app.** |

A primeira regressão API fez 36 PASS / 1 FAIL: o teste ainda exigia exatamente 504 migrations. O esperado foi atualizado para **exatamente 505**, preservando a igualdade estrita, e a suíte completa refeita sem retentativas/ignores. As tentativas com falha também foram preservadas.

Os logs e JSONs ficam em `recovery-evidence/20–26`, **fora do ZIP base imutável**. A suíte local/harness com stubs de `pg_cron`/`pg_net` não é homologação Supabase/provedor/usuário. Nenhuma tela nova foi implementada ou aceita por cliques neste pacote.

## 5. Pendências que não podem ser marcadas como concluídas

- **LOJ-05 permanece parcial:** falta integrar a disponibilização na interface e implementar o restante do ciclo, com expedição/recebimento/encerramento conciliados.
- **LOJ-06 permanece pendente, com bypass antigo contido:** faltam entrega identificada, teto do restante expedido, recebimentos parciais, divergência, idempotência e concorrência no novo recebimento. Recusar tudo não equivale a implementar esse fluxo.
- Cancelamento e eventuais reversões exigem contrato próprio, preservação do ledger e regra fiscal confirmada. Não restaurar a RPC insegura como rollback.
- Fiscal/PSP, jornadas reais dos quatro setores, backup/restore de banco+Auth+Storage e aceite continuam abertos.
- Typecheck global anterior terminou por timeout; build anterior terminou por OOM. Não foram reclassificados como sucesso nem repetidos sem estratégia de recursos. Os gates focados não os substituem.
- As dez solicitações abertas do cliente, incluindo quatro críticas, não são encerradas por este incremento.

**Próximo recorte:** contrato de expedição que reutilize a baixa WMS uma única vez, lastro fiscal verificável e recebimento com teto/replay. A execução permanece isolada até homologação e autorização separada de publicação/migrations.
