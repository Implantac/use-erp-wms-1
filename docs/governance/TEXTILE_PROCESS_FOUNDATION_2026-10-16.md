# Núcleo têxtil parametrizável — primeiro incremento (16/10/2026)

Pedido: implementar fiação, tecelagem e tinturaria para fábrica integrada, incluindo **tecido plano e malha em paralelo**. Escopo desta entrega local: vocabulário de etapas e pré-validação pura de transformações, apresentado no `/vertical/textile` como **mapa para parametrização**, não como processo executado. Não foi criado pedido, OP, lote ou movimento de estoque; não houve migration, push ou teste em Supabase. A versão do Lovable continua conectada ao Supabase de produção: **não** usar publicação como homologação.

- `src/lib/textile/processModel.ts` define estágios exemplificativos separados: fibra→fio, fio→tecido plano, fio→malha, tecido cru→tinturaria/acabamento. Não fixa velocidade, conversão, percentual de perda, capacidade, receita nem tributo. A variante de fiação sem maçaroqueira, tingimento de fio, beneficiamento alternativo, tingimento de malha/tecido e terceirização exigem roteiro parametrizado, não alterações por tentativa no banco real.
- `validateTextileTransform` exige mesma empresa entre lotes e operação, tipos de material compatíveis com a etapa, insumos liberados, IDs distintos, quantidade positiva, unidade explícita e referência quando unidades diferem. É **somente preflight de domínio no cliente**; uma referência textual não prova conversão aprovada. Não há API/ledger nem validação server-side, balanço de massa, coprodutos, perda, consumos de trama/químicos ou genealogia persistente. Ninguém deve chamar essa função de rastreabilidade efetiva.
- `TextileProcessMap` informa explicitamente «Configuração pendente» e mantém KPIs «Sem dados suficientes»; não mostra produção inventada.

## Portões necessários para processo real

1. Engenharia têxtil aprovar variantes reais por unidade e artigo, parâmetros de fiação, urdimento/trama, malharia, banho, acabamento, perdas, receitas e inspeções; sem presets fictícios.
2. Modelo persistente e versionado de roteiro, OP/etapa, lote/fardo/bobina/rolo/banho, entradas/saídas, unidade e conversão por item, incluindo fusão/divisão, retrabalho e refugo.
3. RPC/serviço transacional com RBAC e RLS empresa/unidade, travas, idempotência e ledger de estoque/qualidade/custo; sincronizar MES/máquinas conforme compatibilidade real.
4. Supabase isolado + Lovable de teste, cargas de dados aprovadas, falhas/repetição/concorrência, recall origem→destino e rollback; piloto por etapa até produto acabado.

Verificado: `npx vitest run src/lib/textile/processModel.test.ts` (3/3), `npm run typecheck`, `npm run lint:ci`, `git diff --check`. Teste unitário não comprova implantação operacional. **Produção integral não liberada.**
