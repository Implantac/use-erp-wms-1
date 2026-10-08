# Implantação fiscal por cliente — estrutura e gates

**Objetivo:** permitir parametrização posterior sem semear impostos, CFOPs ou benefícios fictícios. **Estado: estrutura inicial; NÃO é um motor fiscal homologado.** O catálogo oficial cCredPres e o inventário das operações do cliente começam vazios. Nenhuma emissão é liberada por preencher estas tabelas.

## Dados exigidos no onboarding

1. Empresa, CNPJ/filiais, responsável fiscal habilitado, regime e suas datas de alteração; verificar consistência entre `companies.tax_regime` e `fiscal_client_setup.tax_regime` (ainda não há sincronização automática).
2. Para cada documento usado: modelo/ambiente/autorizador, versão do leiaute e XSD, certificado, séries, UF/município, testes de homologação e eventos.
3. Para cada operação: espécie, CFOP oficial vigente, NCM/NBS, origem/destino, tipo de destinatário, CST/CSOSN, cClassTrib, benefício/ato legal e datas. Cobertura é por empresa; códigos de quatro dígitos apenas passam na validação de formato.
4. Fontes normativas e tabelas versionadas (CFOP, CST, cClassTrib, cCredPres, alíquotas), conferidas por regime/documento/ambiente. Registrar origem, hash e vigência efetiva. Nunca aceitar alíquota, crédito ou isenção inferidos por CFOP isolado.
5. Casos aprovados pelo responsável fiscal, resultados de cálculo com memória e testes de XML/XSD, assinatura, autorização e eventos em homologação; só então solicitar liberação controlada em produção.

## Persistência e permissões

A migração `20261008190000_fiscal_client_onboarding.sql` cria `fiscal_client_setup` (responsável e regime por empresa) e `fiscal_operation_coverage` (documento, operação, CFOP opcional para documentos que não o usam, NCM/NBS/UF, regime, fonte e vigência), ambas com RLS por empresa. Usuários da empresa leem; administradores/gestores criam ou editam rascunhos, sem poder marcar como homologado via cliente. Apenas fluxo privilegiado futuro poderá registrar aprovação após verificações externas. Não existe API de aprovação implementada. `checkFiscalCoverage` recusa cobertura ausente, duplicada, de outra empresa/regime/modelo, inválida ou sem homologação, mas ainda NÃO participa de cálculo ou emissão.

## Pendências antes de afirmar 'pronto para dados/cálculos reais'

- Migrar o RPC legado `calculate_nfe_item_taxes`: hoje devolve zeros quando falta regra, o que é inseguro; revisar consumidores e substituir com transição compatível, critérios por regime/CFOP/vigência e isolamento tenant.
- Integrar regras completas, atualizadas e auditadas ao motor de cálculo, com cálculos por documento, operação e regime e conjuntos de testes oficiais; criar procedimento de atualização de tabela e rollback.
- Conectar o catálogo cCredPres, a cobertura por cliente e o responsável fiscal aos fluxos de configuração, observabilidade e liberação; nenhuma tabela nova habilita emissão.
- Testar migrações em banco temporário e aplicar ao banco remoto; não realizados aqui. O endpoint NF-e permanece bloqueado até homologação.
- Revisar portfólio de modelos efetivamente necessário a cada cliente; não presumir que todos os modelos compartilham CFOP ou cálculo.

## Revisão incremental do RPC legado (08/10/2026)

Migração `20261008193000_harden_legacy_tax_rpc.sql`: a prévia `calculate_nfe_item_taxes` passa a exigir empresa autenticada, configuração fiscal por cliente, NCM/CFOP/UF e regra exata da empresa e regime, rejeitando ausência de regra em vez de retornar impostos zerados. O gatilho `trg_nfe_items_auto_calc` redundante é removido; `recalc_nfe_item_taxes_v2` deixa de engolir erros e passa UF explicitamente. Isso **pode bloquear a gravação de itens NF-e** até que os cadastros estejam completos, como medida de segurança fiscal. O hook cliente também rejeita resposta sem `rule_id`.

**Atenção à implantação:** a migração não foi executada em banco de testes nem produção. Antes do deploy, validar os regimes efetivamente armazenados em `tax_rules.tax_regime` versus `fiscal_client_setup.tax_regime`, impactos em triggers e dados legados, executar testes transacionais em cópia anonimizada e prever rollback. As fórmulas legadas de ST, DIFAL, IBS/CBS e regimes especiais **continuam sem homologação**; uma regra encontrada não atesta cálculo correto nem autoriza emissão.
