# Backup e recuperação — procedimento pré-produção

> **Status: NÃO HOMOLOGADO.** Este documento é um plano de ensaio, não comprova que o sistema possa ser restaurado. Antes de vender ou operar, um DBA/DevOps deve executar e registrar restauração completa em projeto isolado. Nunca testar restore sobre produção.

## Defina o contrato de recuperação

Aprovar por cliente: proprietário da rotina, RPO (perda máxima), RTO (tempo máximo de recuperação), frequência, retenção, residência dos dados, criptografia, controle de acesso, revisão LGPD e frequência de ensaio. Testar restauração após alterações de esquema. Alarmar falhas de backup e ausência de cópia recente; armazenar cópias imutáveis/off-site quando a política exigir.

## Inventário antes de fazer backup

1. Registrar versão do código, migrations aplicadas, schema/roles/grants/policies/funções/extensões, configuração de Auth, cron/jobs e Edge Functions, domínio/URLs e configurações não secretas.
2. Planejar cópia **consistente** do banco (incluindo usuários de Auth e metadados de Storage conforme suporte e limitações do provedor). Um dump **somente de `public` não inclui todo o sistema**. Consultar o procedimento documentado pelo provedor para schemas gerenciados, PITR e permissões; não presumir que `pg_dump` isolado recrie um projeto Supabase.
3. Copiar os **bytes dos objetos de Storage** por bucket, preservar caminhos, versões e permissões; metadados SQL sozinhos não recuperam arquivos. Inventariar certificados/segredos, configuração do provedor, tokens externos e webhook keys no cofre de segredos; **nunca** incluí-los em dump em claro ou no repositório.
4. Para pagamentos/DF-e, guardar referências e protocolos oficiais e definir reconciliação com provedores antes de reprocessar eventos. Restaurar uma cópia não autoriza reenviar documento fiscal nem cobrar cliente novamente.

## Ensaio de restauração obrigatório

1. Criar **novo** projeto de homologação isolado sem clientes reais. Registrar ponto no tempo escolhido e plano de incompatibilidades/rollback de migrations. Nunca executar `pg_restore --disable-triggers` em dados de clientes sem plano explícito de integridade e validação de FKs.
2. Restaurar usando o método do provedor compatível com Auth, banco, Storage e versões de extensões. Aplicar configurações/segredos pelo cofre, reconfigurar URLs/crons/webhooks em modo **não emissor**; bloquear e-mail, PSP e SEFAZ reais no projeto restaurado.
3. Comparar contagens e amostras verificáveis de tabelas críticas **por empresa**, saldos versus movimentos, pedidos versus itens, títulos versus pagamentos, documentos versus protocolos; validar FKs, policies, funções, índices e objetos de Storage por tamanho/hash. Verificar login de dois usuários de tenants distintos e negação cruzada sem usar `service_role`.
4. Executar jornada operacional representativa somente com transações de teste e sem provedores produtivos; validar tratamento de filas/outbox, jobs pausados, idempotência e atualização posterior do aplicativo.
5. Registrar duração, ponto restaurado, RPO/RTO alcançados, falhas, responsáveis e evidências **sem dados pessoais nem segredos**. Se algum componente não tiver recuperação demonstrável, bloquear GO até resolver e repetir o ensaio.

## Não confundir verificação de arquivo com recuperação

`pg_restore --list <arquivo.dump>` pode detectar um arquivo custom-format ilegível, mas **não prova** consistência, completude, usuários Auth, objetos Storage ou login. Backup de `public` sozinho e `npm run setup` não são critérios de aprovação. Restore trimestral só é suficiente se atender ao RPO/RTO contratados e for repetido após mudanças relevantes.
