#!/usr/bin/env bash
# Что на самом деле отдаёт запущенный контейнер.
# Запуск: bash tools/check_deploy.sh [адрес]
HOST="${1:-http://localhost:8000}"

echo "== 1. файлы внутри контейнера =="
docker compose exec -T api ls /srv/web/js 2>/dev/null || echo "  контейнер api не запущен"

echo
echo "== 2. какие скрипты подключает отданный index.html =="
curl -s "$HOST/" | grep -o 'js/[a-z-]*\.js' | sort -u

echo
echo "== 3. версия ресурсов =="
curl -s "$HOST/" | grep -o 'v=[0-9a-z-]*' | head -1

echo
echo "== 4. признаки новой вёрстки в styles.css =="
CSS=$(curl -s "$HOST/css/styles.css")
for marker in branch-left branch-right elbow-offset tab-flag event--critical; do
    printf '  %-18s %s\n' "$marker" "$(grep -qc "$marker" <<< "$CSS" && echo да || echo НЕТ)"
done

echo
echo "Если в п.2 есть tab-tree.js и в п.4 всюду «да» — сервер отдаёт новую версию,"
echo "и старый вид на экране означает кэш браузера: Cmd/Ctrl + Shift + R."
echo "Если там search.js/tree.js — docker compose запущен из папки со старыми файлами."
