# Situação das funcionalidades — v1.0.0

Legenda: **Pronto** = funciona com dados reais e regras no banco · **Parcial** = funciona, com limitação documentada · **Depende de terceiros** = falha com segurança até configurar o provedor.

| Área | Situação | Observações |
|---|---|---|
| Multiempresa, unidades e papéis (RLS/RBAC) | Pronto | Isolamento por empresa; papéis admin/manager/operator/viewer |
| Cadastros (produtos, clientes, fornecedores) | Pronto | |
| Vendas / pedidos (O2C) | Pronto | Pedidos ficam pendentes até transição explícita |
| Compras: cotações e pedidos | Pronto | Conversão automática de cotação aprovada em pedido: pendente |
| Estoque, kardex e transferências entre unidades | Pronto | Saldos via movimentos e gatilhos |
| WMS (recebimento, picking, packing) | Parcial | Reservas concorrentes por posição pendentes |
| Produção / PCP | Pronto | Conclusão da OP dá entrada no acabado e baixa materiais pela ficha |
| Financeiro (pagar/receber, fluxo, conciliação OFX/CSV) | Pronto | |
| Governança e auditoria | Pronto | Eventos reais por empresa |
| Fiscal: NF-e, NFC-e, CT-e, MDF-e, NFS-e | Depende de terceiros | Exige proxy/provedor SEFAZ e certificado A1; sem eles, transmissão indisponível |
| Entrada de NF-e por XML | Parcial | Leitura e conferência prontas; lançamento automático bloqueado até validação transacional |
| PIX, boleto, TEF | Depende de terceiros | Sem provedor nenhuma cobrança é criada |
| Loja pública / checkout | Indisponível para finalização | Catálogo e carrinho podem ser visualizados; criação de pedidos e cobrança bloqueada até integração real de pagamento, frete e validação de itens no servidor |
| IA (assistentes, insights) | Depende de terceiros | Requer `LOVABLE_API_KEY` ou adaptação para outro provedor |
| E-mails transacionais | Depende de terceiros | Requer `RESEND_API_KEY` |
