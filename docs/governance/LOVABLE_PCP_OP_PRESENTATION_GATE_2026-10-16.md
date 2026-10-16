# PCP / Lovable — tela de OP e publicação controlada (16/10/2026)

Contexto informado pelo cliente: Lovable sincroniza a branch GitHub e publica frontend com conexão ao **Supabase de produção**. A sincronização não comprova aplicação de migrations, implantação de Edge Functions, RLS, transações ou aceite operacional. Não usar a publicação como ensaio de escrita em banco real.

## Incremento local, não publicado

A tela `/producao/ordens` usava `useProduction`/`productionService.updateOrderStatus`: UPDATE por ID sem empresa, estado anterior, versão ou checagem de linha afetada; um retorno sem erro era anunciado como sucesso. Foi conectada ao hook `useProductionOrders.update`, já condicionado a empresa, transição permitida, estado anterior, `updated_at` e retorno. Removido o método genérico de escrita desse serviço/hook não usado por outras telas; não é uma permissão server-side. O KPI «Eficiência» era apenas OPs concluídas ÷ total; agora exibe contagem de OPs concluídas. Datas inválidas não quebram a tabela e não entram em atrasadas; progresso inválido na OP não é apresentado como percentual. Leitura sem empresa/falha não mostra zeros como dados reais. Quantidade exibida é da OP e **não conciliada** com apontamentos/estoque.

Verificado localmente: 2 testes Vitest de datas/progresso + 2 testes estáticos de integração/segurança, typecheck e lint CI (0 erros/avisos reportáveis). Não houve teste visual no Lovable, banco, migration nem push. A tela continua incapaz de concluir OP: requer transação com estoque/qualidade; pedido→OP permanece bloqueado. Não anunciar PCP operacionalmente pronto.

## Gate de publicação Lovable

1. Conferir `main` no GitHub e hash efetivamente sincronizado no Lovable; preservar alterações não commitadas do Codespaces. Revisar o patch pós-publicação antes do próximo push.
2. Distinguir frontend, Edge Functions e migrations. A RPC `apply_pcp_preview` preparada no repositório **não foi comprovadamente aplicada**. Não acionar aplicação PCP real no Supabase de produção.
3. Criar ambiente Lovable de teste ligado a Supabase **isolado**; parametrizar dados fictícios aprovados, sem exemplos tributários ou capacidade inventada.
4. Testar duas empresas, OPs concorrentes e versão de programação; janela, roteiro, máquinas, falhas e rollback. Só depois promover a release com backup e plano de reversão.

**Decisão:** incremento melhora veracidade/segurança da apresentação, mas liberação operacional continua bloqueada. A publicação no Lovable sem homologação é apenas implantação de interface, não aceite de produção.
