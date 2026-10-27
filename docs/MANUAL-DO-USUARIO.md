# Manual do usuário — por papel

Regra de ouro: **tudo se faz pelo sistema**. Se você fez por fora
(WhatsApp, planilha), o sistema não sabe — e o saldo, o alerta e o
relatório vão mentir.

Atalho universal: **Ctrl+K** (ou ⌘K) busca páginas **e dados**
(produtos, OPs, pedidos) e já abre a lista filtrada.

---

## 🏬 Loja (solicitar e receber)
**Seu dia em 15 min** — Central da Loja → **Fila do Dia**:
1. Veja os **recebimentos em trânsito**: chegou? → *Conferir* →
   **Integral** (veio tudo) ou **Divergência** (informe o que veio de
   verdade; o sistema registra a falta e avisa o gestor);
2. Itens **abaixo do mínimo**: clique em **Solicitar** (não precisa
   saber de onde vem — quem decide é o gestor);
3. **Divergências a tratar**: confira com o CD o que faltou.

Erros comuns: solicitar por fora do sistema; receber sem conferir;
ignorar divergência (ela vira ruptura silenciosa depois).

## 🚚 CD (separar e expedir)
**Seu dia** — Central de Abastecimento / fila de decisão:
1. Na **Fila de decisão**, abra cada transferência: confira
   origem → destino e os **itens** (produto, código, quantidades);
2. Separe pelo **ROMANEIO** (botão de imprimir): ele traz itens e
   espaço para conferir e assinar;
3. Expeda só pelo botão da transferência — o saldo sai do CD na hora.

Erros comuns: expedir quantidade diferente sem ajustar no sistema
(gera divergência na Loja); pular o romaneio em dia corrido.

## 🏭 Fábrica / Gestor (decidir e produzir)
**Seu dia** — WMS → topo da tela:
1. **Operação da rede hoje**: o que espera decisão, o que está
   separando, o que está na estrada, o que pediram à Fábrica;
2. **Caixa de entrada da Fábrica**: para cada pedido, analise as origens
   (Loja × CD × Fábrica) e **decida no mesmo dia** — Loja decide a Loja
   vizinha, CD o CD, Fábrica gera o pedido à indústria;
3. **Pronto para operar?**: se algo estiver vermelho, é cadastro
   faltando — resolva antes de cobrar a operação.
Erros comuns: deixar pedido de Loja sem decisão (a Loja não tem como
saber); decidir sem olhar onde realmente há saldo.

## 🧵 PCP por setor (fiação, malharia, tecelagem, tinturaria)
Cada setor tem **sua** central (não é filtro do genérico):
- **Tecelagem → Mapa de Teares**: tear, OP montada, rolo de urdume,
  metros apontados × planejados. Aponte os eventos do dia no tear;
- **Fiação/Tinturaria/Malharia → Quadro de máquinas**: OP, perfil
  (título/galga/cor e banho), kg apontados × planejados;
- **Ordens de Produção → Fila do Dia da Produção**: atrasadas, sem
  apontamento hoje e não iniciadas — nessa ordem de atenção.
Erros comuns: OP sem perfil do setor (sem urdume/trama, cor/banho);
encerrar o dia sem apontar (amanha a OP aparece "sem apontamento").

## 🛒 Compras
**Dashboard de Compras → Fila do Dia**: aprovar hoje, atrasados,
chegando. Ao **receber** um pedido (status recebido/parcial), o
Financeiro ganha o título a pagar sozinho — no detalhe do pedido você
vê o título gerado. Erro comum: mudar o status sem receber de verdade
(o título nasce do recebimento, então status é coisa séria).

## 💰 Financeiro
- Pedido de compra recebido → **Contas a Pagar** (valor do recebido,
  origem no pedido; parcial gera parcial, completar atualiza o mesmo
  título);
- Pedido de venda **faturado** → **Contas a Receber** (uma vez, com
  origem no pedido; re-salvar não duplica);
- Confira vencimentos diariamente; baixa é manual e consciente.

## 🧾 Fiscal (responsável da empresa)
Fiscal → NF-e → **Assistente fiscal**: provedor → certificado/token →
testes na SEFAZ → liberar. Guia completo, em linguagem simples, em
`docs/GUIA-FISCAL-CLIENTE.md`. Emissão desligada não é erro: é o gate
esperando a **sua** homologação.

## 🔑 Administrador
- Empresas/usuários por papel; cada empresa do grupo enxerga o seu e,
  com permissão, o consolidado;
- **ATUALIZAR-SEGURO.bat** para atualizar (ele faz backup, verifica e
  volta atrás sozinho se algo falhar);
- **TESTAR-E2E.bat** prova a jornada das lojas com login real;
- Backup da pasta `backups\` **fora** da máquina, sempre.

> **Acesso por setor (PCP têxtil):** em Administração → Gestão de
> Usuários, o cartão "Acesso por setor" define quem visualiza, opera e
> gerencia cada central (fiação, tecelagem, malharia, tinturaria,
> beneficiamento). Sem nenhuma concessão, todos acessam todos (modo
> legado); a primeira concessão liga o modo restrito.
