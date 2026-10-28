# Guia rápido de operação — USE ERP local (BIL)

## Ligar e desligar

- **INICIAR-SISTEMA.bat** sobe a stack; **PARAR-SISTEMA.bat** desliga (sem
  apagar dados). Acesso: `http://localhost:8080` (na rede local, pelo IP
  do servidor). Login: administrador cadastrado no `CORRIGIR-LOGIN-BIL.bat`.
- Se o menu sumir itens, confira o seletor de unidade no topo: em **Visão
  consolidada** os itens de unidade ficam ocultos — volte para **Matriz**.

## Onde fica cada PCP (menu Produção (PCP))

| Central | Para quem | O que opera |
|---|---|---|
| Painel PCP Industrial | Visão integrada | Todas as OPs, MRP líquido, indicadores consolidados |
| Central PCP Fiação | Programador da fiação | OPs de fio: perfil (título/torção), reserva de fibra/pluma, etapas, eventos (tirada, ruptura) |
| Central PCP Malharia | Programador da malharia | OPs de malha: perfil (galga/diâmetro), reserva de fio, eventos (quebra, troca de rolo) |
| Central PCP Tecelagem | Programador da tecelagem | OPs de tecido: perfil do tear (urdume/trama, rolo, pente, batidas), eventos de quebra de urdume/trama |
| Central PCP Tinturaria | Programador da tinturaria | OPs de tingimento: perfil (cor, partida, relação de banho, CIELAB), eventos de banho/cor |

Toda OP nasce com **snapshot** (BOM/roteiro congelados), consome por
**reserva de lote**, é **programada sem dupla alocação**, avança por
**etapas sequenciais**, só conclui com **qualidade aprovada** e grava a
**genealogia** lote de entrada → lote de saída.

## Para operar com dados reais (ordem de cadastro)

1. **Produtos** (Estoque & Catálogo): matéria-prima, fio, tecido/malha,
   produto final — com unidade certa (kg, m).
2. **Fichas, BOM e roteiros** (Produção): BOM com consumo por unidade e
   roteiro com operações **do setor certo** (o setor da OP nasce do
   roteiro). Receitas de tinturaria entram como ficha configurada da
   empresa — o sistema não presume dosagem, relação de banho nem tempos.
3. **Equipamentos/Recursos**: cadastre filatórios, teares, JETs.
4. **Estoque**: receba/classifique os lotes (qualidade aprovada libera a
   reserva).
5. **OP pela central do setor**: criar, reservar lotes, programar,
   apontar etapas/eventos, inspecionar e concluir.

## Testes guiados disponíveis (dados de demonstração)

- `PREPARAR-FLUXO-TESTE.bat` — pedido → fiação → malharia → tinturaria →
  malha tingida em estoque (pedido PV-TESTE-0001).
- `PREPARAR-TECELAGEM.bat` — fio urdume/trama → tear → tecido plano cru
- `PREPARAR-INTEGRACAO.bat` — cadeia integrada: pluma → fio → tecido e
  malha → tingimento, uma OP concluída em cada central
- `PREPARAR-PEDIDOS.bat` — catálogo de produtos por processo (categorias)
  e o fluxo comercial: pedidos de tecido, fio e malha tingida expedidos
  por lote, mais a tinturaria para terceiro (malha do cliente → OP
  vinculada ao pedido → devolução expedida)
  em estoque (480 m, lote TECIDO-LOTE-TESTE-001).
- Ambos são idempotentes e usam apenas as funções reais do sistema.

## Manutenção

- `REPARAR-BANCO.bat` — aplica migrations novas sem apagar dados.
- `ATUALIZAR-WEB.bat` — reconstrói o frontend após atualização de telas.
- `DIAGNOSTICO-SISTEMA.bat` — gera `diagnostico.txt` para suporte.
- Nunca use `REINSTALAR-DO-ZERO.bat` com dados reais sem backup.
