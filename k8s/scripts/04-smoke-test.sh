#!/usr/bin/env bash
# ============================================================
# Проверка после развёртывания. Каждый шаг отвечает на отдельный
# вопрос, поэтому при поломке сразу видно, какой слой виноват.
# ============================================================
set -uo pipefail
NS="${NS:-abb}"
step() { printf '\n== %s\n' "$*"; }

step "1. Поды"
kubectl -n "$NS" get pods -o wide

step "2. База принимает соединения"
kubectl -n "$NS" exec statefulset/abb-postgres -- pg_isready -U abb -d abb

step "3. Схема на месте (ожидаем 28 компаний)"
kubectl -n "$NS" exec statefulset/abb-postgres -- \
    psql -U abb -d abb -tAc "SELECT count(*) FROM companies;"

step "4. API отвечает изнутри кластера"
kubectl -n "$NS" exec deploy/abb-api -- \
    python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health')))"

step "5. Поиск (кириллица кодируется в URL)"
kubectl -n "$NS" exec deploy/abb-api -- python -c \
"import urllib.request,urllib.parse,json
u='http://127.0.0.1:8000/api/companies?'+urllib.parse.urlencode({'q':'маг'})
print([c['name'] for c in json.load(urllib.request.urlopen(u))])"

step "6. Traefik пускает снаружи"
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
echo "   http://$NODE_IP:30080/api/health"
curl -s --max-time 5 "http://$NODE_IP:30080/api/health" \
    || echo "   НЕ ОТВЕЧАЕТ — раздел 9 руководства"

printf '\n== проверка завершена\n'
