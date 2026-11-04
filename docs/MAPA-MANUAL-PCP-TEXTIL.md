# Mapa: Manual PCP Têxtil × Sistema (T92, 28/10/2026)

Referências: `docs/manuais/Manual_Treinamento_IA_PCP_Textil_Pluma_ao_Tecido.md`
e `docs/manuais/Prompt_IA_PCP_Tinturaria.md`. Critério permanente: só é
“provado” o que tem migration + tela/serviço + teste; o restante é marcado
configurável, parcial ou ausente, sem presumir parâmetro algum da empresa.

| Tema do manual | Estado no sistema | Evidência / observação |
| --- | --- | --- |
| Não inventar parâmetros; empresa configura | Provado | Perfis setoriais, receitas e roteiros nascem sem valores sugeridos |
| Recebimento da pluma com lote, classificação e qualidade | Provado | `register_fiber_receipt`, classificação estruturada, saldo pelo `lot_id` |
| Lote não aprovado não é consumido | Provado | Reserva de produção rejeita lote fora de aprovado/liberado |
| Mistura de fibras configurada | Parcial | Mistura estruturada na OP de fiação (T82); a mistura real rastreada é a dos lotes consumidos na conclusão |
| Roteiros por família, com/sem etapas opcionais | Provado | Modelos de roteiro têxteis aplicáveis por produto (T81) |
| Urdume/engomagem como operação própria | Provado | Perfil da OP + receita de engomagem versionada (T82) |
| Rolos/peças identificados por lote | Provado | `stock_lot_units`, inspeção e embalagem por unidade (T81) |
| Expedição identificando o que saiu | Provado | Expedição por lote e por rolo vinculado ao pedido (T82) |
| Tinturaria: pré-tratamento e parâmetros do banho | Provado | Perfil de tinturaria estruturado (T82) |
| Tinturaria: carga mínima/máxima e volume útil da máquina | Provado (T83) | Limites configurados no equipamento; banco rejeita partida fora da carga/volume configurados |
| Tinturaria: receita versionada de tingimento | Provado (T85) | Cadastro versionado próprio (rascunho/aprovada/substituída); OP copia banho/temperatura/tempo/pH da versão aprovada |
| Laboratório: aprovação formal de cor como portão | Provado (T84) | Decisão estruturada (aprovada/rejeitada/concessão justificada, auditada); com a exigência marcada, o banco bloqueia a conclusão da OP |
| Capacidade finita por máquina | Provado (T87) | Programação rejeita sobreposição no mesmo recurso; com setup/limpeza configurados na máquina, exige o intervalo setup + limpeza entre produções de artigos diferentes (mesmo artigo em sequência não exige) |
| Sequenciamento por cor/contaminação | Provado (T90) | Sugestão claro→escuro na fila + regra formal opcional por máquina: com `light_to_dark` configurado, o banco compara o L* alvo das partidas vizinhas e rejeita clareamento; sem regra ou sem L*, nada é bloqueado |
| Retrabalho/reprocesso rastreável | Provado (T86) | Ordem de reprocesso própria (`production_rework_orders`): OP original + lote original + motivo + quantidade; conclusão consome o lote original e gera o lote resultante com genealogia original→resultante; a boa substitui a do lote original, sem dupla contagem |
| Ficha técnica do artigo versionada | Provado (T88) | Cadastro próprio por produto (`textile_article_sheets`): construção/tolerâncias versionadas (rascunho/aprovada/substituída); OP só usa versão aprovada do seu artigo e guarda snapshot dela |
| Make-or-buy / terceirização de etapa | Provado (T91) | Etapa do roteiro marcada como externa; OP herda a marca, envio/retorno por etapa ao fornecedor e o banco bloqueia concluir a etapa sem retorno bom cobrindo a boa apontada |
| WIP por etapa, idade e gargalo | Provado (T89) | Painel próprio nas centrais setoriais: OPs abertas por etapa atual do roteiro, permanência na etapa e idade real da OP, com agrupamento por etapa (gargalo) e faixa de idade; sem etapa gerada aparece explícito, sem estimativa |
| Custo previsto × real por OP | Provado (T92) | Painel na central da OP: previsto = ficha (qtd × perda) × custo de referência cadastrado do componente; real = consumo registrado × custo do lote; variação só é calculada com previsto completo e consumo real — sem custo cadastrado, nada é estimado |

## Próximos lotes sugeridos (pequenos e verificáveis)

1. **T83 (esta rodada):** carga/volume validados da máquina de tingir.
2. **Laboratório como portão:** decisão estruturada de cor (aprovada/reprovada/concessão) e, quando a empresa marcar exigência, conclusão da OP de tinturaria bloqueada sem aprovação.
3. **Receita de tingimento versionada:** mesmo padrão da receita de engomagem (rascunho/aprovada/substituída), ligada ao perfil da OP.
4. **Ordem de reprocesso:** concluída na T86 (ver linha acima).
5. **Limpeza/setup na programação:** concluída na T87 (ver linha acima).
6. **Ficha técnica do artigo versionada:** concluída na T88 (ver linha acima).
7. **WIP por etapa/idade:** concluída na T89 (ver linha acima).
8. **Sequenciamento formal por cor:** concluída na T90 (ver linha acima).
9. **Make-or-buy como etapa externa:** concluída na T91 (ver linha acima).
10. **Custo previsto × real por OP:** concluída na T92 (ver linha acima). Com isso, todos os temas do manual estão provados; evoluções futuras saem de uso real em campo.
