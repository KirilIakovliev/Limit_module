#!/usr/bin/env bash
# ============================================================
# Проверка после развёртывания. База — внешняя (POSTGRES_HOST в Secret).
# ============================================================
set -uo pipefail
NS="${NS:-abb}"
step() { printf '\n== %s\n' "$*"; }

step "1. Поды"
kubectl -n "$NS" get pods -o wide

step "2. API и база (health)"
kubectl -n "$NS" exec deploy/abb-api -- \
    python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health')))"

step "3. Поиск (кириллица в URL)"
kubectl -n "$NS" exec deploy/abb-api -- python -c \
"import urllib.request,urllib.parse,json
u='http://127.0.0.1:8000/api/clients?'+urllib.parse.urlencode({'q':'рост'})
print(json.load(urllib.request.urlopen(u)))"

step "4. Traefik снаружи"
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
echo "   http://$NODE_IP:30080/api/health"
curl -s --max-time 5 "http://$NODE_IP:30080/api/health" \
    || echo "   НЕ ОТВЕЧАЕТ — раздел 9 руководства"

printf '\n== проверка завершена\n'
