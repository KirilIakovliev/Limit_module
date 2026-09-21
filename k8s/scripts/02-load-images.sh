#!/usr/bin/env bash
# ============================================================
# ШАГ 2. Выполняется НА КАЖДОМ УЗЛЕ кластера в закрытом контуре.
#
# Главное: kubelet работает с containerd, а не с Docker.
# `docker load` кладёт образ в хранилище Docker, которого kubelet
# не видит, и под остаётся в ImagePullBackOff. Импортировать нужно
# в пространство имён k8s.io утилитой ctr.
# ============================================================
set -euo pipefail

DIR="${1:-./images}"

command -v ctr >/dev/null || { echo "ctr не найден: установите containerd"; exit 1; }

echo "== проверка контрольных сумм"
( cd "$DIR" && sha256sum -c SHA256SUMS >/dev/null ) \
    || { echo "СУММЫ НЕ СОШЛИСЬ — перенос повреждён, перекладывайте заново"; exit 1; }
echo "   суммы сошлись"

echo "== сборка частей и импорт в containerd"
ls "$DIR" | sed -n 's/\.part_.*$//p' | sort -u | while read -r base; do
    echo "-- $base"
    cat "$DIR/${base}.part_"* > "/tmp/${base}"
    ctr -n k8s.io images import "/tmp/${base}"
    rm -f "/tmp/${base}"
done

echo
echo "== образы на узле:"
ctr -n k8s.io images list -q | grep -E 'kube-|etcd|coredns|pause|flannel|traefik|postgres|abb-' | sort -u
