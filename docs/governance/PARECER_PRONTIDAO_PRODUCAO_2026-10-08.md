# Parecer de prontidão para uso real — 08/10/2026

**Veredito: NÃO APROVADO para operação integral em produção.** O repositório contém módulos utilizáveis e mecanismos de bloqueio para funções não homologadas, mas não há evidência suficiente para declarar o ERP/WMS pronto para dados, tributos, cobrança e obrigações reais de todos os clientes. Este é um parecer técnico baseado no código, nos comandos executados e nos documentos do projeto, **não** uma auditoria exaustiva de cada linha, nem parecer fiscal/jurídico, nem certificação de segurança.

## Escopo e evidência desta revisão

- Revisado o `main` publicado no GitHub até `b123228` (consulta remota); no workspace havia três alterações pré-existentes em `scripts/` que **não** integram o commit publicado.
- Repositório com 438 arquivos de migrations e 62 diretórios de Edge Functions: amostrados controles de fiscal, WMS, financeiro, testes, build e governança. Não foi feita inspeção completa de todas as 438 migrations e 62 funções.
- Instalação via `bun install --frozen-lockfile` aprovada. `npm run typecheck` aprovado. `vitest run --maxWorkers=2`: **165 testes/32 arquivos aprovados**.
- `npm run lint:ci`: **falhou**, 27 avisos reportáveis (0 erros); o script exclui **1.072 ocorrências** de `@typescript-eslint/no-explicit-any` do gate.
- `npm run build`: **falhou no ambiente de revisão**, erro `Reached heap limit`, saída 134, durante transformação. Não há artefato de produção validado nesta revisão. Falha de heap não prova, isoladamente, defeito de código; exige runner com memória adequada e repetição do build.
- Não houve acesso validado a banco Supabase **de homologação**, provedor financeiro, certificado fiscal, autorizador ou deploy remoto. A existência de `.env` local não prova ambiente de homologação e não foi usada para consultar produção. Publicar migration no GitHub não significa aplicá-la.

## Bloqueadores (P0)

| Área | Evidência | Consequência / aceite |
|---|---|---|
| Fiscal / documentos | `supabase/functions/nfe-emit/index.ts` devolve `fiscal_emission_not_homologated`; tabelas cCredPres e cobertura por cliente não têm importação/aprovação operacional; `docs/fiscal/ONBOARDING_CLIENTE_FISCAL.md` registra lacunas. | **Não liberar emissão nem cálculo fiscal real**; homologar leiautes/XSD, tabelas, regimes, cálculos, assinatura, eventos, autorização e escrituração por modelo. |
| Banco e multitenancy | Migrações recentes de escopo de alertas, motor fiscal e RPC WMS não foram aplicadas/testadas em banco nesta revisão. `src/lib/testing/security/rls.test.ts` apenas consulta até uma linha e só afirma algo se não houver erro e houver dados; portanto **passa inclusive quando a consulta falha ou vem vazia**. | Criar Supabase isolado, aplicar migrations, rodar fixtures A/B e asserções que falhem ao erro, a vazios indevidos e a acesso cruzado. Testar rollback da RPC WMS. |
| Golden paths | `tests/e2e/sales-golden-path.spec.ts`, `purchase-golden-path.spec.ts` e `production-golden-path.spec.ts` usam `test.fixme`; são descrições, não validações executadas. | Executar O2C, P2P e PCP com efeitos persistidos, estoque, financeiro e recuperação de falhas. |
| Pagamentos / checkout | Plano `docs/governance/PLANO_RECUPERACAO_2026-10-08.md` registra checkout e boleto bloqueados até provedor; PIX/TEF e webhooks ainda dependem de homologação. | Sem cobrança real/baixa automática verificada; manter bloqueios até provedor, webhook autenticado, idempotência e conciliação. |
| Entrega | Lint CI falha e build não conclui neste ambiente. | Build reproduzível em CI, artefato testado, lint zerado ou exceções justificadas por regra, pipeline/deploy/rollback demonstrados. |

## Riscos adicionais relevantes

- `supabase/functions/_shared/sefaz-transport.ts` mantém fallback que produz resposta XML **simulada** com `cStat=100` quando não existe proxy mTLS. A emissão NF-e está bloqueada, mas o transporte é compartilhado por outros caminhos (evento/status). Antes de reativar qualquer emissão/evento, remover resposta fiscal sintética do caminho operacional e impedir que qualquer simulação seja persistida como autorização.
- `src/services/operational/supply-chain/supplyChainService.ts` agora usa RPC para criar pedido com cabeçalho e itens numa transação; **a migração não foi executada**. Sem a RPC implantada, o caminho falha. Ainda não há chave idempotente para envio duplicado; a tela `UnifiedSupplyChain.tsx` contém estados que devem ser confrontados com o `CHECK` do banco.
- `docs/FEATURE_STATUS.md` marca RLS/RBAC, vendas, estoque, PCP e financeiro como **Pronto**. Esses rótulos são afirmações de produto, não evidência suficiente de teste multi-tenant/E2E nesta revisão. Reclassificar com critérios e links para testes reais antes de usar como declaração comercial.
- A suíte unitária é útil, mas não cobre autorização tributária, assinaturas, gateway bancário, RLS com duas sessões ou desempenho/recuperação de desastres. Não foi feita avaliação de pentest, carga, backup/restore, LGPD operacional ou observabilidade em produção.

## Recomendação de liberação

**Agora:** somente demonstração/ambiente controlado e módulos específicos após verificação individual; manter NF-e e cobrança não homologadas bloqueadas. **Não** comercializar a plataforma como pronta para todos os regimes, documentos e fluxos.

**Para um piloto real restrito:** (1) escolher módulos e operações do cliente, (2) aplicar migrações em homologação e comprovar isolamento A/B e rollback, (3) obter build/CI verde, (4) executar golden paths com dados anonimizados e aprovação do responsável fiscal, (5) homologar provedores e autorizadores necessários, (6) revisar segurança, backup/restauração, auditoria e monitoramento, (7) liberação gradual por cliente com plano de rollback. Critérios não cumpridos continuam como bloqueadores, não como pendências cosméticas.

### Adendo — provisionamento de novos clientes

O inventário adicional encontrou um gatilho que inseria percentuais fiscais estimados em cada nova empresa, placeholders de endereço no onboarding, migração legada de empresa genérica e concessão condicional de acesso/assinatura de suporte, e um `setup --migrate` que repetia todos os SQLs. Há correções locais versionadas para bloquear o replay, exigir campos do cliente e remover o gatilho de novos cadastros. **Sem aplicar/testar a migration em banco, o provisionamento em ambiente implantado permanece não comprovado.** Contas/regras legadas existentes exigem auditoria específica, não exclusão cega.
