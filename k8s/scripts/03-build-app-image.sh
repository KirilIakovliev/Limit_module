#!/usr/bin/env bash
# ============================================================
# ШАГ 3. НА ТЕСТОВОЙ МАШИНЕ, внутри контура.
#
# Собирает образ приложения и кладёт его туда, где его увидит kubelet.
# Пакеты Python берутся из Artifactory (он доступен на чтение).
#
# Скрипт сам определяет, чем собирать:
#   nerdctl  — собирает сразу в пространство имён k8s.io, импорт не нужен
#   docker   — собирает в хранилище Docker, дальше save + ctr import
#   buildah  — собирает в OCI-архив, дальше ctr import
#
# Запуск из корня проекта:
#   bash k8s/scripts/03-build-app-image.sh 0.2.0
# ============================================================
set -euo pipefail

TAG="${1:-0.2.0}"
IMAGE="abb-limit-module:${TAG}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# Зеркало пакетов. Уточните точный путь у инфраструктуры и при
# необходимости переопределите переменными окружения.
PIP_INDEX_URL="${PIP_INDEX_URL:-https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple}"
PIP_TRUSTED_HOST="${PIP_TRUSTED_HOST:-artifactory.akbars.tech}"

cd "$ROOT"

echo "== проверка исходников"
for p in api/requirements.txt api/app web db k8s/Dockerfile.prod; do
    [ -e "$p" ] || { echo "НЕТ: $p — запускайте из корня проекта"; exit 1; }
done
echo "   на месте"

echo "== проверка доступности зеркала пакетов"
if curl -sSf -o /dev/null --max-time 10 "${PIP_INDEX_URL}/fastapi/"; then
    echo "   $PIP_INDEX_URL отвечает"
else
    echo "   ВНИМАНИЕ: $PIP_INDEX_URL недоступен."
    echo "   Уточните путь к зеркалу PyPI и передайте его так:"
    echo "     PIP_INDEX_URL=https://.../simple bash $0 $TAG"
    exit 1
fi

# Проверка, что базовый образ на месте: собирать не из чего, если его нет
echo "== проверка базового образа python:3.12-slim"
if ctr -n k8s.io images list -q 2>/dev/null | grep -q 'python:3.12-slim'; then
    echo "   есть в containerd (k8s.io)"
else
    echo "   ВНИМАНИЕ: python:3.12-slim не найден в containerd."
    echo "   Загрузите его: bash k8s/scripts/02-load-images.sh ./images"
fi

BUILD_ARGS=(
    --build-arg "PIP_INDEX_URL=${PIP_INDEX_URL}"
    --build-arg "PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST}"
    -f k8s/Dockerfile.prod
    -t "$IMAGE"
    .
)

if command -v nerdctl >/dev/null; then
    echo "== сборка nerdctl (сразу в namespace k8s.io)"
    # --namespace k8s.io кладёт образ туда же, откуда его берёт kubelet:
    # отдельный импорт не нужен
    sudo nerdctl --namespace k8s.io build "${BUILD_ARGS[@]}"

elif command -v docker >/dev/null; then
    echo "== сборка docker"
    docker build "${BUILD_ARGS[@]}"
    echo "== перенос образа из Docker в containerd"
    # Docker и containerd — разные хранилища. Без этого шага
    # под встанет в ImagePullBackOff при формально собранном образе.
    docker save "$IMAGE" | sudo ctr -n k8s.io images import -

elif command -v buildah >/dev/null; then
    echo "== сборка buildah"
    buildah bud \
        --build-arg "PIP_INDEX_URL=${PIP_INDEX_URL}" \
        --build-arg "PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST}" \
        -f k8s/Dockerfile.prod -t "$IMAGE" .
    buildah push "$IMAGE" "oci-archive:/tmp/${IMAGE//[:\/]/_}.tar"
    sudo ctr -n k8s.io images import "/tmp/${IMAGE//[:\/]/_}.tar"
    rm -f "/tmp/${IMAGE//[:\/]/_}.tar"

else
    echo "НЕ НАЙДЕН ИНСТРУМЕНТ СБОРКИ (nerdctl, docker, buildah)."
    echo "Варианты:"
    echo "  1. поставить nerdctl из Artifactory — он работает поверх уже"
    echo "     установленного containerd, отдельный демон не нужен;"
    echo "  2. собрать образ на другой машине контура и перенести файлом;"
    echo "  3. развернуть без сборки — см. раздел 6.4 руководства."
    exit 1
fi

echo
echo "== проверка, что kubelet увидит образ"
sudo ctr -n k8s.io images list -q | grep "abb-limit-module" || {
    echo "ОБРАЗА НЕТ в namespace k8s.io — под не запустится"; exit 1; }

echo
echo "Готово: $IMAGE"
echo "Дальше: подставьте тег в k8s/app/06-api.yaml и примените манифесты."
