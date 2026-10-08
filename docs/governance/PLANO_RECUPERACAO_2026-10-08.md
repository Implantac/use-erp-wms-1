# Plano de recuperação funcional — 08/10/2026

## Critério de conclusão
Um recurso só é marcado como pronto quando existe teste automatizado do efeito final no banco com duas identidades de tenant quando aplicável, tratamento explícito de falhas, build e tipagem aprovados, e evidência de homologação do provedor quando externo. Tela ou documentação não bastam.

## P0 — Impedir decisões com dados fictícios (iniciado neste lote)
- [x] Substituir números, alertas e gráfico fixos do dashboard financeiro por dados consultados e mensagens de erro.
- [x] Informar quando limites de consulta tornam os totais incompletos; não apresentar EBITDA sem cálculo verificável.
- [x] Bloquear ação de criação de boleto: o endpoint financeiro atual não implementa `generate_boleto`.
- [x] Bloquear checkout público sem provedor: removidos PIX inventado, cartão marcado como pago sem gateway, boleto prometido e produto demonstrativo inserido automaticamente. Não coletar dados de cartão/cliente nessa tela enquanto indisponível. Testes garantem ausência de gravação para os três meios de pagamento.
- [x] Proteger administração e banco contra confirmação manual de pagamento: hook bloqueia `paid`, UI não oferece avanço de pedido não pago, migration `20261008170000_block_unverified_storefront_checkout.sql` rejeita criação pública e mudança de pagamento por `anon`/`authenticated` até haver provedor. **A migration precisa ser aplicada no banco implantado; proteção de banco ainda não verificada.**
- [ ] Implementar checkout transacional com provedor real, itens verificados no servidor, frete calculado e webhook autenticado antes de reativar a finalização. Remover/rever a guarda do banco apenas depois da homologação.
- [x] Remover score, certificação e selos de segurança fixos da tela de auditoria; indicar controles como não verificados até existir evidência real. Teste de regressão adicionado.
- [ ] Revisar os demais dashboards/rotas por constantes apresentadas como dados reais e adicionar testes de regressão.
- [x] EFD-Reinf: sem certificado não cria protocolo/transmissão simulada; XML apenas assinado não retorna sucesso de envio; HTTP sem protocolo não confirma autorização. Adicionados testes do cliente contra resposta legada simulada.
- [ ] Homologar EFD-Reinf ponta a ponta com certificado real e validar semanticamente o XML de resposta oficial (protocolo isolado não prova autorização). Revisar históricos legados SIM existentes.

## P1 — Gates reproduzíveis e integridade
- [ ] Corrigir comando `typecheck`: `tsgo` não consta das dependências instaladas; medir memória adequada para a base.
- [ ] Zerar os avisos reportáveis em `npm run lint:ci`.
- [ ] Executar `npm run build` em runner com memória suficiente e registrar artefato, tempo e consumo.
- [ ] Prover Supabase de homologação, migrations aplicadas, seeds determinísticas e duas identidades de tenants distintos. Não usar dados de produção.
- [x] Escopar consultas de contas bancárias e títulos financeiros por `company_id`, desabilitar sem empresa e separar chaves do cache por tenant (testes unitários de troca de empresa).
- [ ] Testar isolamento RLS, políticas de unidade/canal, concorrência WMS e transações financeiras/fiscais contra o banco. Os testes de cache não substituem a verificação real de RLS.

## P2 — Golden paths (bloqueantes para aprovação operacional)
- [ ] O2C: pedido → aprovação → reserva → expedição → fiscal real/homologação → contas a receber.
- [ ] P2P: cotação → pedido → recebimento → saldo/estoque → contas a pagar.
- [ ] PCP: BOM → OP → reserva/consumo → qualidade → entrada de acabado.
- [ ] Retirar `test.fixme` somente após fixtures e asserções persistidas para cada etapa.
- [ ] Criar relatórios financeiros por agregação no servidor, sem truncamento silencioso por `LIST_LIMIT`.

## P3 — Integrações externas
- [ ] Implementar emissão/cancelamento de boleto com adaptador bancário, webhook autenticado, idempotência e baixa transacional; remover bloqueio da UI apenas após homologação.
- [ ] Homologar NF-e/NFC-e/CT-e/MDF-e/NFS-e e EFD-Reinf com certificado, autorização e rejeição reais; nunca promover simulação a autorização.
- [ ] Implementar entrada de XML por operação transacional idempotente de produtos, estoque e financeiro antes de habilitar o botão.
- [ ] Homologar PIX/TEF, e-mails e IA com provedores reais e cenários de indisponibilidade.

## Evidência deste lote
`npx vitest run --maxWorkers=2`: 115 testes aprovados (18 arquivos) na análise anterior. `npm run lint:ci`: 35 avisos, gate falha. `npm run typecheck`: executável `tsgo` ausente. Build local encerrado por limite do ambiente (137), não interpretado como falha de código. Nenhum E2E conectado ao Supabase nem homologação de terceiros foi realizado. Atualizar estes resultados após cada fase.
