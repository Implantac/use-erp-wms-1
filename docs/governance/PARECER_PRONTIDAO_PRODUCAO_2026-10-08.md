# Parecer de prontidão para uso real — 08/10/2026

**Veredito: NÃO APROVADO para operação integral em produção.** O repositório contém módulos utilizáveis e mecanismos de bloqueio para funções não homologadas, mas não há evidência suficiente para declarar o ERP/WMS pronto para dados, tributos, cobrança e obrigações reais de todos os clientes. Este é um parecer técnico baseado no código, nos comandos executados e nos documentos do projeto, **não** uma auditoria exaustiva de cada linha, nem parecer fiscal/jurídico, nem certificação de segurança.

## Escopo e evidência desta revisão

- Revisado o `main` publicado no GitHub até `b123228` (consulta remota); no workspace havia três alterações pré-existentes em `scripts/` que **não** integram o commit publicado.
- Repositório com 438 arquivos de migrations e 62 diretórios de Edge Functions: amostrados controles de fiscal, WMS, financeiro, testes, build e governança. Não foi feita inspeção completa de todas as 438 migrations e 62 funções.
- Instalação via `bun install --frozen-lockfile` aprovada. `npm run typecheck` aprovado. `vitest run --maxWorkers=2`: **165 testes/32 arquivos aprovados**.
- `npm run lint:ci`: **falhou**, 27 avisos reportáveis (0 erros); o script exclui **1.072 ocorrências** de `@typescript-eslint/no-explicit-any` do gate.
- `npm run build`: **falhou no ambiente de revisão**, erro `Reached heap limit`, saída 134, durante transformação. Não há artefato de produção validado nesta revisão. Falha de heap não prova, isoladamente, defeito de código; exige runner com memória adequada e repetição do build.
- Não houve acesso validado a banco Supabase **de homologação**, provedor financeiro, certificado fiscal, autorizador ou deploy remoto. A existência de `.env` local não prova ambiente de homologação e não foi usada para consultar produção. Publicar migration no GitHub não significa aplicá-la.

## Bloqueadores (P0)

| Área | Evidência | Consequência / aceite |
|---|---|---|
| Fiscal / documentos | `supabase/functions/nfe-emit/index.ts` devolve `fiscal_emission_not_homologated`; tabelas cCredPres e cobertura por cliente não têm importação/aprovação operacional; `docs/fiscal/ONBOARDING_CLIENTE_FISCAL.md` registra lacunas. | **Não liberar emissão nem cálculo fiscal real**; homologar leiautes/XSD, tabelas, regimes, cálculos, assinatura, eventos, autorização e escrituração por modelo. |
| Banco e multitenancy | Migrações recentes de escopo de alertas, motor fiscal e RPC WMS não foram aplicadas/testadas em banco nesta revisão. `src/lib/testing/security/rls.test.ts` apenas consulta até uma linha e só afirma algo se não houver erro e houver dados; portanto **passa inclusive quando a consulta falha ou vem vazia**. | Criar Supabase isolado, aplicar migrations, rodar fixtures A/B e asserções que falhem ao erro, a vazios indevidos e a acesso cruzado. Testar rollback da RPC WMS. |
| Golden paths | `tests/e2e/sales-golden-path.spec.ts`, `purchase-golden-path.spec.ts` e `production-golden-path.spec.ts` usam `test.fixme`; são descrições, não validações executadas. | Executar O2C, P2P e PCP com efeitos persistidos, estoque, financeiro e recuperação de falhas. |
| Pagamentos / checkout | Plano `docs/governance/PLANO_RECUPERACAO_2026-10-08.md` registra checkout e boleto bloqueados até provedor; PIX/TEF e webhooks ainda dependem de homologação. | Sem cobrança real/baixa automática verificada; manter bloqueios até provedor, webhook autenticado, idempotência e conciliação. |
| Entrega | Lint CI falha e build não conclui neste ambiente. | Build reproduzível em CI, artefato testado, lint zerado ou exceções justificadas por regra, pipeline/deploy/rollback demonstrados. |

## Riscos adicionais relevantes

