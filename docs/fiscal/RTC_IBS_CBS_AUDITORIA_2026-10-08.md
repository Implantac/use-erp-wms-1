# Auditoria inicial da Reforma Tributária do Consumo — 08/10/2026

**Estado: NÃO HOMOLOGADO.** Este inventário não constitui parecer jurídico/contábil, não afirma conformidade integral e não autoriza emissão. Escopo solicitado: todos os regimes (Simples Nacional, regimes normais e especiais). As particularidades de operações, UF/município, benefícios, destino, atividade, documento e vigência ainda precisam de matriz própria e validação fiscal profissional.

## Fontes oficiais monitoradas

1. Receita Federal/CGIBS, orientações 2026: destaque individualizado por operação e leiaute por documento; dispensa de recolhimento em 2026 condicionada às regras aplicáveis, sem dispensar análise das obrigações acessórias [1](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026).
2. Portal NF-e, relação de NT 2025.002-RTC: em 08/10/2026 consta v1.52 publicada em 01/10/2026 para NF-e/NFC-e [2](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D&AspxAutoDetectCookieSupport=1).
3. Informe Técnico 2025.002, tabelas CST-IBS/CBS, cClassTrib e crédito presumido; os códigos e indicadores devem ser versionados, não inferidos por alíquota [3](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=jxTMMQeEVM8%3D&AspxAutoDetectCookieSupport=1).
4. Portal NFS-e RTC: lista técnica incluindo NT 009 v1.01 de 01/10/2026 e NT 010; consultar anexos vigentes por ambiente [4](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc).
5. Portal NFS-e, NT 009: grupos de notas de ajuste e campos específicos para Simples Nacional [5](https://www.gov.br/nfse/pt-br/noticias/publicada-a-nota-tecnica-009-da-nfs-e).
6. RFB/CGIBS comunicaram flexibilização de regras de rejeição por ausência de campos IBS/CBS em alguns DFe; **não interpretar ausência de rejeição como conformidade fiscal** [6](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-e-cgibs-flexibilizarao-obrigatoriedade-de-informacoes-em-documentos-fiscais).

## Matriz de lacunas do código

| Frente | Achado verificável | Próxima condição de aceite |
|---|---|---|
| NF-e/NFC-e | `src/shared/utils/fiscalMotor.ts` presumía IBS 17,7%, CBS 8,8% e redução automática de 10% dos tributos antigos; removido neste lote. `src/lib/fiscalDocuments/nfeXml.ts` fabricava emitente, endereço e protocolo; exportação bloqueada. | Implementar grupo UB, CST/cClassTrib/indicadores da versão vigente, bases, reduções, diferimento, monofasia, crédito, totalizadores, assinatura, XSD e autorização em homologação, com casos por regime e operação. |
| Regras fiscais | `fiscal_tax_rules` guarda percentuais IBS/CBS mas não classifica sozinho CST/cClassTrib nem vigência por documento; a prévia agora falha sem regra e alíquota explícita. | Modelar seleção versionada por regime, CFOP, NCM/NBS, operação, destino, vigência e código oficial; jamais selecionar taxa padrão implícita. |
| NFS-e | Exige trilha própria de DPS, IBS/CBS, ajustes e Simples segundo documentação nacional; não há evidência de homologação E2E. | Homologar anexos e API nacional/municipal aplicável, com notas de ajuste e regimes. |
| CT-e/CT-e OS/MDF-e e outros DFe | O comunicado RFB lista documentos e obrigações distintos; não há evidência de implementação IBS/CBS por leiaute neste repositório. | Inventariar NT específica de cada modelo, XSD, códigos e cenários fiscais antes de liberar. |
| Apuração/financeiro | Destaque de IBS/CBS em 2026 e recolhimento dependem de regras/condições legais; não concluir obrigação de pagamento a partir de mera prévia numérica. | Reconciliação por DFe autorizado, créditos e devoluções, vigência e apuração oficial por regime. |

## Gates de homologação

- Congelar versão da NT, XSD, tabelas oficiais e data de vigência **por modelo e ambiente**; rever a cada publicação.
- Matriz aprovada por responsável fiscal para Simples, lucro presumido, lucro real e regimes especiais efetivamente utilizados, com casos de isenção/redução/diferimento/devolução.
- Testes golden-path de XML validado contra XSD, cálculo item/total, rejeições e autorização/cancelamento em ambiente oficial ou integrador homologado.
- Nenhuma tela, percentual calculado ou ausência de rejeição da SEFAZ equivale a conformidade integral.
