# Incremento após `023edbd2` — qualidade de amostras de datas no BI

O BI industrial passa a formar os indicadores de prazo somente com OPs concluídas com término e prazo válidos e término não futuro; início informado mas inválido ou posterior ao término exclui a OP da amostra de pontualidade. Duração média usa diferença entre timestamps (fração de dia), não arredondamento de cada OP para dias inteiros. Atrasadas exige OP ativa (`planned`, `in_progress` ou `paused`) e prazo válido vencido; rascunhos não entram. Sem amostra, o valor permanece não apurado. A duração decorrido início→término não é tempo produtivo nem OEE.

Testes unitários 3/3, typecheck e lint CI aprovados. Não houve teste de banco, simulação de fuso horário de tenant, confirmação de política de prazos por nicho ou migration. A lógica usa os instantes salvos na OP, sem alterar o cadastro de prazos. O lote é local e ainda não foi publicado.

## Incremento — prévia do Modo Guerra sem gravações

Antes, `war_mode` com `confirm: false` persistia `priority_score` em todas as OPs, apesar de a interface anunciar uma simulação. Agora a prévia calcula score/alterações sem nenhuma gravação; retorna fingerprint SHA-256 do conjunto/versionamento de OPs e scores. A confirmação requer a fingerprint da prévia, rejeita plano diferente (409), qualifica cada escrita por empresa, ID e `updated_at` e não relata sucesso quando não há linha atualizada. Cada OP recebe score e prioridade em **uma** atualização. A UI mostra as mudanças calculadas no servidor (não outra lista local), exige fingerprint para habilitar confirmação e avisa de possível aplicação parcial em falhas. Sugestão local de movimentação a partir de `waiting_material` exige ao menos uma necessidade, todas com saldo bruto verificável e nenhum déficit; continua **sugestão, não reserva**.

**Bloqueios:** a confirmação e o recálculo ainda atualizam OPs uma a uma, sem transação/RPC atômica; uma falha tardia pode deixar parte das OPs alterada. A fingerprint/condição de versão reduz conflitos, mas não substitui autorização auditada nem homologação isolada da edge function. Não usar fluxo como garantia de prontidão operacional. Testes Vitest 2/2, estático 1/1, typecheck e lint CI aprovados; sem banco ou migration.

## Incremento — sequência PCP sem aplicação fora da prévia

`pcp-schedule` aceita somente ações validadas e exige snapshot SHA-256 da lista/versão/escore das OPs antes de aplicar. Planos com mais de 100 OPs são rejeitados (409) **antes** da prévia e da aplicação: não mostramos 100 para alterar 500. A cada escrita usa empresa, ID e versão `updated_at`, exige linha afetada e interrompe no primeiro erro. A interface rejeita prévia incompleta, exige snapshot, avisa em falha sobre possível aplicação parcial e retira a alegação de «redução de setup» percentual sem medição; mostra apenas mudanças de grupo. Teste estático 1/1, Vitest 5/5, typecheck e lint CI aprovados. A aplicação ainda é **sequencial e não transacional**, portanto não pode garantir rollback. Precisa de operação atômica no banco e homologação multiusuário isolada antes de uso operacional.

## Incremento local — operação atômica preparada (NÃO aplicada)

A migration `20261015000100_atomic_pcp_preview_apply.sql` prepara `apply_pcp_preview`: RPC `SECURITY DEFINER` restrita a service role, escopo de empresa/filial, limite e unicidade de itens, status de OP ativo e conferência da versão `updated_at` por linha. Se qualquer linha mudar ou falhar, `RAISE EXCEPTION` reverte a chamada inteira. As duas edge functions agora usam essa RPC para recálculo, confirmação de prioridades e aplicação da sequência; não fazem mais loops de escrita no serviço. Ações de escrita exigem `requirePermission(ctx, 'production.orders', 'write')` além de acesso ao módulo; prévias continuam sem gravação. Ação ausente no endpoint de prioridade não dispara mais recálculo implícito.

**Não há validação no Postgres:** a migration foi somente criada, não aplicada. Até migrar e homologar em ambiente isolado, as ações de escrita falharão por função inexistente (fail-closed); não implantar a edge function isoladamente como fluxo operacional aprovado. Testes estáticos não provam rollback, autorização RLS nem compatibilidade com o schema/instância-alvo. Testar dois usuários/empresas/filiais, alteração concorrente entre prévia e confirmação, erro no último item com rollback total e migração/rollback antes de liberação.

## Incremento — Painel PCP sem peças/h de unidades misturadas

O Painel PCP somava pendências de OPs potencialmente em kg, metros e unidades como uma só «Qtde Pendente» por centro e somava quantidades de apontamentos de operadores diferentes para exibir «peças/h». Agora informa **contagem de OPs ativas por centro** e **contagem de apontamentos concluídos no dia por operador**, sem alegar produtividade. O avanço médio considera a razão dentro de cada OP ativa com quantidade planejada positiva e produzida válida; sem amostra exibe «—». Atrasos consideram somente OPs ativas com prazo legível e vencido. Testes unitários 3/3, typecheck e lint CI aprovados. O horário do dia segue o relógio local do navegador; não é turno fabril nem produtividade auditada. Sem teste de banco.

Auditoria do nicho: `OperationalScopeGuard` já combina `canPresentNicheRoute` com `getRouteContextCriteria` no `MainLayout` para acesso direto à rota `/producao`; menu e acesso direto têm contenção visual. Isso **não** constitui autorização server-side da API ou aprovação da matriz de recursos por nicho.

## Incremento — transições de OP e concorrência na interface

`useProductionOrders.update` agora aceita somente `status` e, quando ainda ausente, `start_date` válida ao iniciar/terceirizar. A transição precisa existir no mapa único compartilhado com o Kanban; `completed` permanece proibida. Update requer OP carregada na empresa ativa, qualifica `id`, `company_id`, `status` anterior e `updated_at` anterior, e só confirma sucesso se a linha foi afetada. PCP e Kanban não substituem a data original ao retomar OP. No painel, o botão «Finalizar» (que antes levava a erro) vira explicação de bloqueio; percentuais/prazos inválidos mostram «—». Testes de transição 2/2, estático 1/1, testes PCP pré-existentes 3/3, typecheck/lint CI aprovados.

**Limites:** bloqueio e comparação de versão no cliente não constituem autorização server-side. Resolução do timestamp `updated_at`, regras de transição no banco, qualidade/consumo e concorrência real continuam sem homologação em ambiente isolado. Não é liberação de conclusão operacional.

## Incremento — IA Executiva sem mutações de negócio por confirmação gerada pelo modelo

A ferramenta `executar_acao` aceitava `confirmado` da própria chamada de ferramenta da IA e, com cliente de service role, podia alterar pagamentos, contas, estoque, pedidos e estados/prioridades de OP. **Isto não é consentimento do usuário.** Ela foi substituída por `sugerir_acao`: proposta informativa, sem acesso de escrita a dados de negócio, que direciona para o módulo responsável. Nenhum texto de confirmação da IA executa operações. A consulta histórica antes sem `company_id` passou a exigir empresa e a filtrar pedidos por ela. Consultas da IA deixam de anunciar eficiência global de OPs em unidades não comparáveis e valor de estoque baseado em preço de catálogo.

Teste estático 3/3, parsing TS via esbuild, typecheck e lint CI passaram. **Não foi homologado o endpoint Deno nem o isolamento de todos os outros executores da IA.** Escrita assistida só poderá ser reintroduzida mediante contrato de intenção assinado/validado pelo servidor, autorização por recurso/ação, idempotência e transação dos módulos, auditados em homologação isolada.
