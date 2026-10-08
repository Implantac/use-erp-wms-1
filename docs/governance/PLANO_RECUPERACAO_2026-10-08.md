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
- [x] Substituir `_TENANT_` no lote EFD-Reinf pelo CNPJ da empresa; exigir CNPJ numérico com dígitos verificadores válidos (o XML atual não suporta CNPJ alfanumérico). Tratar protocolo de recebimento como `sent`, não como `accepted`; avisar na UI que autorização ainda está pendente.
- [x] Remover fallback de certificado A1 global nas funções de transmissão e status: somente secrets com sufixo do UUID da empresa são aceitos. Instalações com secret global precisam migrar antes do deploy; isolamento comprovado por teste unitário, não por homologação criptográfica.
- [x] Conferir CNPJ da empresa no `subject` do A1 e período de validade antes da transmissão; status do certificado informa falha de validação. Formatos de certificado que não exponham CNPJ no subject falham fechados.
- [x] Bloquear envio de lote quando algum evento não for reconhecido/assinado ou seu Id mudar. Esta checagem estrutural não substitui verificação XMLDSig criptográfica externa.
- [ ] Homologar EFD-Reinf ponta a ponta com certificado real e validar semanticamente o XML de resposta oficial (protocolo isolado não prova autorização). Revisar históricos legados SIM e formatos de subject ICP-Brasil usados por clientes reais.

## P1 — Gates reproduzíveis e integridade
- [x] Fixar `@typescript/native-preview` nas dependências de desenvolvimento e no `bun.lock`: `npm run typecheck` executa `tsgo --noEmit` localmente. TypeScript clássico `tsc -b --noEmit` ainda excedeu heap neste ambiente; aferir memória e comportamento em CI.
- [ ] Zerar os avisos reportáveis em `npm run lint:ci`. Incremento: 27 avisos restantes após correção de dependências de hooks em interface adaptativa, cadeia de suprimentos, divergências e pátio. A troca de filtros da cadeia de suprimentos agora atualiza a consulta sem closure obsoleta; gate global ainda falha.
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

## P2A — IBS/CBS para todos os regimes (iniciado)
- [x] Inventário inicial de fontes oficiais, versões e lacunas em `docs/fiscal/RTC_IBS_CBS_AUDITORIA_2026-10-08.md`; **não é homologação integral**.
- [x] Eliminar alíquotas IBS/CBS presumidas, redução arbitrária dos tributos legados e XML de NF-e com emitente/protocolo fictícios; bloquear criação/exportação não oficial, exigir regra explícita e sinalizar erro no fluxo de prévia.
- [ ] Versionar tabelas oficiais CST/cClassTrib, XSD e regras por documento, regime, operação e data; validar com responsável fiscal e homologar em ambiente autorizado.
- [ ] Revalidar preços, totais, apuração e créditos para 2026 e transição posterior; nenhuma regra genérica substitui todos os regimes.

## P3 — Integrações externas
- [ ] Implementar emissão/cancelamento de boleto com adaptador bancário, webhook autenticado, idempotência e baixa transacional; remover bloqueio da UI apenas após homologação.
- [ ] Homologar NF-e/NFC-e/CT-e/MDF-e/NFS-e e EFD-Reinf com certificado, autorização e rejeição reais; nunca promover simulação a autorização.
- [ ] Implementar entrada de XML por operação transacional idempotente de produtos, estoque e financeiro antes de habilitar o botão.
- [ ] Homologar PIX/TEF, e-mails e IA com provedores reais e cenários de indisponibilidade.

## Evidência deste lote
`npx vitest run --maxWorkers=2`: 115 testes aprovados (18 arquivos) na análise anterior. `npm run lint:ci`: 35 avisos, gate falha. `npm run typecheck`: executável `tsgo` ausente. Build local encerrado por limite do ambiente (137), não interpretado como falha de código. Nenhum E2E conectado ao Supabase nem homologação de terceiros foi realizado. Atualizar estes resultados após cada fase.