- `supabase/functions/_shared/sefaz-transport.ts` mantém fallback que produz resposta XML **simulada** com `cStat=100` quando não existe proxy mTLS. A emissão NF-e está bloqueada, mas o transporte é compartilhado por outros caminhos (evento/status). Antes de reativar qualquer emissão/evento, remover resposta fiscal sintética do caminho operacional e impedir que qualquer simulação seja persistida como autorização.
- `src/services/operational/supply-chain/supplyChainService.ts` agora usa RPC para criar pedido com cabeçalho e itens numa transação; **a migração não foi executada**. Sem a RPC implantada, o caminho falha. Ainda não há chave idempotente para envio duplicado; a tela `UnifiedSupplyChain.tsx` contém estados que devem ser confrontados com o `CHECK` do banco.
- `docs/FEATURE_STATUS.md` marca RLS/RBAC, vendas, estoque, PCP e financeiro como **Pronto**. Esses rótulos são afirmações de produto, não evidência suficiente de teste multi-tenant/E2E nesta revisão. Reclassificar com critérios e links para testes reais antes de usar como declaração comercial.
- A suíte unitária é útil, mas não cobre autorização tributária, assinaturas, gateway bancário, RLS com duas sessões ou desempenho/recuperação de desastres. Não foi feita avaliação de pentest, carga, backup/restore, LGPD operacional ou observabilidade em produção.

## Recomendação de liberação

**Agora:** somente demonstração/ambiente controlado e módulos específicos após verificação individual; manter NF-e e cobrança não homologadas bloqueadas. **Não** comercializar a plataforma como pronta para todos os regimes, documentos e fluxos.

**Para um piloto real restrito:** (1) escolher módulos e operações do cliente, (2) aplicar migrações em homologação e comprovar isolamento A/B e rollback, (3) obter build/CI verde, (4) executar golden paths com dados anonimizados e aprovação do responsável fiscal, (5) homologar provedores e autorizadores necessários, (6) revisar segurança, backup/restauração, auditoria e monitoramento, (7) liberação gradual por cliente com plano de rollback. Critérios não cumpridos continuam como bloqueadores, não como pendências cosméticas.

### Adendo — provisionamento de novos clientes

O inventário adicional encontrou um gatilho que inseria percentuais fiscais estimados em cada nova empresa, placeholders de endereço no onboarding, migração legada de empresa genérica e concessão condicional de acesso/assinatura de suporte, e um `setup --migrate` que repetia todos os SQLs. Há correções locais versionadas para bloquear o replay, exigir campos do cliente e remover o gatilho de novos cadastros. **Sem aplicar/testar a migration em banco, o provisionamento em ambiente implantado permanece não comprovado.** Contas/regras legadas existentes exigem auditoria específica, não exclusão cega.

### 08/10/2026 — Contenção de falsos sucessos (não constitui GO)
- Sem proxy mTLS, transporte SEFAZ falha sem protocolo; HTTP de erro do proxy é rejeitado. Não há homologação fiscal comprovada.
- Finalização de inventário foi bloqueada: prévia não persiste nem ajusta estoque. A funcionalidade precisa de backend transacional e testes antes da liberação.
- Controle visual de seed não anuncia execução inexistente; seed é procedimento manual exclusivo de testes.
- Torre de controle não mostra percentuais, terminais, alertas ou auditorias inventados; a única contagem exibida vem de consulta por empresa com erro explícito. A consulta de transferências permanece limitada a 1000 registros, portanto não representa cobertura completa.
- Compliance não emite score/certificação fictícios. Verificação RLS, Vault, LGPD e ledger exige auditoria independente.

### 08/10/2026 — Contenção adicional de dados fabricados (ainda NO-GO)
- Serviço legado de sourcing, manifestos e rastreamento sem integração agora falha explicitamente; não cria identificação ou eventos fictícios. Existe serviço de última milha distinto que requer revisão própria.
- Painel IoT mostra apenas máquinas cadastradas e indisponibilidade de sensores; não inventa leituras, conectividade, histórico ou alertas preditivos. Integração IoT real segue pendente.
- Gráfico de demanda não inventa série temporal a partir de uma previsão agregada. A origem e a calibração da previsão agregada ainda exigem validação.
- Mapa de lojas exibe apenas contagens dos saldos retornados na consulta, com aviso de limite de 2.000 registros e sem métricas falsas de saúde, giro ou acuracidade. Não é indicador completo da rede.
- Painel OEE agora consulta apenas registros persistidos filtrados pela empresa ativa e mostra erro de consulta, em vez de inventar tendência e seis perdas. Os valores são exibidos sem assumir unidade ou metodologia ainda não homologadas; cobertura limitada a 100 registros.
- Removidos dois testes RLS que passavam com consultas vazias/erro. Novo ensaio A/B em `npm run test:rls:live` requer fixtures próprias visíveis e consultas cruzadas invisíveis para estoque e NF-e, sem filtro de empresa. Sem banco/contas/fixtures de teste o resultado é **NÃO EXECUTADO**, não aprovação.
- Dockerfile passou a instalar dependências com Bun 1.4.2 e `bun.lock` imutável, alinhado ao uso de Bun no CI (antes usava `npm install` sem package-lock). O CI ainda seleciona `latest` e sua fixação de versão depende de permissão de workflow no GitHub. `bun install --frozen-lockfile` foi validado localmente. **Build da imagem Docker não executado** neste ambiente sem Docker; `lint:ci` ainda falha por 27 warnings e o build com memória adequada ainda precisa ser comprovado.

