# Performance — medição real (2026-10-23)

Método: `pgtest-harness/perf.mjs` sobe o Postgres embarcado, faz o replay
completo (479 migrations), aplica os seeds do grupo e gera volume
realista (**2.028 produtos, 30.052 saldos, 4.000 transferências, 3.000
OPs, 15.000 eventos de setor, 2.000 pedidos de compra**), depois mede as
consultas exatamente como as telas chamam (mediana de 3 execuções).

## Resultados

| Consulta quente | Mediana |
|---|---|
| `factory_inbox()` (caixa de entrada da Fábrica) | 0,8 ms |
| Fila do dia: transferências EM TRÂNSITO p/ unidade | 0,9 ms |
| "Operação da rede hoje": contagens por status | 1,1 ms |
| Estoque: saldos de uma unidade (1.000 linhas) | 1,5 ms |
| Produção: OPs abertas (500) | 2,7 ms |
| Compras: pedidos recentes (500) | 2,8 ms |
| Produtos: busca nome/código (ilike) | 0,4 ms |
| Eventos de setor de hoje | 0,2 ms |

## Conclusão honesta
**O banco não é o gargalo** neste volume (≈ 1 ano de operação de um grupo
pequeno/médio): tudo abaixo de 3 ms com os índices existentes. Onde o
usuário pode sentir lentidão é no **navegador** (renderizar listas
grandes) e na **rede local** — por isso as telas novas limitam listas
(top 5 nas filas, limites nas consultas) e os dashboards usam cache de
30s (react-query).

## Volume 10× (mesma metodologia, `PERF_SCALE=10`)
300.052 saldos · 40.000 transferências · 30.000 OPs · 150.000 eventos ·
20.028 produtos:

| Consulta quente | Mediana |
|---|---|
| Eventos de setor de hoje | 32 ms |
| Produção: OPs abertas (500) | 11 ms |
| "Operação da rede hoje" | 5,9 ms |
| Compras: pedidos recentes | 6,3 ms |
| Fila do dia: EM TRÂNSITO p/ unidade | 4,2 ms |
| Estoque: saldos de uma unidade | 1,5 ms |
| `factory_inbox()` | 0,9 ms |
| Produtos: busca ilike | 0,6 ms |

**Nenhuma consulta perto do limiar de defeito (300 ms)** — os índices
existentes sustentam 10× o volume de referência. Sem migration de
índice nesta rodada: otimizar o que já está rápido seria teatro.

## Regras daqui pra frente
- Rodar `bun perf.mjs` a cada release maior e registrar a tabela aqui;
- Se alguma consulta passar de **300 ms** no volume de referência,
  tratar como defeito (índice ou reescrita) antes de publicar;
- Volume 10× já medido (acima). Próximo marco: repetir com os dados
  reais do piloto e medir também o tempo de tela (navegador).
