# Inventário inicial de operações e DF-e — 08/10/2026

**Estado: incompleto, não homologado.** Inventário de código, não do banco de produção nem das operações efetivamente praticadas por cada empresa. Nenhum CFOP é automaticamente tributável só por ser um código sintaticamente válido. A seleção da regra depende de natureza, regime, operação, produto/serviço, origem/destino, benefício, data, documento e legislação aplicável.

| Superfície | Evidência no repositório | Lacuna para dados/cálculos reais |
|---|---|---|
| NF-e | `src/modules/fiscal/NFe.tsx`, `src/components/fiscal/createNFe`, `supabase/functions/nfe-emit`, `supabase/functions/_shared/nfe-xml.ts` | Gerador legado admite payload direto, cobre somente subset de operações e não implementa RTC integral. Endpoint agora retorna 503 para qualquer emissão até homologação. |
| NFC-e/PDV | `src/modules/fiscal/NFCe.tsx`, `src/components/fiscal/PDVDialog.tsx`, `src/hooks/fiscal/useNFCe.ts` | Validar geração, autorização, contingência, cancelamento, impostos e cada operação permitida por modelo. Não presumir que NF-e cobre NFC-e. |
| NFS-e | `src/modules/fiscal/NFSe.tsx` | Conferir DPS, leiaute nacional/municipal, NBS, serviços, regimes, eventos e teste em autorizador. |
| CT-e | `src/modules/fiscal/CTe.tsx`, `src/modules/fiscal/cte/*` | Transporte e sua NT/XSD próprios; não reutilizar cálculo NF-e. |
| MDF-e | `src/modules/fiscal/MDFe.tsx` | Documento de manifesto: requisitos e tratamento fiscal específicos, não inventar cálculo de IBS/CBS por item. |
| EFD-Reinf/SPED | `src/modules/fiscal/Reinf.tsx`, `SpedFiles.tsx` | São obrigações/apuração distintas de emissão; reconciliar somente documentos autorizados. |
| Produtos, CFOP e regras | `src/components/inventory/productForm/FiscalTab.tsx`, `src/config/fiscal.ts`, `src/hooks/fiscal/useTaxRules.ts`, `src/hooks/fiscal/useFiscalTaxRules.ts`, `src/shared/utils/fiscalMotor.ts` | Havia seleção de apenas oito CFOP e sobrescrita automática por UF; removida a restrição de seleção e a sobrescrita nesta etapa. Quatro dígitos não atestam vigência/elegibilidade do CFOP. Motor de prévia não usa CFOP nem regime para selecionar regra: **não é cálculo fiscal completo**. |
| RPC legado | `supabase/migrations/20260419140520_19b9fa07-8ef8-473b-84b0-5aaf60d35381.sql` (`calculate_nfe_item_taxes`) | Se não acha regra, devolve zeros; ignora distinções complexas por regime, documento e RTC. Auditar todos os chamadores e substituir por motor versionado que falhe fechado antes de liberar qualquer fluxo. |
| Crédito presumido | `src/shared/utils/presumedCredit.ts`, migração `20261008180000_rtc_presumed_credit_catalog.sql` | Catálogo ainda vazio e não conectado a emissor/apuração; importar fonte oficial completa com vigência efetiva e aprovação fiscal. |

## Próxima matriz de aceite a aprovar

1. Levantar **do ambiente real** empresas e regimes, CNAE, cadastros de produtos/serviços (NCM/NBS, origem, CST/CSOSN), CFOPs efetivamente usados, UFs/municípios, natureza, emitentes, clientes, incentivos, documentos e eventos; não há acesso ao banco de produção nesta revisão.
2. Carregar e versionar tabelas oficiais CFOP/CST/cClassTrib/cCredPres, alíquotas e anexos com fonte, hash, início/fim de vigência, documento e ambiente. Rejeitar dados ausentes/ambíguos.
3. Elaborar testes para entradas, saídas, devoluções, transferências, remessas, industrialização, ST, monofásicos, exportação/importação e serviços/transporte somente quando aplicáveis à empresa e ao documento; incluir negativos por regime e CFOP.
4. Validar resultado por item e total com memória de cálculo e parecer do responsável fiscal; testar XML/XSD, assinatura, autorização, eventos e reconciliação em homologação por modelo. Só então liberar produção, gradualmente e por empresa.

**Publicação:** commits locais não equivalem a push no GitHub; autenticação, migrações remotas e deploy de Edge Functions precisam ser realizados e verificados separadamente.
