# Terminal do operador — barreiras incrementais, 15/10/2026

Incremento local sobre `main` publicada `71a009c9`, **não publicado**. O envio de alertas usa somente a empresa ativa do contexto, sem recorrer ao `company_id` do perfil (que pode não representar a empresa selecionada). Ao iniciar, a seleção de máquina que deixou de estar disponível é rejeitada, em vez de se tornar silenciosamente um apontamento sem máquina. Ao iniciar com OP planejada, falha na escrita separada da mudança de estado é informada como estado parcial. Nome livre é bloqueado na tela enquanto houver apontamento em curso, com aviso claro de que **não representa identificação/autorização**.

Não foram alterados arquivos locais do Codespace do usuário (`supabase/functions/mcp/index.ts`, patches avulsos e `package-lock.json`). O clone usado aqui é independente. Não houve push nem migration.

## Limites críticos / próximo gate

- `time_entries` continua sem identificador de usuário validado, e os dados do cliente podem estar desatualizados. Bloqueio de campo e filtro no cliente não substituem autorização, RLS por empresa/unidade nem controle de concorrência no servidor.
- A transição do apontamento e a transição da OP são duas escritas, sem rollback atômico; eventos e estado de máquina dependem de triggers que precisam de auditoria de escopo/concorrência em homologação.
- Comparar migrations posteriores de RLS e triggers com o estado **efetivamente aplicado** antes de criar RPC de execução. Definir matriz aprovada de papéis, empresas, unidades, turnos, motivos de parada, unidades/transformações e genealogia de lotes. Sem valores padrão hipotéticos.
- Executar testes isolados de banco com duas empresas, dois operadores, uma máquina disputada, falhas intermediárias e repetição de requisições. Sem Supabase isolado, esses cenários permanecem não comprovados. Produção industrial **não liberada**.

Verificações locais: `node --test scripts/test-terminal-tenant-guards.mjs`; `npm run typecheck`; `npm run lint:ci`; `git diff --check`. Os testes são estáticos e não demonstram comportamento real do Supabase.
