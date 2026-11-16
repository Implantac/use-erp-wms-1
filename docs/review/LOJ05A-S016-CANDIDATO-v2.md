# LOJ-05A + S016 — candidato funcional v2, isolado e não publicado

Esta revisão local melhora o candidato v1 `798bc17f170d5c5c3b7285f693e92995f3e80712`, cuja base é `ce58b47198e50035e9b33632890042dfdd2b0c2d`. Não é integração à main, envio ao Lovable nem aceite operacional.

## Melhorias

- Identidade de leitura renovada ao perder a resolução do contexto, trocar usuário/empresa/unidade/canal ou voltar a uma empresa já visitada. Cache recente não reapresenta permissões/dados de uma passagem anterior. A identidade de leitura não concede acesso nem substitui RLS.
- Reconsulta de lastro renova também a confirmação de papéis/empresa do servidor quando cabível. Falhas são propagadas, contexto indisponível e conjunto vazio não disparam consultas manuais, e cliques concorrentes compartilham a mesma releitura.
- Retorno da reconsulta visível fora do diálogo gerencial, com estado ocupado e sem reenviar disponibilização. Resultados de outra passagem pelo contexto não reaparecem.
- Pedido já vinculado sem lastro visível e OP sem identificador válido exigem reconsulta/conciliação; não oferecem outra disponibilização. Ausência visível não é prova de ausência global.
- Quantidades pequenas/decimais não são arredondadas artificialmente para zero ou três casas na apresentação. O valor do backend e os números do CSV não são modificados.
- Busca literal trata barras invertidas além de `%` e `_`; filtros desconhecidos, permissões setoriais com tipos inválidos e contagens malformadas falham de forma explícita.
- Acompanhamento ganha limpeza de filtros para os últimos 30 dias, retorno direto à primeira página vazia, aviso de atualização e cabeçalhos de tabela identificados. Continua somente leitura, na aba existente, com exportação limitada à página.

## Verificações locais realizadas

- **165/165 testes com mocks/DOM em 23 arquivos**, incluindo **41 casos novos**. Rodada final com fuso `America/Sao_Paulo` e guarda local de rede sem tentativas registradas.
- **8/8 contratos estáticos**: leitura de fontes SQL/JS, sem executar SQL, harness ou banco.
- **Lint dos 15 arquivos TypeScript alterados/novos: zero erros e zero avisos**, inclusive regra adicional contra `any` explícito.
- **Tipagem nativa focada: exit 0**, 17 raízes esperadas presentes, 533 arquivos no grafo real de imports, 42 fontes em `src`. Sem stubs, path mappings substitutos, ignorar erros ou relaxar opções originais de tipagem.

A matriz inicial de regressões e as falhas/correções do coletor de verificação foram preservadas fora desta árvore de código, junto aos recibos. Não são ocultadas por estes resultados finais.

## Invariantes preservadas

`INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED = false`, sem override. A interface candidata não cria pedido/reserva por disponibilização. O adapter mutante existente permanece restrito a `finalize_intercompany_production(p_request_id)`; não há escrita genérica de estoque/reserva nem UPDATE de conclusão de OP.

Pedido pendente e reserva do lote produzido vinculado não significam expedição, aprovação fiscal ou recebimento. Não há recebimento legado reativado, troca automática de empresa ou promoção de lote. Permanecem as distinções entre carregamento, falha, contrato incompatível, inconsistência, ausência visível e lastro válido.

Backend, migrations, Auth, motores do mesmo CNPJ, scripts, workflows, gates, dependências e locks não foram alterados por esta v2. `minify: false` preservado. Nenhum novo módulo/menu/PCP, S008, eficiência/OEE ou quantidade aprovada inventados.

## Limites e continuação

**Gates globais de app/node e build completo do candidato continuam pendentes.** A tipagem focada, mocks, contratos estáticos e integridade de patch não substituem esses gates nem homologação Auth/RLS, LOJ-05/06, fiscal/PSP, restauração e aceite.

Nenhum push, CI externa, PR, alteração de main, publicação, SQL de produção, login no ERP, troca de empresa ou ação de negócio foi realizado nesta melhoria.

A integração à main permanece condicionada aos gates e à auditoria de ausência de deploy automático/testes com dados reais já estabelecida. Não desativar testes, mascarar falhas, configurar segredos ou publicar para aplicar este pacote.

Para revisão futura, o pacote v2 fornece duas alternativas, nunca para aplicar uma sobre a outra:

1. Patch incremental: candidato v1 `798bc17f…` → v2 local.
2. Patch cumulativo: base `ce58b471…` → v2 local, incluindo LOJ-05A/S016 v1.

Conferir a base e usar `git apply --check` apenas em ambiente isolado. Não aplicar na main ou no projeto conectado como atalho para os gates pendentes. O commit/tree local e hashes exatos constam no manifesto externo desta entrega.
