# Backup e restauração

## Backup diário (recomendado, além do backup do provedor)
```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --schema=public -f backup_$(date +%F).dump
```
Agende via `cron` no servidor e copie os arquivos para armazenamento externo (S3, B2 etc.). Mantenha pelo menos 30 dias.

Arquivos enviados (Storage) devem ser copiados à parte, por exemplo com `supabase storage cp -r ss:///<bucket> ./storage-backup`.

## Restauração
1. Crie um projeto vazio e aplique as migrations (`supabase db push`).
2. Restaure os dados:
```bash
pg_restore --data-only --disable-triggers --no-owner -d "$DATABASE_URL" backup_AAAA-MM-DD.dump
```
3. Rode `scripts/post-install-rebind-crons.sql` se o endereço do projeto mudou.
4. Valide com `npm run setup` e um login de administrador.

Teste a restauração pelo menos uma vez por trimestre em ambiente separado.
