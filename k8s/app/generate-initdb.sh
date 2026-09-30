#!/usr/bin/env bash
# ============================================================
# Собирает 03-initdb-configmap.yaml только из db/local/00_extensions.sql.
#
# Витрины t_lm_* и фикстуры 90/91 на стенд не едут: их создаёт сервис сборки.
# Схема app — Job alembic, не initdb.
#
# Ограничение: суммарный размер ConfigMap — 1 МиБ (лимит etcd).
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SQL="$HERE/../../db/local/00_extensions.sql"
OUT="$HERE/03-initdb-configmap.yaml"

if [[ ! -f "$SQL" ]]; then
    echo "нет $SQL" >&2
    exit 1
fi

{
  echo "# СГЕНЕРИРОВАНО generate-initdb.sh — руками не править."
  echo "# Источник: db/local/00_extensions.sql (без DDL витрин и без 90/91)."
  echo "apiVersion: v1"
  echo "kind: ConfigMap"
  echo "metadata:"
  echo "  name: abb-initdb"
  echo "  namespace: abb"
  echo "data:"
} > "$OUT"

name=$(basename "$SQL")
size=$(wc -c < "$SQL")
echo "  ${name}: |" >> "$OUT"
sed 's/^/    /' "$SQL" >> "$OUT"
printf '  -- %-24s %6d байт\n' "$name" "$size"
echo "Готово: $OUT"
