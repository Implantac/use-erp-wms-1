# Auditoria completa (software house) + análise de mercado — USE ERP WMS

**Data:** 2026-10-21 · **Objeto:** plataforma USE ERP WMS (repositório
`Implantac/use-erp-wms-1`, branch `main` @ `3ae274e1`) · **Método:** inspeção do
código e dos artefatos do repositório, resultados dos testes executados neste
programa, documentação interna (`FEATURE_STATUS.md`, revisões anteriores) e
pesquisa de mercado com fontes públicas citadas.

> Este relatório separa **fato comprovado** (código/teste executado), **risco
> identificado** (evidência no código, sem exploração) e **Opinião técnica**
> (juízo da equipe). Nada aqui substitui homologação em produção.

---

## Sumário executivo

O USE ERP WMS é hoje uma **plataforma ERP multiempresa ampla** (≈191 mil linhas
de TypeScript/TSX, 147 páginas, 462 migrations, 62 Edge Functions), com um
**vertical têxtil industrial funcional e testado ponta a ponta** (fiação,
malharia, tecelagem e tinturaria, da pluma à expedição) que nenhum concorrente
direto entrega com esta arquitetura moderna pelo mesmo custo de entrada.

**Veredito técnico:** produto em estágio de **pré-produção avançada**. O núcleo
produtivo têxtil está provado em banco embarcado e em instalação local real. Os
bloqueadores de produção são conhecidos e mapeados: isolamento RLS completo
(Fase 1c), fiscal homologado, custos formais, entidade rolo/peça e piloto com
dados reais. Nenhum deles é estrutural — são lotes de trabalho estimáveis.

**Veredito comercial:** **viável com posicionamento estreito**. Não competir
como "ERP genérico"; vencer como **ERP têxtil moderno para PMEs industriais**
(20–300 funcionários) dos polos têxteis, onde os incumbentes são antigos,
caros de implantar e fracos em nuvem/UX. O fiscal homologado é a **condição
nº 1 de vendabilidade**; sem ele, o teto comercial é piloto pago e operação
assistida. Com fiscal + 3–5 pilotos bem-sucedidos, o caminho para R$ 3–5 mi de
ARR em 3 anos é crível (modelo na Parte II).

### Placar por especialidade (0–10, evidência-base)

| Área | Nota | Síntese |
|---|---|---|
| Arquitetura de software | 7,5 | Monólito modular coerente; acoplamento controlado via RPCs |
| Backend / banco de dados | 7,0 | Transacional e auditável; dívida em policies legadas |
| Frontend / UX | 7,0 | Amplo e consistente; peso de bundle e chão de fábrica a provar |
| Qualidade / testes | 7,5 | Provas reais (462 migrations, 41/41, 76 unit, E2E); sem CI formal |
| DevOps / infraestrutura | 6,5 | Dual Lovable/local funcional; CI/CD e observabilidade a formalizar |
| Segurança / LGPD | 5,5 | **Maior risco atual**: policies permissivas legadas; ensaio A/B pendente |
| Dados / BI / IA | 6,0 | Indicadores honestos (sem números falsos); IA depende de chaves |
| Fiscal / compliance BR | **4,0** | **Bloqueador comercial**: telas e funções existem, homologação não |
| Produto / roadmap | 7,0 | Escopo ambicioso com governança nova (nicho→módulos) |
| **Média ponderada** | **6,5** | Pré-produção avançada; caminho de endurecimento claro |

---

# PARTE I — ANÁLISE TÉCNICA

## 1. Arquitetura de software

**Fatos.** Frontend SPA React + TypeScript + Vite (Tailwind, Radix/shadcn,
TanStack Query, React Hook Form); backend Supabase (Postgres + PostgREST +
Auth + Realtime + Storage + 62 Edge Functions Deno). Integração por
`@supabase/supabase-js`. Módulos de domínio em `src/modules/` (accounting,
admin, commercial, core, financial, fiscal, nps, operational, production,
purchasing, relacionamento, store-operations, success, wms) e verticais por
configuração (`src/config/` — taxonomia de segmentos, matriz de apresentação
por nicho, controle de famílias industriais).

