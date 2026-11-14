# LOJ-05A + S016 — candidato para revisão isolada

**NÃO HOMOLOGADO PARA PRODUÇÃO. NÃO É AUTORIZAÇÃO DE MERGE OU PUBLICAÇÃO.**

Base: `ce58b47198e50035e9b33632890042dfdd2b0c2d`.
Material funcional: os mesmos 24 arquivos do candidato `LOJ05A-S016-local-candidate-v1`.
ZIP de origem, SHA-256: `955dfe781d17407c4369424eb563741ab842fbf6a980b541c03cc16d1e872359`.

## Escopo

- LOJ-05A: leitura tipada do lastro por solicitação, apresentação na Loja e Fábrica,
  papéis/contexto conferidos e contenção do recebimento legado neste cliente.
- S016: aba Acompanhamento dentro do BI Industrial, consulta somente leitura,
  filtro de criação da OP, paginação explícita e CSV da página.
- S008, LOJ-06, fiscal/PSP, operações reais de estoque e aceite do cliente não estão aprovados.

## Bloqueios preservados

- `INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED = false`, sem override de ambiente/runtime.
- Nenhum pedido/reserva é criado pela interface candidata nesta versão bloqueada.
- Sem alteração em backend, SQL, migrações, autenticação, locks, scripts, gates,
  dependências, workflows ou `minify:false`.
- Não confundir pedido/reserva com expedição ou autorização fiscal.

## Evidências locais anteriores — não rerodadas para este commit

- 130/130 testes com mocks, lint e tipos suplementares passaram.
- Tipos suplementares não equivalem ao typecheck global.
- Typecheck global sem conclusão por reserva de memória; novo build sem aprovação
  por falta de heap. Nenhum gate vazio, omitido ou bloqueado conta como sucesso.
- Zero jornadas autenticadas/RLS reais homologadas para o candidato.

## Regra desta revisão

Somente branch de revisão. Não abrir PR, fazer merge em main, disparar CI,
publicar, executar SQL ou realizar testes com persistência sem nova autorização.
Os gatilhos existentes de push foram auditados para esta branch; não foram
alterados nem contornados com marcador de skip. Automações externas e configuração
de hospedagem não são comprovadas por essa auditoria de workflows.
