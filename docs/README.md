# Documentação Técnica — READ & GROW

Este diretório centraliza a inteligência técnica, arquitetural e operacional da plataforma.

## 📌 Planejamento ativo — Lojas e PCP Têxtil

Para o estado atual, prioridades, dependências e critérios de aceite deste escopo, use estes dois documentos (revisão de 05/11/2026, baseline `8a5dbb35`):

- [Plano-mestre — Controle de Lojas e PCP Têxtil](PLANO-MESTRE-LOJAS-PCP-TEXTIL.md) — documento canônico do escopo.
- [Índice de planos — Lojas e PCP Têxtil](INDICE-PLANOS-LOJAS-PCP-TEXTIL.md) — classificação de 101 documentos e crosswalk das pendências antigas, sem apagar o histórico.
- [Desenho do ciclo intercompany por produção](DESENHO-CICLO-INTERCOMPANY-PRODUCAO.md) — contrato proposto para LOJ-05/06; **não implementado**, sem migrations aplicadas.

Operação e evidência (registrado em 06/11/2026, sem alterar a baseline acima):

- [Variáveis de ambiente e publicação](ENVIRONMENT.md) — provisionamento por ambiente (SEC-02) e correção do incidente `supabaseKey is required.` no Lovable (§0.1).
- [E2E — Lojas e smoke de navegador](E2E-Lojas.md) — ambiente isolado QA-01, evidência de CI e limites das jornadas (§0).
- [Segredos do E2E autenticado e rotação](E2E-SEGREDOS-E-ROTACAO.md) — acompanhado de `scripts/validate-homologacao-env.mjs` (pré-voo local dos 18 nomes, sem imprimir valores). — correção da contagem para **18** segredos, inventário por spec, o que já tem cobertura isolada e o plano de rotação de PATs/chaves que depende do responsável.

- [ADR — achado de RLS em `production_rework_orders`](ADR-QA05-GRANT-REWORK.md) — 4 opções, o falso verde do `GRANT UPDATE` isolado e a decisão de **não aplicar** sem autorização explícita.
- [Homologação local](HOMOLOGACAO-LOCAL.md) §0 e [homologação como código](../infra/homologacao/README.md) — auditoria do `docker-compose.local.yml` existente, overlay de loopback, bootstrap **não executado** e contagem corrigida para **504 migrations** / **24 testes isolados**.

- [Auditoria anti-falso-verde do gate autenticado](E2E-GATE-ANTI-SKIP.md) — por que os 18 segredos, sozinhos, **não** bastariam: 2 testes podem passar sem validar nada e o reporter não congela a completude. Correções propostas, não aplicadas.

Planos `.lovable/plan`, revisões datadas, `FEATURE_STATUS.md` e `FLUXO-PCP-OPERACIONAL.md` permanecem como histórico/evidência da época. Em divergência, prevalecem o código atual e o plano-mestre. **Produção: NO-GO** — nenhum documento desta pasta autoriza publicar o app, aplicar migrations ou operar em produção.

## Estrutura de Documentos

### 🏗️ Arquitetura
- [Mapa Arquitetural](architecture/ARCHITECTURE.md) — Visão geral da stack e fluxo de dados.
- [Modelo Multi-tenant](security/TENANT_MATRIX.md) — Definição de isolamento e escopos.

### 🛡️ Segurança e Compliance
- [Auditoria LGPD](security/LGPD_AUDIT.md) — Conformidade com a Lei Geral de Proteção de Dados.
- [Matriz de Tenant](security/TENANT_MATRIX.md) — Como os dados são isolados.

### 📊 Banco de Dados
- [Auditoria de Índices](database/INDEX_AUDIT.md) — Otimização de busca e performance.
- [Esquemas](database/SCHEMAS.md) — Definição das tabelas principais.

### ⚡ Performance
- [Relatório de Performance](performance/PERFORMANCE.md) — Cache, limites e métricas.

### 🎨 Experiência do Usuário (UX)
- [Guia de Componentes](ux/COMPONENTS.md) — Padronização Visual (FASE 21).

### 🧪 Testes e Qualidade
- [Definition of Done](governance/DEFINITION_OF_DONE.md) — Critérios de aceite permanentes.
- [Estratégia de Testes](testing/STRATEGY.md) — Unitários, Integração e E2E.

### 🏭 Industrial Têxtil
- [Guia operacional industrial têxtil](INDUSTRIAL_TEXTILE_GUIDE.md) — Perfis, PCP/MRP, qualidade, indicadores e limites de homologação.
- [Auditoria industrial têxtil 19/10/2026](governance/INDUSTRIAL_TEXTILE_AUDIT_2026-10-19.md) — Matriz de rastreabilidade, lacunas e resultados de validação.

---
*Consulte docs/hardening/MASTER_PLAN.md para o histórico de evolução da plataforma.*
