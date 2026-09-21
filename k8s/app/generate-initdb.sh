#!/usr/bin/env bash
# ============================================================
# Собирает 03-initdb-configmap.yaml из db/*.sql.
#
# В Compose каталог db монтировался в /docker-entrypoint-initdb.d
# напрямую. В кластере тома с рабочей папки нет, поэтому SQL
# приходится класть в ConfigMap.
#
# Ограничение: суммарный размер ConfigMap — 1 МиБ (лимит etcd).
# Скрипт проверяет и предупреждает.
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DB_DIR="$HERE/../../db"
OUT="$HERE/03-initdb-configmap.yaml"

{
  echo "# СГЕНЕРИРОВАНО generate-initdb.sh — руками не править."
  echo "# Источник: db/*.sql. Пересобрать после любой правки миграций."
  echo "apiVersion: v1"
  echo "kind: ConfigMap"
  echo "metadata:"
  echo "  name: abb-initdb"
  echo "  namespace: abb"
  echo "data:"
} > "$OUT"

total=0
for sql in "$DB_DIR"/*.sql; do
    name=$(basename "$sql")
    size=$(wc -c < "$sql")
    total=$((total + size))
    echo "  ${name}: |" >> "$OUT"
    # Отступ в 4 пробела — требование блочного скаляра YAML
    sed 's/^/    /' "$sql" >> "$OUT"
    printf '  -- %-24s %6d байт\n' "$name" "$size"
done

printf '\nИтого SQL: %d байт (лимит ConfigMap ~1048576)\n' "$total"
if [ "$total" -gt 900000 ]; then
    echo "ВНИМАНИЕ: близко к лимиту etcd. Переносите миграции в образ"
    echo "и применяйте их Job-ом, а не через initdb."
fi
echo "Готово: $OUT"
