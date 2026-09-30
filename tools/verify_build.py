#!/usr/bin/env python3
"""
Проверка, что во фронтенде лежит актуальная версия после перехода на витрины.
Запуск: python3 tools/verify_build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

CHECKS = [
    ("css/styles.css", "branch-left",            "перемычка ветки «Компания»"),
    ("css/styles.css", "transition:transform",  "плавный сдвиг строк"),
    ("css/styles.css", "tr.is-exceeded",        "подсветка превышения лимита"),
    ("js/tab-tree.js", "branch-left",            "переключение стороны ветки"),
    ("js/tab-tree.js", "toggleGroup",            "ленивая загрузка ГК"),
    ("js/search-bar.js", "SearchBar",            "поисковая строка"),
    ("index.html",     "js/tab-tree.js",         "подключение модулей"),
    ("index.html",     "?v=",                    "версия ресурсов против кэша"),
    ("js/tab-tree.js", "nearEdge",               "выравнивание строк по границе"),
    ("js/tab-tree.js", "Отсутствует",            "ГК отсутствует у клиента"),
    ("js/table-views.js", "Единый лимит",        "структура группы компаний"),
    ("js/table-views.js", "Установленные лимиты", "раздел установленных лимитов"),
    ("js/table-views.js", "applicationsBlock",   "заявки на рассмотрении"),
    ("js/table-views.js", "Источник данных не подключён", "заглушки сублимитов/резервов"),
    ("css/styles.css",   "arrowPulse",           "пульсирующие стрелки первой строки"),
    ("js/tab-tree.js",   "placeArrows",          "стрелки едут вместе со строкой"),
    ("js/tab-tree.js",   "fitTopRow",            "подбор ширины верхней строки"),
    ("css/styles.css",   ".tab-pair",            "объединённый блок ИНН/КПП"),
    ("js/tab-tree.js",   "createIdentityPair",   "верхняя строка как полоса"),
    ("index.html",       "row-arrow--right",     "разметка стрелок"),
    ("css/styles.css", ".group-grid",            "сетка структуры ГК"),
    ("css/styles.css", ".go-button",             "кнопка перехода к компании"),
    ("js/table-views.js", "currentCell",          "текущая компания без клика"),
    ("js/app.js",      "Открываем карточку",     "полный цикл запроса при переходе"),
    ("js/api.js",      "/clients?",              "поиск по витрине клиентов"),
    ("js/api.js",      "/health",                "health для запасного экрана"),
    ("js/app.js",      "Витрины на отображение", "запасной экран без витрин"),
    ("js/format.js",   "YYYY-MM-DD",             "даты без сдвига зоны"),
]

ABSENT = [
    ("js/demo-data.js", "демо-данные удалены"),
]

ROOT_PRESENT = [
    ("db/local/00_extensions.sql", "локальный initdb: расширения"),
    ("db/local/10_sbox_rsk_drt_marts.sql", "локальный снимок витрин"),
    ("db/local/91_test_marts.sql", "локальные моки витрин"),
    ("api/alembic/versions/001_app_load_log.py", "Alembic: app.load_log"),
    ("api/app/wait_db.py", "ожидание БД без образа postgres"),
    ("docs/run-local.md", "локальный запуск"),
    ("docs/run-stand.md", "тестовый стенд"),
    ("helm-chart/limitmodule/Chart.yaml", "Helm-чарт"),
    ("helm-chart/limitmodule/values-stand.yaml", "values стенда"),
    ("k8s/Dockerfile.prod", "образ для стенда"),
]

ROOT_ABSENT = [
    ("db/13_app_technical.sql", "load_log больше не из initdb 13_*.sql"),
    ("docs/schema-ownership.md", "диаграммы владения схемой убраны"),
    ("k8s/app", "сырые манифесты приложения"),
    ("k8s/traefik", "Traefik уже в кластере"),
    ("k8s/cluster", "свой kubeadm не нужен"),
    ("k8s/images.txt", "перенос базовых образов не нужен"),
    ("k8s/scripts/03-build-app-image.sh", "сборка образа — команды в run-stand.md"),
    ("k8s/scripts/build-image.sh", "сборка образа — команды в run-stand.md"),
]


def main() -> int:
    failed = 0
    for rel, needle, title in CHECKS:
        path = WEB / rel
        ok = path.exists() and needle in path.read_text(encoding="utf-8")
        print(f"{'✓' if ok else '✗'}  {title}  ({rel})")
        failed += not ok
    for rel, title in ABSENT:
        gone = not (WEB / rel).exists()
        print(f"{'✓' if gone else '✗'}  {title}  ({rel})")
        failed += not gone
    for rel, title in ROOT_PRESENT:
        path = ROOT / rel
        ok = path.is_file()
        print(f"{'✓' if ok else '✗'}  {title}  ({rel})")
        failed += not ok
    for rel, title in ROOT_ABSENT:
        gone = not (ROOT / rel).exists()
        print(f"{'✓' if gone else '✗'}  {title}  ({rel})")
        failed += not gone
    chart = ROOT / "helm-chart/limitmodule"
    chart_text = ""
    if chart.is_dir():
        chart_text = "\n".join(
            p.read_text(encoding="utf-8") for p in chart.rglob("*") if p.is_file()
        )
    for needle, title, want in (
        ("hostAliases", "чарт: hostAliases", True),
        ("python -m app.wait_db", "чарт: wait на Python", True),
        ("Middleware", "чарт без Traefik Middleware", False),
        ("postgres:", "чарт без образа postgres", False),
    ):
        ok = (needle in chart_text) if want else (needle not in chart_text)
        print(f"{'✓' if ok else '✗'}  {title}")
        failed += not ok
    version = ""
    head = (WEB / "index.html").read_text(encoding="utf-8")
    if "?v=" in head:
        version = head.split("?v=")[1].split('"')[0]
    print(f"\nверсия ресурсов: {version or 'не задана'}")
    print("всё на месте" if not failed else f"НЕ НАЙДЕНО: {failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
