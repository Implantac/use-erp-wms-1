# Desenho fiscal — caminho para homologação (decisão registrada)

## Decisão
**Provedor fiscal via API primeiro** (Focus NFe, NFe.io ou PlugNotas),
emissor próprio só se o volume justificar. Motivo: time-to-market,
manutenção de leiaute/XSD por UF e contingência são do provedor; o ERP
concentra regra de negócio (quando emitir, o que emitir, como reagir).

## Fluxo alvo
```
Venda/pedido confirmado → fila fiscal (billing_queue) → provedor (API)
  → SEFAZ (homologação → produção) → retorno (autorizada/rejeitada)
  → status na tela de NF-e + DANFe/XML arquivados + baixa vinculada
Rejeição → motivo exibido, correção no cadastro e reenvio (nunca "forçar")
Cancelamento/inutilização → eventos pelo provedor, com auditoria
```

## Dados obrigatórios (já mapeados no sistema)
- Empresa: CNPJ, IE (`state_registration`), regime (`tax_regime`),
  endereço fiscal completo, certificado A1 válido, CSC (NFC-e).
- Produto: NCM, CEST, CFOP, CST/CSOSN, alíquotas (campos já existem em
  `products`). O painel "Pronto para operar?" mede a cobertura de NCM.
- Configuração por empresa: `fiscal_provider_settings` (provedor,
  ambiente, validade do certificado, CSC) — **sem emissão nesta versão**.

## Homologação (checklist por empresa/UF/modelo)
1. Certificado A1 instalado no provedor e válido;
2. Credenciamento da empresa na SEFAZ (NF-e 55 e/ou NFC-e 65);
3. Emissão em **homologação**: venda, devolução, cancelamento, carta de
   correção — retorno "autorizada" comprovado em cada cenário;
4. Contingência testada (provedor) e DANFe conferido;
5. Só então: ambiente = produção e liberação do botão de emissão por
   feature flag `fiscal_emission_enabled` (default **false**).

## Segurança e honestidade
- Token do provedor/certificado **nunca** no frontend nem em texto puro
  no banco acessível ao cliente: segredo em cofre (Edge Function/secret).
- Enquanto qualquer item do checklist não estiver comprovado, a UI
  mantém "emissão bloqueada" — como está hoje (NF-e e checkout).

## Critério de pronto (gate do plano)
Primeira NF-e **autorizada em produção** por uma empresa piloto, com
XML/DANFe arquivados e conciliação com o pedido — evidência, não promessa.
