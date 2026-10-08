# Auditoria inicial da Reforma Tributária do Consumo — 08/10/2026

**Estado: NÃO HOMOLOGADO.** Este inventário não constitui parecer jurídico/contábil, não afirma conformidade integral e não autoriza emissão. Escopo solicitado: todos os regimes (Simples Nacional, regimes normais e especiais). As particularidades de operações, UF/município, benefícios, destino, atividade, documento e vigência ainda precisam de matriz própria e validação fiscal profissional.

## Fontes oficiais monitoradas

1. Receita Federal/CGIBS, orientações 2026: destaque individualizado por operação e leiaute por documento; dispensa de recolhimento em 2026 condicionada às regras aplicáveis, sem dispensar análise das obrigações acessórias [1](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026).
2. Portal NF-e, relação de NT 2025.002-RTC: em 08/10/2026 consta v1.52 publicada em 01/10/2026 para NF-e/NFC-e [2](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D&AspxAutoDetectCookieSupport=1).
3. Informe Técnico 2025.002 v1.70, tabelas CST-IBS/CBS, cClassTrib e crédito presumido; os códigos e indicadores devem ser versionados, não inferidos por alíquota [3](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=h9o7idH%20OcI=).
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

## Crédito presumido IBS/CBS — revisão do artigo TecnoSpeed (08/10/2026)

Fonte secundária: [artigo TecnoSpeed](https://blog.tecnospeed.com.br/tabela-de-credito-presumido-do-ibs-e-cbs/). Fonte primária confirmada: [Informe Técnico 2025.002 v1.70, Portal NF-e](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=h9o7idH%20OcI=), [listagem oficial publicada em 01/10/2026](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=hXzemuyNHW4=), [tabela interativa SVRS](https://dfe-portal.svrs.rs.gov.br/DFE/TabelaCreditoPresumido). O IT descreve cCredPres, fundamento legal, apropriação via NF ou evento, indicadores de grupo e dedução, datas próprias de IBS e CBS e permissões por NF-e, NFC-e, CT-e e NFS-e. A v1.70 desativa apropriação **via NF** dos códigos **01 e 03** e indica implantação **até 16/10/2026 em HML/PROD**: em 08/10/2026, esse prazo ainda é futuro. Não transformar prazo máximo em data exata de início nem antecipar a ativação em cada autorizador.

**Diagnóstico:** busca no código anterior não encontrou `cCredPres`, `gCredPres` nem fluxo de apropriação. Portanto o sistema não atendia a tabela; a NF-e continua bloqueada e não há evidência de crédito presumido lançado/emitido por fluxo existente. O artigo menciona exemplo de PLP 63/2025: proposta legislativa não autoriza parametrização automática nem percentual presumido.

**Incremento seguro:** migração `20261008180000_rtc_presumed_credit_catalog.sql` cria catálogo de versões e janelas distintas IBS/CBS, quatro modelos, via NF/evento e indicadores, sem semear códigos ou alíquotas; somente `service_role` pode escrever. `src/shared/utils/presumedCredit.ts` valida código, versão única vigente, autorização cClassTrib informada, tributo, documento e via, falhando fechado se faltar fonte. **Não está ligado ao cálculo, XML, apuração, UI ou emissão**, nem deve ser usado para concluir direito ao benefício. Datas dos testes são cenários artificiais, não vigência normativa. Sem importação auditada e atestada da tabela oficial, toda tentativa de validação com catálogo vazio é recusada.

**Ainda pendente antes de operar:** obter arquivo oficial completo da tabela SVRS (JSON exige certificado digital ou exportação verificável), registrar hash, vigência efetiva por ambiente e versão, importar linhas completas e impedir versões sobrepostas na importação; reconciliar cClassTrib e regras da NT específica por modelo; validar requisitos materiais do benefício por regime/operação, nota referenciada, percentuais e método de apropriação com responsável fiscal; homologar cálculos, eventos, XML e escrituração. Publicar migração no banco do projeto **não foi verificado**. A criação da estrutura não equivale a suporte operacional ou homologação.
