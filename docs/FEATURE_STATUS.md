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
| Produção / PCP | **Não comprovado ponta a ponta** | `tests/e2e/production-golden-path.spec.ts` está `fixme`; IoT não mede sensores reais |
| Financeiro (pagar/receber, OFX/CSV) | **Não comprovado ponta a ponta** | Conciliação, concorrência, idempotência e RLS em banco a testar |
| Governança e auditoria | **Não comprovado** | Scanner não implementado; trilha e retenção exigem evidências |
| Fiscal: todos os DF-e usados por cada cliente | **Não homologado** | NF-e Edge responde 503; regime/modelo/UF, certificado, XSD, assinatura, transporte e retorno oficial por operação ainda exigem validação fiscal |
| Entrada de NF-e por XML | **Parcial / lançamento bloqueado** | Leitura não prova entrada transacional em estoque e financeiro |
| PIX, boleto, TEF | **Bloqueado sem provedor** | Não prometer cobrança sem PSP/banco e webhook autenticado |
| Loja pública / checkout | **Finalização bloqueada** | Itens, frete, preço server-side, PSP, webhook e conciliação a implementar/testar |
| IA e e-mails transacionais | **Dependem de integração** | Segurança, indisponibilidade e idempotência do provedor não comprovadas |
| IoT e logística inteligente | **Sem medição real** | Dashboard avisa ausência de sensores; serviços legados não fabricam rastreamento |

**Decisão:** não oferecer o conjunto como ERP/WMS pronto para produção. Escopo reduzido só após provas específicas da jornada vendida, RLS, backup/restore, CI verde, suporte e homologações necessárias.
