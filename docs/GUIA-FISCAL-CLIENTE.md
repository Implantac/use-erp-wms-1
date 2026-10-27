# Guia fiscal do cliente — configure você mesmo (sem suporte)

Cada empresa emite com **o seu** CNPJ, **o seu** certificado e **a sua**
conta no provedor fiscal. Este guia é para o responsável da empresa:
nenhum passo precisa de programador.

## Antes de começar (fora do sistema)
1. **Contrate um provedor fiscal** (sugestão: Focus NFe). É ele quem fala
   com a SEFAZ por você. O plano e o pagamento são entre você e ele.
2. **Compre/renove o certificado digital A1** da empresa (arquivo .pfx) —
   é a "assinatura" da empresa. Guarde a senha.
3. No painel do provedor: cadastre a sua empresa (CNPJ, Inscrição
   Estadual, regime) e **envie o certificado A1** quando ele pedir.
4. No painel do provedor, gere o **token de API** e copie (você vai colar
   uma única vez no sistema, no passo 2 do assistente).
5. Se vende no balcão (NFC-e), peça ao provedor o **CSC** da sua UF.

## No sistema: Fiscal → NF-e → "Assistente fiscal da empresa"
- **Passo 1 — Provedor:** escolha quem você contratou e o ambiente
  (comece por **Homologação**, que é o ambiente de testes da SEFAZ).
- **Passo 2 — Certificado e acesso:** informe a **validade** do A1 (o
  arquivo fica no provedor, não aqui) e cole o **token**. O token vai
  para um cofre: ninguém consegue ler de volta pela tela — nem você.
- **Passo 3 — Testes na SEFAZ:** pelo provedor, transmita em homologação
  uma venda, uma devolução e um cancelamento. Deu "autorizado" nos três?
  Marque no assistente e clique em **Registrar homologação aprovada**.
- **Passo 4 — Revisão e liberação:** o assistente mostra uma lista
  verde/vermelha do que falta (CNPJ, IE, regime, certificado, token,
  produtos com NCM). Tudo verde → marque **Liberar emissão** e salve.

## Depois de liberar
- As notas entram na **fila oficial** e o transmissor envia ao provedor
  com o token do cofre. Acompanhe em **Fiscal → Dashboard** (monitor).
- Para **desligar** a qualquer momento: desmarque "Liberar emissão" e
  salve. Nada novo é emitido; o que já foi autorizado não muda.
- Certificado vencendo? O painel "Pronto para operar?" e o assistente
  apontam a validade — renove no provedor e atualize a data aqui.

## Perguntas frequentes
- **Preciso de um certificado por empresa?** Sim: um A1 por CNPJ emissor.
- **Quem paga o provedor?** A sua empresa, direto com ele.
- **O token vazou?** Gere outro no provedor e cole no passo 2 (o novo
  substitui o antigo).
- **A nota foi rejeitada?** O monitor mostra o motivo da SEFAZ (quase
  sempre cadastro: NCM, CFOP ou endereço). Corrija e reenvie.
- **Posso testar sem valer?** Sim: ambiente de homologação não tem valor
  fiscal — é para isso que ele existe. Só troque para Produção depois
  dos testes aprovados.
