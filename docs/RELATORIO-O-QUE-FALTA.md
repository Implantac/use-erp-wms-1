# Relatório — o que ainda falta para a excelência

**Data:** 23/10/2026 · **Versão do produto:** 1.1.0 · **GitHub `main`:** `35a08d7a` (sincronizado com o Lovable)
**Provas atuais:** harness de banco **125/125** · testes unitários **297/297** · typecheck limpo · **476 migrations**

---

## 1. Resumo executivo

O núcleo operacional está **provado com dados reais**: grupo indústria + lojas
multi-CNPJ, fluxo oficial de transferências com ledger, caixa de entrada da
Fábrica, alertas automáticos, PCP dos 4 setores têxteis com telas diárias
próprias e atualização local segura com rollback (testado em campo, inclusive
com um rollback real acionado por um falso positivo já corrigido).

O sistema hoje é um **piloto forte**, não ainda um produto vendável completo.
Faltam três coisas grandes: **fiscal homologado**, **uso real contínuo
(piloto)** e **prova de clique de ponta a ponta**. O restante é acabamento.

---

## 2. O que falta, por frente

### 🔴 Fiscal — o portão nº 1 do "vendável"
| Item | Dono | Critério de pronto |
|---|---|---|
| Contratar provedor (Focus NFe/NFe.io/PlugNotas) | **Você** | Conta ativa |
| Certificado A1 da empresa piloto + CSC | **Você** | Arquivo .pfx válido |
| Worker de emissão (token em segredo, drena `fiscal_emission_jobs`) | Eu | Código + teste em homologação |
| Homologação SEFAZ (venda, devolução, cancelamento, CC-e) | Eu + você | Retorno "autorizada" em cada cenário |
| Ligar `emission_enabled` e emitir a 1ª NF-e em produção | Eu | XML/DANFe arquivados e conciliados |

*Estado:* gate no banco, fila oficial, telas e runbook **prontos**. Sem provedor
e certificado, nada anda aqui — é dependência externa, não atraso de código.

### 🟠 Piloto de 30 dias — a prova que falta
| Item | Dono | Critério de pronto |
|---|---|---|
| Semana 1: cadastros reais até zerar o "Pronto para operar?" | **Você/equipe** | Painel sem pendências |
| Semanas 2–4: operação só pelo sistema (roteiro pronto em `docs/PILOTO-30-DIAS.md`) | **Você/equipe** | Métricas do roteiro medidas |
| Correções do top 3 semanal | Eu | Itens fechados por semana |

*Estado:* roteiro, rituais por papel e métricas definidos. **Não começou** —
nenhum teste meu substitui 30 dias de uso real.

### 🟡 Testes E2E de clique
| Item | Dono | Critério de pronto |
|---|---|---|
| Jornada automatizada no navegador (Loja pede → Fábrica decide → CD expede → Loja recebe) | Eu | Suíte verde rodando contra a instalação |
| Ambiente de E2E (stack local automatizada ou CI) | Eu + você | Execução repetível |

*Estado:* a jornada está provada no **banco** (harness) e por **roteiro manual**
(C1–C8). Existe uma spec Playwright da tecelagem (`tests/e2e/`), nunca
 executada em CI ou contra a instalação real. É a maior lacuna de teste.

### 🟡 Instalação e atualização
| Item | Estado |
|---|---|
| `ATUALIZAR-SEGURO.bat` (backup → update → verificação → rollback) | ✅ Entregue; rollback **provado em campo**; falta o usuário confirmar o caminho feliz pós-correção |
| Instalação do zero em máquina limpa (nunca testada fora da sua) | ⏳ Pendente — testar em VM/máquina limpa |
| Atualização do Lovable × local | ⚠️ Manual a cada rodada (fetch/merge/push); token precisa ser revogado e o processo, documentado |

### 🟢 Acabamento de produto
| Item | Estado |
|---|---|
| Busca global (produto/OP/pedido de qualquer tela) | ⏳ Não existe |
| Onboarding guiado por papel (primeiro acesso) | ⏳ Parcial (finalidade nas centrais) |
| Manual do usuário por papel | ⏳ Roteiros técnicos existem; manual ilustrado não |
| Performance medida com volume real (dashboards) | ⏳ Nunca medido |
| Custos e indicadores por máquina (sem número inventado) | ⏳ Depende de apontamento real contínuo (piloto) |
| Sequenciamento fino (APS) homologado | ⏳ Telas existem; não homologado em produção |

### 🟢 Dívida técnica (não bloqueia, cobra juros)
| Item | Estado |
|---|---|
| `InventoryOrchestrator` (legado isolado, só teste usa) | Marcado; aposentar com `supply_chain_ledger` |
| Drop físico de `supply_chain_movements`/`transferencias_canal` | Estrangulados (sem escrita das telas); drop após piloto |
| Automação do merge local × Lovable | Manual hoje; scriptável |
| Token do GitHub colado no chat | **Revogar** e gerar outro quando precisar |

---

## 3. Riscos atuais

1. **Fiscal parado por dependência externa** — cada semana sem provedor é
   uma semana a mais sem poder vender o produto como ERP completo.
2. **Piloto não iniciado** — sem uso real, as próximas melhorias viram chute.
3. **Uma máquina só** — a instalação vive no seu PC; backup externo da pasta
   `backups\` é obrigatório (o script já recomenda; falta a rotina).

## 4. Próximos 3 passos recomendados

1. **Você:** revogar o token, decidir o provedor fiscal e iniciar a Semana 1
   do piloto (cadastros reais).
2. **Eu:** testes E2E de clique da jornada completa + busca global.
3. **Juntos:** com provedor e certificado em mãos, homologação fiscal —
   o último portão do "vendável".
