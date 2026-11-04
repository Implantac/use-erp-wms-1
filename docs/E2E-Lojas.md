# E2E — Lojas e smoke de navegador

## Segurança: somente homologação isolada

A jornada transacional **cria solicitação e transferência, movimenta estoque e altera saldos**. Use uma instalação e banco separados da operação real. O script pede confirmação explícita, mas não consegue verificar se o banco realmente é isolado: a responsabilidade de conferir o destino é do operador. Em caso de dúvida, não execute. Não há limpeza automática; falhas intermediárias podem deixar registros e reservas. Repetições consomem saldo do CD.

## O que cada teste comprova

- `store-journey-ui.spec.ts`: login e abertura de três telas por papel. É um **smoke de interface**, não realiza a jornada completa com cliques.
- `store-journey.spec.ts`: solicitação, decisão, expedição, recebimento com divergência e saldo, por **API real**, com autenticação/RLS.
- `e2e/public/login.spec.ts`: cliques na tela de login e redirecionamento de rota protegida, sem backend; servidor dedicado e rede externa bloqueada. Não comprova autenticação real nem processos operacionais.

A jornada completa de solicitação → decisão → execução → recebimento **por cliques**, com verificação dos efeitos persistidos, ainda precisa ser implementada e executada. A suíte legada possui outras especificações que também dependem de credenciais e massa; não considerar testes ignorados como aprovados.

## Executar Lojas em homologação

1. Confira que aplicação e Supabase apontam exclusivamente para ambiente isolado, migrado e iniciado. Prepare manualmente usuários, produto com saldo suficiente e unidades de homologação. Os scripts de seed existentes alteram o banco: leia-os e use somente no banco isolado; o executor não os chama automaticamente.
2. Crie `.env.e2e` na raiz (não versionar, não compartilhar senhas) com os valores abaixo. Confirme especialmente que URLs do navegador e da API correspondem ao mesmo ambiente.
3. Rode `TESTAR-E2E.bat`, leia o aviso e digite `HOMOLOGACAO` apenas após conferir o isolamento. É necessário Bun, dependências e acesso para instalar Chromium na primeira vez. O script falha se variáveis estiverem ausentes, um teste for ignorado ou o Playwright falhar. O código de saída é propagado pelo `.bat`.
4. Guarde a saída e revise resíduos/saldos no ambiente de homologação. Um teste aprovado não é homologação de produção.

```dotenv
E2E_BASE_URL=http://localhost:8080
VITE_SUPABASE_URL=http://localhost:8080
VITE_SUPABASE_PUBLISHABLE_KEY=<chave anon do ambiente isolado>
E2E_STORE_EMAIL=<usuario da loja de homologacao>
E2E_STORE_PASSWORD=<senha>
E2E_MANAGER_EMAIL=<gestor de homologacao>
E2E_MANAGER_PASSWORD=<senha>
E2E_PRODUCT_ID=<produto com saldo suficiente no CD de homologacao>
E2E_STORE_BRANCH_ID=<unidade loja de homologacao>
E2E_CD_BRANCH_ID=<unidade CD de homologacao>
```

## Smoke offline de login

Na raiz: `bun install --frozen-lockfile`, `bun x playwright install chromium` e `bun x playwright test --config=e2e/playwright.public.config.ts`. No Linux podem ser necessárias bibliotecas de sistema do Chromium (`playwright install-deps chromium`). A porta 4179 deve estar livre. O teste usa backend inválido e intercepta requisições externas; não executa operações de banco. Não requer `.env.e2e`.

## Estado da validação (T101)

Os três testes offline passaram em Chromium neste sandbox (rota protegida, mostrar/ocultar senha e navegação de recuperação), sem autenticação nem banco. Os quatro testes de Lojas foram descobertos, mas o smoke autenticado e a jornada por API continuam **não executados** por falta de instalação e banco isolados. O smoke foi atualizado para abrir a Central de Abastecimento e clicar na aba Solicitar da Loja sem enviar. PowerShell/Windows e a instalação isolada do cliente não estavam disponíveis para validar o `.bat` de ponta a ponta.

O teste por API foi corrigido após confronto com as migrations: a decisão já cria transferência APROVADA e `shipped_qty` começa em zero. A sequência agora parte do estado seguinte e expede a quantidade solicitada; erros de leitura e IDs ausentes falham explicitamente. Essa correção ainda precisa de execução em homologação.