**Pontos fortes.** (i) Regras críticas no banco via RPCs transacionais
(conclusão de OP, reserva, expedição por lote, nicho), não espalhadas na UI;
(ii) multiempresa nativo desde o início (`company_id`, planos/módulos, e agora
pacote por nicho); (iii) o mesmo build roda na nuvem (Lovable) e local
(Docker) — provado; (iv) camadas de apresentação por nicho já existiam e a
Fase 1 ligou o backend (módulos), fechando a incoerência tela/licença.

**Riscos e dívida.** (a) Maior arquivo de UI com ~1.000 linhas
(`SmartReplenishment`) e hooks grandes → refatoração incremental; (b)
`src/integrations/supabase/types.ts` com ~25 mil linhas geradas (normal, mas
exige regeneração disciplinada a cada migration para não dessincronizar);
(c) 271 usos de `any` (~0,14% das linhas) — baixo, mas concentrá-los em
fronteiras tipadas reduziria regressões; (d) dependências pesadas no bundle
(Three.js, Leaflet, html2canvas) pedem *code splitting* por rota auditado;
(e) SPA sem SSR — aceitável p/ ERP autenticado, inadequado p/ SEO de landing
(a `LandingPage` existe como rota interna).

**Opinião técnica.** Arquitetura certa para o estágio: monólito modular com
banco forte. Extrair serviços agora seria erro; o gargalo futuro é fila/
processamento assíncrono (cálculo de MRP pesado, integrações), resolvível com
jobs no próprio Postgres/Edge Functions.

## 2. Backend e banco de dados

**Fatos.** 462 migrations versionadas e replayáveis do zero (provado dezenas
de vezes no ambiente embarcado e na instalação do usuário: 459/459 e depois
462/462). Padrões sólidos: ledger único de estoque (sem segundo livro),
idempotência nas RPCs críticas, lock otimista/transacional nas conclusões,
auditoria de eventos setoriais, histórico de nicho. O PCP têxtil tem
integridade real: OP com versão, reserva por lote/filial, janela de máquina
sem dupla alocação, genealogia origem↔destino.

**Riscos e dívida.** (a) **92 arquivos de migration contêm policies
permissivas legadas** (`USING (true)` e afins) — nem todas ativas em tabelas
sensíveis, mas o ensaio RLS A/B completo **ainda não rodou**: é o maior risco
técnico do projeto (Fase 1c do plano de produção); (b) ausência de migrations
de *down* automatizadas (rollback = restore/migration corretiva); (c) busca e
relatórios pesados dividem o mesmo Postgres transacional — ok até dezenas de
tenants, exige réplica/índices quando escalar; (d) funções de IA em Edge
devolvem 503 sem chave de provedor — degradação aceitável, mas precisa virar
"recurso desligado" visível, não erro.

**Opinião técnica.** O banco é o ativo mais maduro do projeto. Endurecer RLS e
adicionar suíte de regressão de policies (já há sementes de runner RLS nos
scripts) vale mais que qualquer funcionalidade nova neste trimestre.

## 3. Frontend e experiência do usuário

**Fatos.** 147 páginas, 189 componentes, design system consistente
(Radix/shadcn, ícones Lucide), navegação por módulos com guarda por nicho e
por permissão, centrais setoriais próprias (fiação/malharia/tecelagem/
tinturaria) com indicadores de fórmula explícita e estado "sem dados" honesto.
Acessibilidade básica herdada do Radix; formulários com validação (zod/Hook
Form).

**Riscos.** (a) Chão de fábrica: terminal de apontamento existe, mas uso com
luvas/leitor de código de barras/tablet barato **não foi homologado em campo**;
(b) performance em listas grandes (virtualização existe via TanStack Virtual,
mas nem toda grade a usa); (c) modo offline/fila de apontamento inexistente —
fábrica sem rede para; (d) PWA não evidenciado.

**Opinião técnica.** UX acima da média dos ERPs verticais brasileiros (o
ponto fraco clássico dos incumbentes). Investir em: terminal de produção
robusto (teclas grandes, scanner, offline com sincronização) — é onde o
usuário final julga o sistema.

