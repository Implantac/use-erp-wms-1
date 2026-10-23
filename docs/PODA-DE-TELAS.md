# Poda de telas — menu como ferramenta de trabalho (2026-10-23)

## Decisão
Telas que **nenhuma operação real alimenta** saem do menu de todos os
nichos (`SHOWCASE_HREFS` em `src/config/adaptive.ts`, aplicado no
`Sidebar`, inclusive na busca do menu):

| Tela | Rota | Motivo |
|---|---|---|
| IA da Produção | `/producao/ia` | Sem modelo/dado real alimentando |
| Gêmeo Digital | `/producao/twin` | Simulação sem telemetria real |
| IoT | `/producao/iot` | Sem sensores integrados |
| Previsões ML | `/producao/previsoes` | Sem série histórica validada |
| APS / APS Multi | `/producao/aps`, `/producao/aps/multi` | Experimental; programação oficial é `/producao/programacao` |
| IA Comercial | `/comercial/ia` | Idem IA da produção |
| Gamificação | `/comercial/gamificacao` | Não é ferramenta de operação |

## O que NÃO foi podado
Tudo que tem dado e uso real: OPs, PCP setorial e seus quadros, MRP,
programação, qualidade, WMS, centrais de Loja, compras, fiscal, financeiro.
Dashboards de nicho (Pacotes Verticais) já eram filtrados por nicho
(`canPresentNicheRoute`) e continuam assim.

## Como reabilitar uma tela
1. A tela passa a ler dado real (nada de simulado);
2. Uso comprovado no piloto;
3. Remover o href de `SHOWCASE_HREFS` (os testes apontam o comportamento).

## Limites honestos
- As **rotas continuam acessíveis por URL direta** (avaliação técnica);
  o bloqueio de rota por nicho é o passo seguinte, se o piloto pedir.
- Dashboards setoriais genéricos antigos (executivos de nicho não-têxtil)
  seguem atrás do filtro de Pacotes Verticais; a poda deles é por nicho,
  não global.
