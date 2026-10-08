# Decisões arquiteturais

- Cores de ações e navegação devem usar tokens semânticos em ambos os temas; botões primários usam contraste escuro sobre laranja para leitura consistente.
- Hooks React devem ser chamados antes de qualquer retorno condicional, garantindo ordem estável entre renderizações.
- Políticas empresariais vindas de metadados devem ser tipadas e mescladas no PolicyProvider, sem supressões TypeScript.
- Integrações fiscais e bancárias devem falhar com segurança quando indisponíveis; é proibido persistir documentos ou cobranças fictícias.
- Pedidos novos permanecem pendentes até uma transição explícita do fluxo O2C; criação nunca equivale a conclusão.
- Arquivos gerados automaticamente pelo ambiente de autenticação e MCP ficam fora do lint; correções devem ocorrer em suas fontes geradoras.
- HOCs só encaminham `ref` para classes ou componentes `forwardRef`; `memo` isolado não implica suporte a referência.
- Pagamentos PIX no PDV só contam como recebidos após consulta autenticada de cobrança paga; sem provedor, nenhuma cobrança é criada.
- A busca global usa a navegação filtrada pelo contexto operacional e o atalho Ctrl/Cmd+K tem um único destino, evitando oferecer telas incompatíveis com a unidade ativa.
- A lista de empresas exibe todas as entidades jurídicas sem fabricar filiais; unidades operacionais vêm exclusivamente de `branches`, para não confundir tenant com local de operação.
- A entrada de NF-e só pode confirmar após processamento transacional e idempotente de produtos, estoque e financeiro; leitura do XML sozinha nunca altera saldos nem simula conclusão.
- O acompanhamento de transmissões fiscais lê apenas a fila persistida e respeita o contexto da empresa; estado fiscal nunca é inferido de ações locais.
- Painéis de governança exibem apenas contagens e eventos consultados por empresa com RLS; indisponibilidade não pode ser apresentada como saúde ou conformidade verificada.- O acesso por unidade é uma política restritiva adicional: usuários com unidade fixa no perfil e sem papel de matriz só veem registros dessa unidade; quem não tem unidade fixa mantém o acesso da empresa, para não bloquear operações existentes.
