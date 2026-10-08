# Ensaio real de isolamento RLS entre empresas

**Status: não executado neste projeto até registro de evidência de banco real.** Os antigos testes Vitest consultavam linhas vazias ou ignoravam erros e podiam passar sem provar isolamento; foram removidos.

Use **projeto Supabase de teste isolado**, com migrations aplicadas, duas empresas distintas, um usuário comum com vínculo apenas à empresa A e outro apenas à B, e uma linha identificada por ID em `stock_balances` e `nfe` para cada empresa. Confirme antes de executar que ambos têm autorização funcional de ler sua própria linha. Não use `service_role`, usuário administrador multiempresa ou dados reais de clientes. Não versionar senhas, IDs de fixtures privadas nem saída contendo credenciais.

Exporte no shell (ou secret store do CI) `RLS_TEST_SUPABASE_URL` e `RLS_TEST_ANON_KEY`, e para cada `RLS_A_` e `RLS_B_` respectivamente: `EMAIL`, `PASSWORD`, `COMPANY_ID`, `STOCK_BALANCE_ID`, `NFE_ID`. Em seguida execute `npm run test:rls:live`. A ausência de qualquer variável resulta em código **2 / NÃO EXECUTADO**, nunca sucesso. Falha de login, fixture própria invisível, erro de consulta ou dado cruzado resulta em código **1 / FALHOU**. Somente as quatro provas (estoque e NF-e, em ambos os sentidos) resultam em código **0 / APROVADO**.

O script deliberadamente consulta por ID **sem filtro por empresa**, para que a política do banco, e não o cliente, seja testada. Resultado positivo não prova as demais tabelas, Storage, Edge Functions, papel privilegiado, operações de escrita nem autorização fiscal; amplie a matriz antes de liberar produção. Registre ambiente, versão das migrations, horário, resultado e evidências sem segredos.

`npm run test:rls:guard` verifica localmente que fixtures incompletas e chaves secretas/`service_role` são recusadas antes de qualquer chamada à rede. Isso **não** substitui o ensaio A/B no Supabase real.
