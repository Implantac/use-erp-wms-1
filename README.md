# USE ERP v1.0.0

ERP + WMS multiempresa para varejo, indústria e distribuição: vendas, compras, estoque, WMS, produção (PCP), financeiro, fiscal e governança.

**Stack:** React 18 · Vite 5 · TypeScript · Tailwind/shadcn · TanStack Query · Supabase (Postgres + RLS, Auth, Edge Functions).

## Início rápido
```bash
npm install
cp .env.example .env      # preencha com o SEU projeto Supabase
npm run setup             # verifica Node, dependências, variáveis e conexão
npm run dev               # http://localhost:8080
```
Instalação completa (banco, funções, primeiro administrador): **[docs/INSTALL.md](docs/INSTALL.md)**.

## Documentação
| Documento | Conteúdo |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Instalação em 15 passos |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Variáveis e secrets |
| [docs/DEPLOYMENT-VPS.md](docs/DEPLOYMENT-VPS.md) | Ubuntu, Docker, Nginx, SSL |
| [docs/BACKUP.md](docs/BACKUP.md) | Backup e restauração |
| [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) | O que está pronto e o que depende de terceiros |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | Arquitetura |
| [docs/security/TENANT_MATRIX.md](docs/security/TENANT_MATRIX.md) | Isolamento multiempresa |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de versões |

## Comandos
| Comando | Função |
|---|---|
| `npm run dev` | Desenvolvimento |
| `npm run build` | Build de produção (`dist/`) |
| `npm run setup` | Verificação do ambiente (`-- --migrate` aplica migrations) |
| `npm run typecheck` / `npm test` | Tipos e testes unitários |
| `npm run e2e` | Testes ponta a ponta (Playwright) |
| `docker compose --env-file .env up -d --build` | Frontend em container |

## Estrutura
```text
src/core       autenticação, contexto empresa/unidade, layout
src/modules    telas por domínio (comercial, financeiro, fiscal, produção, wms…)
src/hooks      acesso a dados por domínio
supabase/      migrations (schema, RLS, gatilhos) e funções do servidor
scripts/       setup, utilitários e verificações de CI
docs/          documentação
```

## Licença
Ver [LICENSE](LICENSE).
