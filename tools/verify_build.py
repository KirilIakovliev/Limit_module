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
    ("js/format.js",   "YYYY-MM-DD",             "даты без сдвига зоны"),
]

ABSENT = [
    ("js/demo-data.js", "демо-данные удалены"),
    ("js/events.js", "детектор событий удалён"),
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
    version = ""
    head = (WEB / "index.html").read_text(encoding="utf-8")
    if "?v=" in head:
        version = head.split("?v=")[1].split('"')[0]
    print(f"\nверсия ресурсов: {version or 'не задана'}")
    print("всё на месте" if not failed else f"НЕ НАЙДЕНО: {failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
