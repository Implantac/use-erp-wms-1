#!/usr/bin/env bash
# ============================================================================
# USE ERP — instalador da versão 100% LOCAL (Linux/macOS + Docker)
#   Uso: ./instalar-local.sh [--somente-local | --ip 192.168.0.10]
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

IP_DA_REDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP_DA_REDE="${2:-}"; shift 2 ;;
    --somente-local) IP_DA_REDE=""; shift ;;
    *) echo "Opção desconhecida: $1"; exit 1 ;;
  esac
done

command -v docker >/dev/null || { echo "Docker não encontrado. Instale o Docker primeiro."; exit 1; }
docker version >/dev/null 2>&1 || { echo "Docker não está rodando."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não encontrado."; exit 1; }
command -v node >/dev/null || { echo "Node >= 18 é necessário para gerar os segredos (docker/local/scripts/generate-env.mjs)."; exit 1; }

echo "==> Gerando .env.local (se necessário)..."
node docker/local/scripts/generate-env.mjs

PORTA="$(grep -E '^WEB_PORT=' .env.local | cut -d= -f2 | tr -d '[:space:]')"; PORTA="${PORTA:-8080}"

if [ -z "$IP_DA_REDE" ]; then
  IP_DA_REDE="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  [ -n "$IP_DA_REDE" ] && echo "    IP detectado desta máquina: $IP_DA_REDE (use --somente-local para ignorar / --ip para outro)"
fi
# --somente-local explícito já tratou IP vazio acima; reaplicar URL apenas se houver IP via flag/detecção manual:
# (por padrão NÃO alteramos a URL sem --ip; detecção é só informativa)

COMPOSE=(docker compose -f docker-compose.local.yml --env-file .env.local)

echo "==> Baixando imagens e construindo o frontend (primeira vez demora)..."
"${COMPOSE[@]}" up -d --build db auth rest realtime storage imgproxy functions web

echo "==> Aplicando as migrations no PostgreSQL local..."
"${COMPOSE[@]}" run --rm migrate

echo "==> Garantindo todos os serviços no ar..."
"${COMPOSE[@]}" up -d

echo "==> Testando http://localhost:${PORTA}/healthz ..."
for i in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORTA}/healthz" >/dev/null 2>&1; then
    echo
    echo "============================================================"
    echo " USE ERP LOCAL NO AR: http://localhost:${PORTA}"
    [ -n "$IP_DA_REDE" ] && echo " Na rede local (se a URL pública foi ajustada no .env.local): http://${IP_DA_REDE}:${PORTA}"
    echo " Crie a primeira conta pela tela de cadastro — ela será o admin local."
    echo "============================================================"
    exit 0
  fi
  sleep 2
done

echo "O frontend não respondeu. Veja: ${COMPOSE[*]} logs web"
exit 1