## 4. Qualidade e testes

**Fatos (executados neste programa).** Harness Postgres embarcado com replay
das 462 migrations e **41/41 asserções** (fluxos comercial, integrado,
multiempresa/nicho e negativos); **76 testes unitários** (`src/config`,
`src/lib/pcp`) verdes; typecheck dedicado do recorte têxtil limpo; jornada do
gerente pluma→expedição **104/104** via script; E2E Playwright de tecelagem
**11/11**; 64 roteiros de inspeção em `scripts/`; apenas **1 TODO** em todo o
`src` e 14 `console.log`.

**Gaps.** (a) Cobertura percentual não medida (há testes, falta meta e
relatório); (b) **CI não evidenciado** — testes rodam manualmente/localmente;
o risco é regressão entrar pelo Lovable sem portão automático; (c) E2E cobre
tecelagem, não os demais setores nem fluxos financeiros/fiscais; (d) testes de
carga e de concorrência (dois operadores, mesma máquina/lote) não executados.

**Opinião técnica.** Para o estágio, a disciplina de testes é incomumente boa
(a regra "não declarar pronto sem prova" está institucionalizada). Formalizar
CI no GitHub (vitest + typecheck + replay de migrations a cada PR) é barato e
transforma esse patrimônio em garantia permanente — inclusive protegendo a
convivência Lovable ↔ local recém-estabelecida.

## 5. DevOps e infraestrutura

**Fatos.** Dois ambientes funcionais com o **mesmo artefato**: nuvem via
Lovable (GitHub `main`, sincronização provada hoje com merge sem conflitos) e
instalação local Docker completa (auth, PostgREST, Realtime, Storage,
functions, web) com roteiros de instalar/parar/reparar/diagnosticar/backup —
pensada como "nuvem local" multiempresa. Configuração por runtime
(`/config.js`) permite o mesmo build em localhost e IP de rede.

**Gaps.** (a) Sem pipeline CI/CD formal (build, testes, deploy por ambiente);
(b) backup/restore existe como roteiro local, **restore nunca ensaiado com
métrica (RTO/RPO)** em ambiente de nuvem; (c) observabilidade: o produto tem
páginas de SLO/SRE internas, mas a **operação da plataforma** (logs
centralizados, alertas de Edge Functions, métricas do Postgres) não está
instrumentada como serviço; (d) gestão de segredos depende de disciplina
manual (o episódio do token colado no chat é sintoma de processo, não de
código).

**Opinião técnica.** A estratégia dual é um diferencial raro (cliente pode
começar local e migrar para nuvem sem troca de sistema). Formalizar:
ambientes dev/homolog/prod, CI com portões, backup com restore ensaiado
trimestral e cofre de segredos. Sem isso, cada cliente novo aumenta o custo
operacional linearmente.

## 6. Segurança e LGPD

**Fatos.** Autenticação Supabase (JWT), RLS por empresa nas tabelas novas,
triggers que impedem troca indevida de `company_id`, papéis
admin/usuário, funções `lgpd-export`/`lgpd-delete` presentes, histórico
auditável de nicho e eventos.

**Riscos (o mais sério do relatório).** **Policies permissivas legadas em 92
arquivos de migration.** Enquanto o ensaio A/B completo não rodar e as
policies não forem apertadas tabela a tabela, **não se pode afirmar
isolamento total entre empresas** — e isolamento é a promessa central de um
SaaS multiempresa. Somam-se: permissão por gerente de setor ainda não
implementada (hoje a granularidade é módulo, não setor), ausência de pentest,
e trilha de auditoria desigual entre módulos antigos e novos.

**Opinião técnica.** Nenhum cliente pagante novo deveria entrar antes da
Fase 1c (RLS A/B + permissão setorial). É um lote de semanas, não de meses, e
destrava juridicamente o produto (LGPD exige evidência, não intenção).

## 7. Dados, BI e inteligência artificial

