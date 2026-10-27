# Piloto — Semana 1: cadastros reais (dia a dia)

Objetivo da semana: sair do "sistema instalado" para o **"sistema
pronto para operar"** — o painel **WMS → "Pronto para operar?"** sem
nenhuma pendência cadastral. Cada dia tem dono, onde clicar e o critério
de pronto. Não pule dias: a ordem é a das dependências.

> Regra da semana: **nada de dado de mentira**. Produto sem foto/mínimo
> de verdade não entra; saldo inicial é o contado, não o chutado.

## Dia 1 — Empresas e unidades (Admin, ~1h)
- [ ] Conferir a empresa-raiz (indústria): CNPJ, IE, regime, endereço
  completo — *Gestão → Empresas*;
- [ ] Conferir/criar as empresas do grupo (lojas com CNPJ próprio,
  vinculadas à raiz);
- [ ] Unidades de cada empresa: MATRIZ/CD e cada Loja (nome, tipo,
  empresa certa);
- [ ] Pronto quando: o seletor de empresas (topo) alterna entre todas
  e cada uma mostra só as suas unidades.

## Dia 2 — Usuários e papéis (Admin, ~1h)
- [ ] Um usuário por pessoa (nada de login compartilhado);
- [ ] Papel certo por pessoa: Loja, CD, gestor/fábrica, PCP de cada
  setor, compras, financeiro, fiscal;
- [ ] Cada um entra e confirma que vê **só o que é dele** (menu podado
  por nicho/papel);
- [ ] Pronto quando: "Pronto para operar?" para de acusar usuários/
  papéis e ninguém precisa da senha de outro.

## Dia 3 — Produtos de verdade (Gestor + Loja, ~2h)
- [ ] Produtos que a Loja vende de fato: nome, código, **foto**, preço,
  **estoque mínimo e máximo** por unidade;
- [ ] **NCM em todos** (o assistente fiscal mede: tem que dar 100%);
- [ ] Matérias-primas e insumos da produção (fios, tecidos, aviamentos);
- [ ] Pronto quando: a busca (Ctrl+K) acha qualquer produto pelo nome
  ou código e o detalhe mostra foto e parâmetros.

## Dia 4 — Saldos iniciais e políticas (Loja + CD, ~2h)
- [ ] Contagem física rápida do piloto (unidade piloto primeiro);
- [ ] Lançar o saldo contado (inventário) — divergência se resolve
  agora, não depois;
- [ ] **Políticas de reposição** (mínimo/máximo por produto × unidade)
  nas unidades piloto;
- [ ] Pronto quando: Fila do Dia da Loja reflete a realidade (ruptura
  onde falta, silêncio onde está ok).

## Dia 5 — Fábrica e PCP (Gestor + PCP, ~2h)
- [ ] Máquinas/teares/cubas cadastrados **no setor certo** (Produção →
  Máquinas) — é o que alimenta o Mapa de Teares e os quadros setoriais;
- [ ] Uma OP real de cada setor piloto com **perfil completo**
  (tecelagem: urdume/trama/rolo; tinturaria: cor/banho; fiação: título);
- [ ] Fornecedores principais com prazo médio (Compras);
- [ ] Pronto quando: os quadros setoriais mostram suas máquinas e a
  caixa de entrada da Fábrica está vazia (nada decidível pendente).

## Fechamento da semana (Admin + Gestor, 30 min)
- [ ] **VERIFICAR-INSTALACAO.bat** 100% PASSOU;
- [ ] **"Pronto para operar?"** sem itens vermelhos de cadastro
  (fiscal pode ficar amarelo/vermelho até o cliente do provedor —
  registrado, não é falha da semana);
- [ ] **VERIFICAR-LOJAS.bat** conferido;
- [ ] Treinamentos por papel agendados (ver `TREINAMENTO-POR-PAPEL.md`);
- [ ] Backup da pasta `backups\` copiado para fora da máquina.

**Semana 2 em diante:** operar só pelo sistema, seguindo o
`PILOTO-30-DIAS.md` (rituais diários) e registrando todo problema com
data, papel, tela e print — é dessa lista que sai a correção semanal.

> **Acesso por setor (PCP têxtil):** em Administração → Gestão de
> Usuários, o cartão "Acesso por setor" define quem visualiza, opera e
> gerencia cada central (fiação, tecelagem, malharia, tinturaria,
> beneficiamento). Sem nenhuma concessão, todos acessam todos (modo
> legado); a primeira concessão liga o modo restrito.
