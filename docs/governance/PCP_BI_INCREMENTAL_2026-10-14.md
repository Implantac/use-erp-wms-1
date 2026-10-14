# Incremento após `023edbd2` — qualidade de amostras de datas no BI

O BI industrial passa a formar os indicadores de prazo somente com OPs concluídas com término e prazo válidos e término não futuro; início informado mas inválido ou posterior ao término exclui a OP da amostra de pontualidade. Duração média usa diferença entre timestamps (fração de dia), não arredondamento de cada OP para dias inteiros. Atrasadas exige OP ativa (`planned`, `in_progress` ou `paused`) e prazo válido vencido; rascunhos não entram. Sem amostra, o valor permanece não apurado. A duração decorrido início→término não é tempo produtivo nem OEE.

Testes unitários 3/3, typecheck e lint CI aprovados. Não houve teste de banco, simulação de fuso horário de tenant, confirmação de política de prazos por nicho ou migration. A lógica usa os instantes salvos na OP, sem alterar o cadastro de prazos. O lote é local e ainda não foi publicado.
