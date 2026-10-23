# Runbook — o dia em que o provedor e o certificado chegarem

Pré-requisito contratado: conta no provedor (Focus NFe/NFe.io/PlugNotas),
certificado A1 (.pfx) da empresa piloto e CSC da UF (se NFC-e).

## 1. No provedor
1. Cadastrar a empresa (CNPJ, IE, regime, endereço) e subir o A1;
2. Ambiente **homologação**: credenciar na SEFAZ da UF (NF-e 55/NFC-e 65);
3. Gerar o **token de API** e guardar no cofre de segredos do servidor
   (variável `FISCAL_PROVIDER_TOKEN`) — **nunca** no navegador/git.

## 2. No sistema (Fiscal > NF-e, cartão "Emissor fiscal")
1. Provedor = o contratado; Ambiente = Homologação;
2. Certificado A1 — validade = data do .pfx; CSC marcado se NFC-e;
3. Salvar. Repetir por empresa do grupo que emite.

## 3. Homologação (obrigatória, com evidência)
Emitir pelo provedor em homologação a partir das telas de documento (o enqueue oficial respeita o gate):
venda NF-e, NFC-e (se PDV), devolução, cancelamento e carta de correção.
Cada cenário precisa retornar **autorizada** da SEFAZ. Guardar os XMLs.

## 4. Liberar
1. Cartão: preencher **"Homologação aprovada em"** e marcar
   **"Liberar emissão (fila)"** → salvar (o banco recusa liberar sem
   provedor + certificado + data: constraint `fiscal_emission_gate`);
2. Painel "Pronto para operar?" passa a mostrar emissão liberada;
3. Worker do provedor (Edge Function/serviço com o token em segredo,
   papel `service_role`): seleciona jobs `queued` em
   `fiscal_emission_jobs`, marca `processing`, chama a API do provedor e
   grava o retorno REAL com `complete_fiscal_emission(job, 'authorized'|
   'rejected', protocolo, chave, erro)` — função já existente e restrita
   a `service_role`. **Esse worker é o único código que falta escrever
   no dia** — fila oficial, gate e telas já estão prontos.

## 5. Rollback
Desmarcar "Liberar emissão" → novos itens nascem **bloqueados** na hora;
nada que já foi autorizado é afetado.

## Verificação rápida (SQL)
```sql
select company_id, provider, environment, emission_enabled,
       homologation_approved_at from fiscal_provider_settings;
select status, count(*) from fiscal_emission_jobs group by 1;
```
