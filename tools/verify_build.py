#!/usr/bin/env python3
"""
Проверка, что во фронтенде действительно лежит актуальная версия.
Запуск: python3 tools/verify_build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

CHECKS = [
    ("css/styles.css", "branch-left",            "перемычка ветки «Компания»"),
    ("css/styles.css", "branch-right",           "перемычка ветки «События»"),
    ("css/styles.css", "transition:transform",  "плавный сдвиг строк"),
    ("css/styles.css", ".tab.is-active:hover",   "затемнение раскрытой вкладки"),
    ("css/styles.css", "--shadow-tab-hover",     "тень по форме вкладки"),
    ("css/styles.css", ".tab-flag",              "пометка «(в разработке)»"),
    ("css/styles.css", ".event--critical",       "стили списка событий"),
    ("js/tab-tree.js", "eventFilter",            "фильтры событий"),
    ("js/tab-tree.js", "branch-left",            "переключение стороны ветки"),
    ("js/tab-tree.js", "labelFlag",              "пометка на вкладке «События»"),
    ("js/events.js",   "countBy",                "счётчики по категориям"),
    ("js/table-views.js", "FILTER_TITLE",        "фильтруемый список событий"),
    ("js/search-bar.js", "SearchBar",            "переименованные модули"),
    ("index.html",     "js/tab-tree.js",         "подключение новых модулей"),
    ("index.html",     "?v=",                    "версия ресурсов против кэша"),
    ("js/tab-tree.js", "nearEdge",               "выравнивание строк по границе"),
    ("css/styles.css", "--marker-gutter",        "поля под черту-указатель"),
    ("js/tab-tree.js", "Отсутствует",            "ГК отсутствует у клиента"),
    ("js/table-views.js", "Единый лимит",        "структура группы компаний"),
    ("js/table-views.js", "Установленные лимиты", "раздел установленных лимитов"),
    ("js/table-views.js", "applicationsBlock",   "заявки на рассмотрении"),
    ("js/demo-data.js",  "INVESTMENT",           "инвестиционный блок в демо-данных"),
    ("js/table-views.js", "reserveBlock",        "резервы РСБУ и МСФО"),
    ("css/styles.css",   "arrowPulse",           "пульсирующие стрелки первой строки"),
    ("js/tab-tree.js",   "placeArrows",          "стрелки едут вместе со строкой"),
    ("js/tab-tree.js",   "fitTopRow",            "подбор ширины верхней строки"),
    ("css/styles.css",   "is-measuring-word",    "замер по длинному слову"),
    ("css/styles.css",   ".tab-pair",            "объединённый блок ИНН/КПП"),
    ("js/tab-tree.js",   "createIdentityPair",   "верхняя строка как полоса"),
    ("index.html",       "row-arrow--right",     "разметка стрелок"),
    ("js/demo-data.js", "groupOf",               "группы в демо-данных"),
    ("css/styles.css", ".group-grid",            "сетка структуры ГК"),
    ("css/styles.css", ".go-button",             "кнопка перехода к компании"),
    ("js/table-views.js", "currentCell",          "текущая компания без клика"),
    ("js/app.js",      "Открываем карточку",     "полный цикл запроса при переходе"),
    ("css/styles.css", "branch-left .tab-branch::before",  "черта раскрытого уровня слева"),
    ("css/styles.css", "branch-right .tab-branch::before", "зеркальная черта справа"),
]

def main() -> int:
    failed = 0
    for rel, needle, title in CHECKS:
        path = WEB / rel
        ok = path.exists() and needle in path.read_text(encoding="utf-8")
        print(f"{'✓' if ok else '✗'}  {title}  ({rel})")
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
