# Pacote controlado GitHub → Lovable → Supabase (16/10/2026)

**Pedido:** preparar lote PCP/têxtil, atualizar GitHub e publicar via Lovable. **Situação:** GitHub `main` = `71a009c962d99780fc096e32d88bd738160a22d8` na última consulta; lote pós-publicação em `/home/user/erp-post-publish-batch.patch` (regenerado ao concluir este incremento). Conectores GitHub e Lovable não estão disponíveis nesta conversa; nenhum push/publicação é realizado por este arquivo. Não enviar credenciais pela conversa.

## Conteúdo do lote

Barreiras do terminal por empresa/máquina; rascunho SQL de posse exclusiva de máquina **fora das migrations**; relatório de maturidade; escopo de empresa e checagens no agendamento PCP; OP usando transições condicionadas; catálogo têxtil e pré-validação de lotes; leitura de logs por empresa e modelo de genealogia em memória. Este lote **não** implanta uma cadeia têxtil transacional e não contém migration nova ou alteração de Edge Function.

## Gate automatizado local

No clone limpo com o lote aplicado: `node scripts/preflight-lovable-pcp.mjs`. Verifica hash da main remota, ancestralidade/contagem do lote, ausência de alterações rastreadas e que nenhum arquivo de migrations/Edge Functions entrou nesse lote. Não substitui revisão de diffs, segredos, RLS ou homologação. Depois:

```bash
npm install --no-package-lock --ignore-scripts --no-audit --no-fund --legacy-peer-deps
npm run typecheck
npm run lint:ci
node --test scripts/test-terminal-tenant-guards.mjs scripts/test-machine-claim-migration.mjs scripts/test-production-schedule-tenant.mjs scripts/test-production-orders-safe-path.mjs scripts/test-textile-lineage-gate.mjs
npx vitest run src/lib/textile/processModel.test.ts src/lib/textile/lineage.test.ts src/modules/production/productionOrders/orderPresentation.test.ts
```

Estes comandos não ensaiam banco/Edge Functions. Antes do push, inspecionar os diffs e repetir o gate no **candidato exato**. Em Codespaces existem arquivos do usuário modificados/não rastreados: **não** executar `git add .`, `git reset --hard`, `git clean` ou `git stash -u` para preparar a release.

## Aplicação sem tocar no trabalho local do Codespaces

Após baixar o patch novo e enviá-lo para a raiz do repositório no Codespaces, manter a árvore atual intacta e criar worktree separado:

```bash
git fetch origin main
git rev-parse origin/main
# PARAR se não for 71a009c962d99780fc096e32d88bd738160a22d8
git worktree add --detach ../pcp-release origin/main
cp erp-post-publish-batch.patch ../pcp-release/
cd ../pcp-release
git -c user.name='Arena Agent' -c user.email='agent@arena.ai' am --3way erp-post-publish-batch.patch
node scripts/preflight-lovable-pcp.mjs
# executar também as verificações acima e inspecionar git log/diff
# Somente após aprovação explícita da release de CÓDIGO:
git push origin HEAD:main
```

Se `git am` falhar, usar `git am --abort` **neste worktree**, não na árvore original; enviar o erro para revisão. Se a main remota mudar, parar e reconstruir o lote. **Não usar `--force`.** A publicação do código na main ainda depende da ação do usuário no Codespaces. Nunca repetir o lote antigo de 11 commits que já foi publicado.

## Lovable e banco — separação obrigatória

1. Conferir no Lovable o commit sincronizado com GitHub e o preview das telas; publicar frontend somente com aviso de limitações. Verificar se o projeto sincroniza ou não Edge Functions/migrations automaticamente: não presumir deploy do backend.
2. A RPC `apply_pcp_preview` do PCP já está em migration da main publicada, mas aplicação/compatibilidade no Supabase real **não comprovadas**. Não usar ações de aplicação, geração de OP, consumo ou conclusão em produção como teste.
3. Os dois DRAFT SQL do lote **não entram em `supabase/migrations` e não devem ser colados no Supabase de produção**. A tela têxtil é mapa de parametrização; genealogia ainda é somente pré-validação.
4. Para aprovar operação real, criar Lovable de teste + Supabase isolado, dados aprovados, RLS A/B, idempotência/concorrência/rollback, piloto físico e aceite de DBA, engenharia de chão de fábrica e QA. Sem isso, estado **NÃO LIBERADO**. Código publicado ≠ PCP concluído.
