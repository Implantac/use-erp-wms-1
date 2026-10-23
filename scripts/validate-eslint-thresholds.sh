#!/usr/bin/env bash
# Valida faixas dos thresholds do ESLint cache usados pelo workflow CI.
#
# Entradas (env):
#   ESLINT_MIN_OVERLAP              int [0, 100000]
#   ESLINT_MIN_CROSS_OVERLAP        int [0, 100000]
#   ESLINT_MAX_SIZE_DELTA_PCT       int [0, 1000]   (0 desabilita o check)
#   ESLINT_REQUIRE_MTIME_CONTINUITY 'true' | 'false'
#   ESLINT_REQUIRE_MTIME_CHANGED    'true' | 'false'
#
# Comportamento:
#   - Imprime tabela markdown em $GITHUB_STEP_SUMMARY (se definido).
#   - Emite ::error:: annotations no stderr para cada inválido (compatível com GH Actions).
#   - Exit 0 se tudo válido, 1 caso contrário.

set -u

ERRORS=()

is_int()  { [[ "${1:-}" =~ ^-?[0-9]+$ ]]; }
is_bool() { [[ "${1:-}" == "true" || "${1:-}" == "false" ]]; }

check_int_range() {
  local name="$1" value="${2:-}" min="$3" max="$4"
  if ! is_int "$value"; then
    ERRORS+=("$name='$value' não é inteiro válido (esperado: int em [$min, $max])")
    return
  fi
  if [ "$value" -lt "$min" ] || [ "$value" -gt "$max" ]; then
    ERRORS+=("$name=$value fora da faixa permitida [$min, $max]")
  fi
}
check_bool() {
  local name="$1" value="${2:-}"
  if ! is_bool "$value"; then
    ERRORS+=("$name='$value' não é booleano válido (esperado: 'true' ou 'false')")
  fi
}

check_int_range  "ESLINT_MIN_OVERLAP"              "${ESLINT_MIN_OVERLAP:-}"              0 100000
check_int_range  "ESLINT_MIN_CROSS_OVERLAP"        "${ESLINT_MIN_CROSS_OVERLAP:-}"        0 100000
check_int_range  "ESLINT_MAX_SIZE_DELTA_PCT"       "${ESLINT_MAX_SIZE_DELTA_PCT:-}"       0 1000
check_bool       "ESLINT_REQUIRE_MTIME_CONTINUITY" "${ESLINT_REQUIRE_MTIME_CONTINUITY:-}"
check_bool       "ESLINT_REQUIRE_MTIME_CHANGED"    "${ESLINT_REQUIRE_MTIME_CHANGED:-}"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## 🎛️ ESLint cache — Threshold validation"
    echo ""
    echo "| Parâmetro | Valor | Faixa esperada |"
    echo "|---|---|---|"
    echo "| \`ESLINT_MIN_OVERLAP\` | \`${ESLINT_MIN_OVERLAP:-}\` | int [0, 100000] |"
    echo "| \`ESLINT_MIN_CROSS_OVERLAP\` | \`${ESLINT_MIN_CROSS_OVERLAP:-}\` | int [0, 100000] |"
    echo "| \`ESLINT_MAX_SIZE_DELTA_PCT\` | \`${ESLINT_MAX_SIZE_DELTA_PCT:-}\` | int [0, 1000] (0 desabilita) |"
    echo "| \`ESLINT_REQUIRE_MTIME_CONTINUITY\` | \`${ESLINT_REQUIRE_MTIME_CONTINUITY:-}\` | true \\| false |"
    echo "| \`ESLINT_REQUIRE_MTIME_CHANGED\` | \`${ESLINT_REQUIRE_MTIME_CHANGED:-}\` | true \\| false |"
    echo ""
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "${#ERRORS[@]}" -gt 0 ]; then
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "**Erros de validação dos thresholds do ESLint cache:**"
      echo ""
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  for e in "${ERRORS[@]}"; do
    echo "::error title=Invalid ESLint cache threshold::$e" >&2
    [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- ❌ $e" >> "$GITHUB_STEP_SUMMARY"
  done
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo ""
      echo "Defina valores válidos em **Settings → Secrets and variables → Actions → Variables**"
      echo "ou via \`workflow_dispatch\` inputs. Precedência: \`vars\` > \`input\` > default."
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
fi

echo "✅ ESLint cache thresholds válidos."
exit 0
