#!/usr/bin/env bash
# ============================================================
# ШАГ 1. На машине С ИНТЕРНЕТОМ.
#
# Сохраняет ТОЛЬКО базовые образы. Образ приложения не собирается
# и не переносится — он будет собран на тестовой машине из
# исходников и пакетов Artifactory.
# ============================================================
set -euo pipefail

OUT="${1:-./transfer}"
CHUNK="${CHUNK:-190m}"
HERE="$(cd "$(dirname "$0")" && pwd)"
LIST="$HERE/../images.txt"

mkdir -p "$OUT/images"

echo "== загрузка базовых образов"
grep -vE '^\s*(#|$)' "$LIST" | while read -r image; do
    echo "-- pull $image"
    docker pull "$image"
done

# Каждый образ отдельным архивом: если один файл побьётся при переносе,
# перекладывать придётся только его, а не весь комплект.
echo "== сохранение и нарезка на части по $CHUNK"
grep -vE '^\s*(#|$)' "$LIST" | while read -r image; do
    name=$(echo "$image" | tr '/:' '__')
    echo "-- save $image"
    docker save "$image" | split -b "$CHUNK" - "$OUT/images/${name}.tar.part_"
done

( cd "$OUT/images" && sha256sum ./*.part_* > SHA256SUMS )

echo
echo "== готово"
du -sh "$OUT/images"
echo
echo "Перенести в контур:"
echo "  transfer/images/    базовые образы + SHA256SUMS"
echo "  k8s/                манифесты, скрипты, Dockerfile.prod"
echo "  исходники проекта   api/ web/ db/ — из них соберётся образ приложения"
echo "  kube-flannel.yml    манифест сети"