**Fatos.** Dashboards executivos e indicadores setoriais calculados de
consultas reais, com fórmulas exibidas e "sem dados" explícito — o projeto
proíbe números sintéticos, o que é comercialmente defensável ("dado de
verdade ou nada"). Há 62 Edge Functions, incluindo família de IA
(ai-executive, ai-production, forecast etc.), que dependem de chave de
provedor externo.

**Gaps.** Sem camada analítica separada (relatórios pesados competem com o
transacional); IA é acessória e não diferenciadora hoje; qualidade do dado
depende de importadores que ainda não existem (cadastros nascem vazios).

**Opinião técnica.** BI honesto + importadores (clientes, produtos, saldos)
valem mais que IA nesta fase. IA entra depois, sobre dado real acumulado
(previsão de demanda por artigo/cor é o caso de uso têxtil óbvio).

## 8. Fiscal e compliance (Brasil)

**Fatos.** Módulo fiscal com telas, Edge Functions `nfe-emit`,
`nfe-cert-upload`, `fiscal-transmitter`, contabilidade em `src/modules/
accounting`. **Não há homologação fiscal comprovada** (emissão real de NF-e
em ambiente de homologação da SEFAZ não foi evidenciada; no ambiente local a
função responde 503 sem provedor/certificado).

**Opinião técnica.** Este é **o** bloqueador comercial brasileiro: indústria
não opera sem NF-e/NFC-e/SPED confiáveis. A decisão do plano (provedor fiscal
especializado via API, não transmissor próprio) está correta — integrar
Focus/NFe.io/PlugNotas ou equivalente, com certificado A1 do cliente, é um
lote de semanas e remove o maior risco regulatório do projeto. Até lá, venda
limitada a piloto com faturamento pelo sistema atual do cliente.

## 9. Produto e roadmap

**Fatos.** Escopo atual cobre ERP completo (comercial, compras, estoque/WMS,
financeiro, fiscal, contábil, crédito, CRM/relacionamento, NPS, TMS, RFID,
marketplace/plugins, observabilidade) + vertical têxtil profundo + plataforma
multinicho (pacotes por segmento: têxtil, confecção, alimentos, ração,
químico, distribuição, geral) que já liga/desliga módulos por empresa.

**Riscos.** (a) Escopo largo demais para o time atual sustentar com qualidade
uniforme — vários verticais são cascas de apresentação; a profundidade
provada é têxtil; (b) custos por lote/OP ainda não formalizados (Fase 2 do
plano) — sem custo, o ERP não fecha o ciclo gerencial; (c) rolo/peça
(rastreabilidade física fina) ausente limita tinturaria/acabamento premium.

**Opinião técnica.** A estratégia "um núcleo, pacotes por nicho" está certa e
agora tem lastro no backend. Disciplina recomendada: **têxtil é o produto**;
demais nichos só avançam com cliente pagante puxando.

### Matriz de riscos técnicos priorizada

| # | Risco | Impacto | Prob. | Mitigação (lote) |
|---|---|---|---|---|
| R1 | Policies RLS permissivas legadas | Vazamento entre empresas | Média | Fase 1c: ensaio A/B + aperto por tabela |
| R2 | Fiscal não homologado | Invendável p/ indústria formal | Alta | Provedor fiscal via API + homologação SEFAZ |
| R3 | Sem CI formal | Regressão via Lovable/local | Média | GitHub Actions: test+typecheck+replay |
| R4 | Custos não calculados | Decisão gerencial sem margem | Alta | Custos v1 por lote/OP (Fase 2) |
| R5 | Backup sem restore ensaiado | Perda de dados/confiança | Baixa | Ensaio trimestral com RTO/RPO |
| R6 | Chão de fábrica não homologado | Rejeição do usuário final | Média | Piloto assistido + terminal robusto/offline |
| R7 | Types dessincronizados | Erros silenciosos de contrato | Baixa | Regenerar types no CI e travar PR |
| R8 | Dependência de provedor de IA | Funções 503 | Baixa | Feature flags por recurso de IA |

---

# PARTE II — ANÁLISE DE MERCADO E VIABILIDADE COMERCIAL

## 1. O mercado têxtil brasileiro (demanda)

A cadeia têxtil e de confecção faturou **R$ 221 bilhões em 2024**, reúne
**25,7 mil unidades produtivas formais** e emprega **1,34 milhão de
trabalhadores formais** [1](https://www.abit.org.br/cont/perfil-do-setor); a
estimativa para 2025 é de ~R$ 230 bilhões [14](https://valor.globo.com/empresas/noticia/2026/01/21/pressionado-por-importaes-setor-txtil-com-cautela-e-projeta-crescimento-menor.ghtml).
O Brasil tem cadeia completa (fiação→confecção), é top-5 mundial em denim e
malharia, e investiu R$ 4,76 bilhões em 2024 [1](https://www.abit.org.br/cont/perfil-do-setor) — setor grande, pulverizado e
pressionado por importações asiáticas, ou seja: **margem apertada = apetite
por eficiência e controle de custo**, exatamente a proposta de um ERP com PCP
e rastreabilidade de verdade. Ao mesmo tempo, 2026 começa sob cautela
[14](https://valor.globo.com/empresas/noticia/2026/01/21/pressionado-por-importaes-setor-txtil-com-cautela-e-projeta-crescimento-menor.ghtml) — vendas precisam provar ROI rápido.

## 2. O mercado de ERP/SaaS (oferta e momento)

O mercado brasileiro de ERP movimentou **R$ 12,4 bilhões em 2024 (+14%)**, com
**56% dos novos contratos industriais já em SaaS** (contra 28% em 2021)
[2](https://www.forneceb2b.com.br/b2binsider/artigo/erps-industriais-comparativo-tendencias-2025-2026). O SaaS brasileiro vale **US$ 7,9 bilhões (2025)** e deve crescer a
**13,87% ao ano até 2034** [1](https://www.imarcgroup.com/brazil-saas-market). Cerca de **um terço das empresas
pretende trocar de ERP até 2026** [8](https://valor.globo.com/patrocinado/dino/noticia/2025/10/23/mercado-de-erp-cresce-com-demanda-por-eficiencia-1.ghtml) — janela de substituição aberta.
Faixas de preço praticadas: PME em nuvem **R$ 300–3.000/mês**; médias empresas
**R$ 2.000–15.000/mês** [11](https://gestaopro.com.br/blog/gestao/quanto-custa-implementar-sistemas-integrados-de-gestao-erp-guia-completo-de-precos-modelos-e-roi);
implantações SMB tradicionais custam **R$ 50–500 mil** e levam 2–6 meses
[2](https://www.forneceb2b.com.br/b2binsider/artigo/erps-industriais-comparativo-tendencias-2025-2026) — o calcanhar de Aquiles dos incumbentes.

## 3. Concorrência direta (têxtil)

| Concorrente | Perfil | Força | Fraqueza explorável |
|---|---|---|---|
| **Sisplan** (Indaial/SC, 1996) | Líder vertical; 2–3 mil empresas têxteis [8](https://www.apexcon.com.br/sistema-para-confeccao) [17](https://sisplansistemas.com.br/servicos/) | Capilaridade, cadeia completa, marca | Produto legado, implantação consultiva cara, UX datada |
| **Systêxtil** (30 anos) | Enterprise têxtil; grandes contas (Guararapes, Lunelli) [21](https://portalerp.com/caracteristicas-que-fazem-do-systextil-o-erp-ideal-para-a-industria-da-moda) | Contas grandes, nuvem Oracle | Preço/porte acima da PME industrial |
| **LermenSys, Apexcon, Gestum** | Regionais de nicho | Proximidade, preço | Escala e evolução de produto limitadas |
| **Senior/TOTVS (genéricos)** | ERP amplo com discurso têxtil [5](https://www.senior.com.br/blog/erp-para-a-industria-textil-beneficios-e-solucoes) | Marca, rede de canais | Vertical raso: PCP têxtil real exige customização cara |
| **Bling/Omie/Odoo** | PME genérico | Preço, autosserviço | Sem fiação/tinturaria/lote têxtil de verdade |

**Leitura:** o topo (grandes) está ocupado; a **PME industrial têxtil
(20–300 funcionários) é atendida por produtos antigos ou genéricos rasos**.
É aí que um produto moderno, com implantação em semanas e preço de SaaS,
entra. A ameaça real não é tecnologia: é a **rede de implantação e confiança**
que Sisplan/Systêxtil acumularam em 25–30 anos.

## 4. TAM / SAM / SOM (estimativas próprias, premissas explícitas)

- **TAM (vertical têxtil BR):** das 25,7 mil unidades, estimamos ~30% com
  produção estruturada (porte e processo p/ ERP industrial) ≈ **7.700
  empresas** × R$ 2.000/mês médios × 12 ≈ **R$ 185 mi/ano** em assinaturas.
- **SAM (foco inicial):** PMEs industriais com fiação/tecelagem/malharia/
  tinturaria própria nos polos (SC, SP, CE, PE, MG, PR) ≈ **3.500 empresas**
  ≈ **R$ 84 mi/ano**.
- **SOM (3 anos, executável):** **120–200 clientes** a ticket médio de
  R$ 2.200/mês ≈ **R$ 3,2–5,3 mi de ARR**, mais implantação/serviços
  (tipicamente +40–70% da receita no 1º ano de cada cliente).

Fora do têxtil, os pacotes (confecção, alimentos, ração, químicos,
distribuição) são **opção de expansão**, não base do plano — o mesmo motor de
nichos reduz o custo marginal de cada vertical futura.

## 5. Posicionamento e diferenciais defensáveis

1. **PCP têxtil real por setor** (fiação, malharia, tecelagem, tinturaria com
   perfil, eventos e indicadores próprios; genealogia pluma→expedição) —
   provado em teste, não em slide.
2. **O sistema se molda ao cliente**: CNPJ + nicho → só as telas/módulos do
   ramo (Fase 1 entregue), reduzindo curva de aprendizado e preço percebido.
3. **Implantação leve**: nuvem ou local (mesmo sistema), pilotos em semanas,
   contra 2–6 meses e R$ 50–500 mil do modelo tradicional
   [2](https://www.forneceb2b.com.br/b2binsider/artigo/erps-industriais-comparativo-tendencias-2025-2026).
4. **Dado honesto**: indicadores com fórmula e "sem dados" — discurso raro e
   forte num mercado acostumado a dashboard de enfeite.
5. **Multiempresa de verdade** desde o desenho (grupos com várias plantas/
   CNPJs), quando o isolamento RLS for fechado (R1).

Não-diferenciais (não vender como tal): IA atual, amplitude de módulos
genéricos, marketplace de plugins — paridade futura, não vantagem.

## 6. Modelo de negócio e precificação sugerida

- **SaaS por empresa (CNPJ) + usuários**, por pacote de nicho (a arquitetura
  já suporta: planos por empresa e módulos por nicho):
  - *Essencial* (confecção/distribuição pequena): **R$ 690/mês**;
  - *Industrial* (1 planta têxtil, PCP completo): **R$ 1.490/mês**;
  - *Integrada* (multiplanta/multiempresa, WMS/RFID/TMS): **R$ 2.900/mês+**.
  Faixas coerentes com o mercado PME/mid (R$ 300–15.000 conforme porte)
  [11](https://gestaopro.com.br/blog/gestao/quanto-custa-implementar-sistemas-integrados-de-gestao-erp-guia-completo-de-precos-modelos-e-roi) e abaixo do custo total dos incumbentes com implantação.
  - **Implantação assistida** (fixa, por planta): R$ 8–25 mil conforme escopo
    — bem abaixo dos R$ 50 mil+ tradicionais, viável pelos importadores e
    pelos pacotes prontos por nicho.
  - **Serviços recorrentes**: suporte premium, treinamento, customização por
    relatório — margem e proximidade (o que os incumbentes vendem bem).
- **Piloto pago** (30–60 dias, 1 setor) como porta de entrada: reduz o risco
  percebido e gera o caso de sucesso que vende o próximo.

## 7. Go-to-market (12 meses)

1. **Piloto-âncora (BIL)** com dados reais e métrica antes/depois (giro de
   lote, quebra de estoque, tempo de expedição) → vira estudo de caso.
2. **Polos têxteis**: Vale do Itajaí (Blumenau/Indaial — onde também estão
   concorrentes e mão de obra do setor), Americana/SP, Fortaleza/CE,
   Agreste/PE. Parcerias: sindicatos patronais, ABIT regional, Febratex e
   feiras regionais.
3. **Canal**: consultores de PCP/implantadores locais como parceiros
   certificados (eles têm a confiança que nos falta; nós, o produto).
4. **Conteúdo técnico**: os documentos-skill de PCP viram material público
   (blog/vídeo) — autoridade de nicho barata e defensável.
5. **Troca de legado**: oferta "migração assistida" mirando bases Sisplan/
   planilhas, na janela de 33% de empresas trocando de ERP
   [8](https://valor.globo.com/patrocinado/dino/noticia/2025/10/23/mercado-de-erp-cresce-com-demanda-por-eficiencia-1.ghtml).

## 8. Riscos comerciais

| # | Risco | Mitigação |
|---|---|---|
| C1 | Fiscal não homologado trava a venda | Lote fiscal via provedor é pré-condição de lançamento (R2) |
| C2 | Confiança: "quem mantém isso?" | Pilotos com métrica, contrato com SLA, backup/restore provado, código em GitHub com histórico auditável |
| C3 | Incumbente responde com desconto | Não brigar por preço no enterprise; vencer em implantação/UX na PME |
| C4 | Suporte vira gargalo (time enxuto) | Pacotes por nicho reduzem variância; base de conhecimento; parceiros |
| C5 | Churn pós-implantação malfeita | Piloto pago com portão de aceite por setor; sucesso do cliente desde o dia 1 |
| C6 | Setor em cautela (importações/juros) | Vender economia mensurável (perda, retrabalho, estoque parado), ticket de entrada baixo |

## 9. Cenários financeiros ilustrativos (3 anos, só assinatura)

| Cenário | Clientes (ano 3) | Ticket médio | ARR ano 3 | Leitura |
|---|---|---|---|---|
| Conservador | 60 | R$ 1.600 | R$ 1,15 mi | Pilotos lentos; operação enxuta empata |
| **Base** | **140** | **R$ 2.200** | **R$ 3,7 mi** | 3–4 implantações/mês no ano 2–3 via parceiros |
| Otimista | 260 | R$ 2.600 | R$ 8,1 mi | + 1 vertical adjacente (confecção) tracionando |

Premissas: churn 2%/mês inicial caindo p/ 1%; implantação e serviços somam
40–70% sobre a assinatura no ano de entrada de cada cliente. São **modelos de
decisão, não promessas** — a variável que mais move o resultado é velocidade
de implantação com qualidade, não preço.

---

## Veredito final e condições de sucesso

**Tecnicamente pronto para piloto real; comercialmente viável sob condições.**
O projeto já gastou o dinheiro difícil (núcleo transacional, PCP têxtil real,
rastreabilidade, multinicho) e tem provas executáveis disso. Falta o dinheiro
de "última milha" que decide venda no Brasil:

1. **RLS A/B fechado + permissão por gerente de setor** (segurança vendável);
2. **Fiscal homologado via provedor** (vendabilidade legal);
3. **Custos v1 por lote/OP** (valor gerencial que retém);
4. **Importadores + piloto BIL com métricas** (prova comercial);
5. **CI + restore ensaiado** (operação que escala sem susto).

Com 1–2, pode vender piloto pago. Com 1–4, pode lançar comercialmente no
recorte PME têxtil. Com 5, pode escalar por parceiros. Sem 2, qualquer real
investido em marketing queima reputação. A sequência do
`PLANO-ENTRADA-PRODUCAO.md` já ordena exatamente esses lotes — este relatório
a valida e adiciona o enquadramento de mercado: **o produto certo é "ERP
têxtil moderno para PME industrial"; o resto é expansão, não foco.**

---

### Fontes de mercado
ABIT/IEMI (perfil do setor), Valor Econômico (fechamento 2025), ABES/IDC
(mercado de ERP e software BR), IMARC (SaaS Brasil), ForneceB2B (comparativo
de ERPs industriais), páginas públicas de Sisplan/Systêxtil/LermenSys/Senior.
Citações inline no texto.
