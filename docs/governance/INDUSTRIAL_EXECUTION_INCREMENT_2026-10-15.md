# Execução industrial: primeiro incremento transversal — 15/10/2026

Objetivo: não fabricar números em um terminal genérico enquanto o ciclo de pausa, unidades e identidade ainda não é confiável. Este incremento local **não** promete suporte completo a qualquer indústria.

- Terminal deixou de apresentar cronômetro líquido, peças/h, qualidade e soma de produção de OPs com unidades potencialmente incompatíveis. Mostra unidade da OP e quantidade individual, mas sem medição de produtividade.
- Falha ao inserir alerta agora bloqueia a mensagem de sucesso e a pausa subsequente. Se alerta gravar e pausa falhar, a interface informa explicitamente o estado parcial; **não há transação atômica** entre ambos.
- Criação/atualização de apontamento retorna sucesso/falha; operações dependentes não prosseguem quando a escrita falha. Quantidades de finalização devem ser finitas e não negativas.
- Persiste risco de atualização da OP em operação separada da finalização do apontamento, e de concorrência/repetição de atualização de quantidades. Nenhum total de OP, estoque ou qualidade pode ser declarado conciliado por esse fluxo.

## Próximos gates, por indústria parametrizada

1. Definir ordens/etapas, unidades e conversões aprovadas, identificação do material e lotes de entrada/saída por operação; sem presets fiscais ou produtivos hipotéticos.
2. Capturar início/fim de pausas e motivos em eventos persistidos e transacionais; validar operadores, equipamento, turno, empresa/unidade e autorização server-side.
3. Conciliar apontamento, OP, estoque, qualidade e custos com idempotência/concorrência no banco antes de exibir OEE ou eficiência.
4. Adicionar fluxos verticais mediante mapeamento de processo e piloto. Fiação, tecido plano, malha e tinturaria são cenários iniciais, não modelo universal.
5. Homologação isolada, RLS multiempresa, testes de integração/carga e piloto real: **pendentes**. Sem migrations executadas nem publicação no GitHub.

Verificações locais: `node --test scripts/test-operator-terminal-truthfulness.mjs`, `npm run typecheck`, `npm run lint:ci`, `git diff --check`. São testes estáticos, não homologação operacional.