### 08/10/2026 — Permissões da interface sem concessão universal

O carregamento de sessão e o mapeamento de usuário atribuíam `permissions: ['all']` a qualquer perfil, inclusive viewer. Agora não criam permissões universais; guards que dependem de permissão explícita falham fechados até existir concessão escopada e verificada. `OperationalScopeGuard` não renderiza rota contextual protegida enquanto a identidade/contexto estão pendentes. Hooks de contexto foram ajustados para evitar referências obsoletas no carregamento e no memo de políticas. Testes cobrem ausência de permissão universal em viewer e exigência de permissão explícita. **Isso só protege a interface:** RLS/RPC/Edge ainda requerem testes e autorização server-side em banco A/B; permissões granulares por cliente não foram implementadas.

### 08/10/2026 — Demanda preditiva sem confiança fabricada

`PredictiveIntelligenceService` devolvia confiança 0,85 fixa, demanda baseada em poucas linhas com média/dias hipotéticos e posições DOCK/PICKING fictícias; a tela 360° usava o resultado para sugerir compra, cobertura e EOQ. O serviço agora falha sem modelo validado, o hook descarta previsão anterior ao mudar SKU e mostra indisponibilidade sem valores de reposição. Teste cobre ambos os métodos. **Previsão real, indicadores de acurácia, histórico completo e otimização de posições continuam não implementados/homologados.**

### 08/10/2026 — Indicadores WMS e efeitos React

`WMSAnalytics` agora exige empresa ativa, aplica `company_id` às seis consultas, rejeita erros em qualquer fonte, descarta respostas antigas após troca de empresa/período e não transforma ausência de medições em SLA/acuracidade de 100%. Consultas que atinjam o teto usual de 1.000 linhas falham fechadas em vez de apresentar um total parcial; **a agregação paginada no servidor e a prova RLS em banco ainda faltam**. O nome de indicador foi ajustado para refletir inspeções sem rejeição, não acuracidade de estoque. Hook de reposição deixou de registrar listener de teclado durante render e de resselecionar itens após desmarcação manual; outras dependências de hooks foram reconciliadas sem ignorar regras. Typecheck e 175 testes Vitest passaram; `lint:ci` ainda não está verde até resolver os exports mistos.

### 08/10/2026 — Gate de lint local

A separação de hooks/constantes de arquivos com componentes React (sem silenciar `react-refresh`) eliminou os 13 avisos restantes. `npm run lint:ci`: **exit 0, 0 errors/0 warnings reportáveis**; typecheck e **175 testes unitários** passaram na verificação local. O gate ainda exclui **1.024** achados de `no-explicit-any`: lint verde não prova tipagem completa. Não houve confirmação do workflow remoto, build, E2E ou Supabase. Docs de recuperação mantêm status NO-GO.

### 08/10/2026 — Tentativa de build após lint verde

Primeira tentativa `NODE_OPTIONS=--max-old-space-size=1536 npx bun run build` detectou import obsoleto `EMPTY_FORM` em `SalesFunnel.tsx`, resultante da separação de arquivos do gate lint; corrigido no código e reexecutado. Segunda tentativa transformou **4.890 módulos** e chegou a `computing gzip size`, mas o processo foi encerrado com **SIGKILL / exit 137** no sandbox com aproximadamente 2 GiB de RAM; **não existe artefato validado localmente**. Isso não prova falha em runner de CI maior, mas impede declarar build aprovado. Typecheck, lint local (0 avisos reportáveis) e 175 testes passaram após a correção. Confirmar build e Docker em runner com memória, artefato e smoke test antes do GO.
