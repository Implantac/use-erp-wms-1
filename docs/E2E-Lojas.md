# E2E — Jornada das lojas (como rodar)

Teste automatizado que faz, **com login e permissões reais** (não é
atalho de banco): a Loja pede 5 → o gestor vê na caixa de entrada da
Fábrica → decide pelo CD → o CD expede → a Loja recebe 4 → o sistema
registra **divergência** e o saldo da Loja sobe 4.

## Como rodar
1. Stack no ar (`INICIAR-SISTEMA.bat`) e seeds do grupo aplicados
   (`PREPARAR-GRUPO-ZIPO.bat`, `PREPARAR-LOJAS-TEXAS.bat`);
2. Rode `TESTAR-E2E.bat`. Se o `.env.e2e` não existir, ele chama
   `preparar-e2e-lojas.ps1`, que cria os usuários de homologação
   (seed `seed-e2e-lojas.sql`, idempotente), descobre um produto com
   saldo ≥ 5 no CD e as unidades Loja/CD e **gera o `.env.e2e` pronto**.
   Para regenerar depois, rode `PREPARAR-E2E-Lojas.bat`.

Usuários de homologação (somente ambiente local):

| Usuário | Senha | Papel |
|---|---|---|
| `loja@texasfarm.example.com` | `E2eLoja@2026` | operador da Loja (pede) |
| `gestor@zipo.example.com` | `E2eGestor@2026` | admin do grupo (vê a Fábrica, decide, expede) |

## Modelo do `.env.e2e`
```
VITE_SUPABASE_URL=http://localhost:8080
VITE_SUPABASE_PUBLISHABLE_KEY=<chave anon do .env.local>
E2E_STORE_EMAIL=loja@texasfarm.example.com
E2E_STORE_PASSWORD=<senha do usuário da Loja>
E2E_MANAGER_EMAIL=<e-mail do gestor>
E2E_MANAGER_PASSWORD=<senha do gestor>
E2E_PRODUCT_ID=<id de um produto com saldo no CD>
E2E_STORE_BRANCH_ID=<id da unidade da Loja>
E2E_CD_BRANCH_ID=<id da unidade do CD com saldo>
```
Os IDs aparecem nas telas de cadastro (ou peça pelo
`VERIFICAR-LOJAS.bat`). Sem o `.env.e2e`, o teste é **ignorado com
aviso** — ele nunca inventa massa de dados no banco operacional.

> Primeira execução na sua máquina é a validação do próprio teste:
> se alguma etapa falhar, a mensagem diz qual (login, inbox, decisão,
> transição ou saldo). Me mande a saída que eu corrijo.
