#!/usr/bin/env bash
# Testes automatizados para scripts/validate-eslint-thresholds.sh.
# Cada caso roda o validador em um subshell, captura exit code e stderr,
# e verifica:
#   - exit code esperado (0=pass, 1=fail)
#   - quando fail: que a annotation ::error:: cita o parâmetro esperado
#
# Uso: bash scripts/test-eslint-thresholds.sh
# Exit 0 se todos passarem, 1 caso contrário.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/validate-eslint-thresholds.sh"

[ -x "$VALIDATOR" ] || chmod +x "$VALIDATOR"

PASS=0
FAIL=0
FAILED_CASES=()

# run_case <name> <expected_exit> <expected_error_substr_or_-> \
#          <MIN_OVERLAP> <MIN_CROSS_OVERLAP> <MAX_SIZE_DELTA_PCT> \
#          <REQUIRE_MTIME_CONTINUITY> <REQUIRE_MTIME_CHANGED>
run_case() {
  local name="$1" expected_exit="$2" expected_substr="$3"
  local mo="$4" mco="$5" msdp="$6" rmc="$7" rmch="$8"

  local stderr_file; stderr_file="$(mktemp)"
  local actual_exit=0
  env -i PATH="$PATH" HOME="$HOME" \
    ESLINT_MIN_OVERLAP="$mo" \
    ESLINT_MIN_CROSS_OVERLAP="$mco" \
    ESLINT_MAX_SIZE_DELTA_PCT="$msdp" \
    ESLINT_REQUIRE_MTIME_CONTINUITY="$rmc" \
    ESLINT_REQUIRE_MTIME_CHANGED="$rmch" \
    bash "$VALIDATOR" >/dev/null 2>"$stderr_file" || actual_exit=$?

  local ok=true
  local reasons=""
  if [ "$actual_exit" != "$expected_exit" ]; then
    ok=false
    reasons+=" exit=$actual_exit (esperado $expected_exit);"
  fi
  if [ "$expected_exit" = "1" ] && [ "$expected_substr" != "-" ]; then
    if ! grep -q -- "$expected_substr" "$stderr_file"; then
      ok=false
      reasons+=" stderr não contém '$expected_substr';"
    fi
  fi

  if $ok; then
    PASS=$((PASS + 1))
    printf '  ✅ %s\n' "$name"
  else
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$name —$reasons")
    printf '  ❌ %s —%s\n' "$name" "$reasons"
    echo "     stderr:"
    sed 's/^/       /' "$stderr_file"
  fi
  rm -f "$stderr_file"
}

echo "▶ Casos VÁLIDOS (devem passar com exit 0):"
run_case "defaults"                    0 -    "1"      "1"      "50"   "false" "false"
run_case "zeros (mínimos)"             0 -    "0"      "0"      "0"    "false" "false"
run_case "máximos permitidos"          0 -    "100000" "100000" "1000" "true"  "true"
run_case "booleanos true"              0 -    "5"      "5"      "25"   "true"  "true"

echo ""
echo "▶ Casos INVÁLIDOS (devem falhar com exit 1):"
run_case "MIN_OVERLAP negativo"        1 "ESLINT_MIN_OVERLAP"              "-1"  "1"  "50"   "false" "false"
run_case "MIN_OVERLAP não numérico"    1 "ESLINT_MIN_OVERLAP"              "abc" "1"  "50"   "false" "false"
run_case "MIN_OVERLAP vazio"           1 "ESLINT_MIN_OVERLAP"              ""    "1"  "50"   "false" "false"
run_case "MIN_OVERLAP > 100000"        1 "ESLINT_MIN_OVERLAP"              "100001" "1" "50" "false" "false"
run_case "MIN_CROSS_OVERLAP negativo"  1 "ESLINT_MIN_CROSS_OVERLAP"        "1"   "-5" "50"   "false" "false"
run_case "MAX_SIZE_DELTA_PCT > 1000"   1 "ESLINT_MAX_SIZE_DELTA_PCT"       "1"   "1"  "1001" "false" "false"
run_case "MAX_SIZE_DELTA_PCT float"    1 "ESLINT_MAX_SIZE_DELTA_PCT"       "1"   "1"  "50.5" "false" "false"
run_case "REQUIRE_MTIME_CONTINUITY=1"  1 "ESLINT_REQUIRE_MTIME_CONTINUITY" "1"   "1"  "50"   "1"     "false"
run_case "REQUIRE_MTIME_CHANGED=yes"   1 "ESLINT_REQUIRE_MTIME_CHANGED"    "1"   "1"  "50"   "false" "yes"
run_case "REQUIRE_MTIME_CHANGED vazio" 1 "ESLINT_REQUIRE_MTIME_CHANGED"    "1"   "1"  "50"   "false" ""

echo ""
echo "──────────────────────────────────────────"
echo "Resultado: $PASS passou, $FAIL falhou"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Falhas:"
  for c in "${FAILED_CASES[@]}"; do echo "  - $c"; done
  exit 1
fi
echo "✅ Todos os testes passaram."
