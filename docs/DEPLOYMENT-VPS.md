# Implantação em VPS (Ubuntu 22.04/24.04)

```text
Internet → Nginx (TLS) → container USE ERP (frontend estático) → Supabase (API, Auth, Postgres, Funções)
```

O frontend é estático; banco, autenticação e funções rodam no seu projeto Supabase (gerenciado ou self-hosted).

## 1. Servidor
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
sudo usermod -aG docker $USER && newgrp docker
```

## 2. Código e variáveis
```bash
git clone <seu-repositorio> /opt/use-erp && cd /opt/use-erp
cp .env.example .env && nano .env
```

## 3. Banco e funções
Siga os passos 5–11 de `docs/INSTALL.md` (de qualquer máquina com Supabase CLI).

## 4. Container
```bash
docker compose --env-file .env up -d --build
curl -f http://localhost:8080/healthz
```

## 5. Nginx + domínio + SSL
`/etc/nginx/sites-available/use-erp`:
```nginx
server {
  server_name erp.seudominio.com.br;
  location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/use-erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d erp.seudominio.com.br
```
Atualize *Site URL*/*Redirect URLs* no Supabase e o secret `ALLOWED_ORIGINS` com o domínio.

## 6. Atualização
```bash
cd /opt/use-erp && git pull
supabase db push && supabase functions deploy
docker compose --env-file .env up -d --build
```

## 7. Backup
Ver `docs/BACKUP.md`.
