# Roadmap

- [x] Revisar a combinação de cores e o contraste dos botões compartilhados, menu lateral e barra superior, preservando a identidade e os fluxos atuais.
- [x] Adaptar cadastro de produtos ao perfil somente loja/PDV, preservando campos avançados para empresas industriais.
- [ ] Concluir lançamento atômico e idempotente de nota de entrada: leitura e revisão reais prontas; cadastro automático, estoque e financeiro bloqueados até transação segura, regras fiscais e vínculo da unidade.
- [x] Remover o gatilho legado duplicado de saldo que referenciava coluna inexistente em movimentos.
- [ ] Testar transação integral de entrada em ambiente isolado antes de ativar o lançamento de XML.
- [x] Remover documentos fiscais simulados do painel e consultar notas reais da empresa.
- [x] Impedir autorização e cancelamento simulados de NF-e, NFC-e, CT-e e MDF-e; bloquear sincronização offline fictícia e devolução não transacional.
- [x] Ativar acompanhamento de transmissões por empresa: fila criada com leitura restrita por empresa/unidade; gravação somente pelo serviço fiscal oficial.
- [ ] Integrar transmissão e eventos fiscais oficiais para NF-e, NFC-e, CT-e, MDF-e e NFS-e; implementar CT-e OS antes de anunciar prontidão fiscal completa.
- [ ] Integrar MRP a compras e reservas concorrentes por posição no WMS; validar terminais físicos/TEF no PDV.

- [x] Fase 0 — Baseline, inventário e matriz de rastreabilidade
- [ ] Fase 1 — Segurança multiempresa, filial e canal (Lotes 1–2 concluídos; Lote 4 auditado: guards pendentes em `settle_account`, faturamento atômico, auditoria financeira, ajustes e RLS por filial/canal; aplicação bloqueada enquanto o Lovable Cloud finaliza alterações)
- [ ] Fase 3 — Ledger e integridade de estoque
- [ ] Fases 4–5 — PDV, fiscal e financeiro idempotentes
- [ ] Fase 2 — Consolidação arquitetural e tipagem por domínio
- [ ] Fase 6 — E2E críticos e CI bloqueante (pipeline bloqueante criado; fixtures O2C/P2P/PCP pendentes)
- [ ] Fase 7 — Performance e observabilidade
- [ ] Fase 8 — UX, acessibilidade e navegação
  - [x] Evoluir navegação por tarefas conforme contexto ativo e dar feedback confiável às pendências (lote de experiência operacional).
  - [x] Ajustar seleção de empresa e unidade para caber no topo do celular.
  - [x] Facilitar a escolha de produtos na transferência, mostrar saldos e impedir solicitações acima do disponível antes do envio.
  - [x] Diferenciar listas vazias de falhas de consulta em transferências, recebimentos e histórico, com atualização manual.
  - [x] Clarificar empresa jurídica versus unidade operacional no seletor e cadastro, com seleção ativa e feedback de troca.
  - [x] Corrigir cadastro, edição e visualização de fornecedores; tornar a tela acessível e validar formulário no navegador.
  - [ ] Completar auditoria dos demais módulos e testar gravação real de fornecedores (bloqueio: não criar registros de teste em dados operacionais sem ambiente isolado).
- [ ] Fase 9 — IA e automações governadas
- [ ] Fase 10 — Preparação e validação de produção

## Revisão ponta a ponta — 2026-09-30

- [x] Corrigir painel WMS: retirar indicadores fictícios, mostrar falhas e atualizar dados operacionais.
- [x] Bloquear QR e confirmação PIX fictícios no PDV; sem provedor configurado, cobrança retorna 503 sem criação. Integração PSP real permanece pendente.

- [x] Corrigir ordem instável de hooks no painel WMS.
- [x] Impedir conclusão automática prematura de pedidos recém-criados.
- [x] Remover fallback de boleto fictício; falhar com segurança sem provedor válido.
- [x] Calcular sugestões de compras com saldos reais de estoque.
- [x] Bloquear NF-e automática de transferência enquanto faltarem numeração e valores fiscais reais.
- [x] Tornar atualização e exclusão RFID funcionais, com confirmação destrutiva.
- [ ] Implementar emissão fiscal real de transferência com numeração idempotente e valores dos itens.
- [x] Entrada da quantidade aprovada da OP no estoque da empresa/unidade, idempotente.
- [x] Consumo de matéria-prima na conclusão da OP pela ficha de materiais (aba Materiais da OP).
- [x] CRUD completo de cotações de compra com modelo próprio, itens, fluxo de situação e permissões por empresa.
- [x] Substituir indicadores e eventos simulados da governança por consultas reais por empresa e período, com falhas explícitas e exportação apenas de registros consultados.
- [ ] Ativar fixtures e testes E2E completos de O2C, P2P, PCP e PDV no pipeline.
- [x] Isolamento por unidade (perfil com unidade fixa) em 20 tabelas e correção de 3 funções privilegiadas sem checagem de empresa.
- [ ] Isolamento por canal de venda (VAREJO_PDV/ATACADO_INDUSTRIA).

## Release comercial USE ERP v1.0.0
- [x] Pacote de instalação: .env.example, setup, Docker, Nginx, reapontamento de agendamentos.
- [x] Documentação: README, instalação, variáveis, VPS, backup, situação das funcionalidades, changelog, modelo de licença.
- [ ] Teste de instalação limpa em projeto novo (bloqueio: requer projeto/servidor separado do comprador).
- [ ] Testes ponta a ponta dos 6 fluxos principais com dados de demonstração isolados.
- [x] Converter cotação aprovada em pedido de compra (uma única vez, por gestores).
- [x] Cotação com prazo de entrega, condição de pagamento e comparação de preços entre fornecedores (regra testada).
- [ ] Revisar os 42 avisos de funções privilegiadas do banco.
- [ ] Licença final revisada por advogado (bloqueio: dados e termos do licenciante).
