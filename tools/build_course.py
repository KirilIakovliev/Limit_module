#!/usr/bin/env python3
"""
Собирает курс из markdown в один HTML-файл с работающими кнопками «Показать ответ».

Зачем: часть просмотрщиков markdown не выполняет HTML внутри документа, и блоки
<details> показываются как текст. В HTML они работают везде.

    python3 tools/build_course.py       -> course.html
"""
import html
import re
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "course"
OUT = ROOT / "course.html"

ORDER = [
    ("README.md", "О курсе"),
    ("01-архитектура.md", "1. Архитектура"),
    ("02-интерфейс.md", "2. Интерфейс"),
    ("03-база-данных.md", "3. База данных"),
    ("04-фронтенд.md", "4. Фронтенд"),
    ("05-бэкенд.md", "5. Бэкенд"),
    ("06-развёртывание.md", "6. Развёртывание"),
    ("07-всё-вместе.md", "7. Всё воедино"),
]

DETAILS = re.compile(
    r"<details>\s*\n<summary>(?P<title>.*?)</summary>\s*\n(?P<body>.*?)\n</details>",
    re.S,
)


def convert(text: str, md: markdown.Markdown) -> str:
    """Ответы конвертируются отдельно: иначе markdown внутри <details> не разбирается."""
    answers = []

    def stash(match: re.Match) -> str:
        md.reset()
        answers.append((match.group("title"), md.convert(match.group("body").strip())))
        return f"\n\nANSWERPLACEHOLDER{len(answers) - 1}\n\n"

    md.reset()
    body = md.convert(DETAILS.sub(stash, text))

    body = wrap_demos(body)

    for index, (title, answer) in enumerate(answers):
        block = (
            f'<details class="answer">'
            f'<summary>{html.escape(title)}</summary>'
            f'<div class="answer-body">{answer}</div>'
            f"</details>"
        )
        body = body.replace(f"<p>ANSWERPLACEHOLDER{index}</p>", block)
    return body


def wrap_demos(html_body: str) -> str:
    """Оборачивает блоки «Демонстрация» в рамку: от их заголовка до следующего h2/h3."""
    parts = re.split(r'(<h3[^>]*>Демонстрация:)', html_body)
    if len(parts) == 1:
        return html_body
    out = [parts[0]]
    for i in range(1, len(parts), 2):
        chunk = parts[i] + parts[i + 1]
        stop = re.search(r'<h[23][ >]', chunk[len(parts[i]):])
        cut = len(parts[i]) + stop.start() if stop else len(chunk)
        out.append(f'<div class="demo">{chunk[:cut]}</div>{chunk[cut:]}')
    return "".join(out)


STYLE = """
:root{--ink:#0F1D2B;--ink-2:#44586C;--ink-3:#8496A8;--line:#E2E8EF;--line-2:#F2F6FA;
      --navy:#123A63;--blue:#2A6CA8;--tint:#EFF5FB;--amber:#B7791F}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink-2);
     font:16px/1.65 -apple-system,"Segoe UI",Roboto,sans-serif}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1400px;margin:0 auto}
nav{position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto;
    padding:28px 20px;border-right:1px solid var(--line);background:var(--line-2)}
nav h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);margin:0 0 14px}
nav a{display:block;padding:7px 10px;margin-bottom:2px;border-radius:8px;
      color:var(--ink-2);text-decoration:none;font-size:14.5px}
nav a:hover{background:#fff;color:var(--navy)}
main{padding:40px 48px 120px;min-width:0}
h1{font-size:30px;line-height:1.25;color:var(--ink);letter-spacing:-.02em;margin:56px 0 20px;
   padding-top:12px;border-top:2px solid var(--line)}
h1:first-child{margin-top:0;border-top:0}
h2{font-size:22px;color:var(--ink);margin:38px 0 14px}
h3{font-size:17px;color:var(--navy);margin:26px 0 10px}
h4{font-size:15px;color:var(--ink-2);margin:20px 0 8px}
p,li{max-width:78ch}
code{background:var(--line-2);padding:2px 6px;border-radius:5px;font-size:14px;
     font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--navy)}
pre{background:#0F1D2B;color:#E4ECF4;padding:16px 18px;border-radius:12px;overflow-x:auto;
    font-size:13.5px;line-height:1.55}
pre code{background:none;color:inherit;padding:0;font-size:13.5px}
blockquote{margin:16px 0;padding:12px 18px;border-left:3px solid var(--blue);
           background:var(--tint);border-radius:0 10px 10px 0;color:var(--ink-2);font-size:15px}
blockquote p{margin:4px 0}
table{border-collapse:collapse;margin:18px 0;font-size:14.5px;width:100%}
th,td{border:1px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top}
th{background:var(--line-2);color:var(--ink);font-weight:600}
hr{border:0;border-top:1px solid var(--line);margin:40px 0}
section h3:where(:has(+ p), :has(+ pre), :has(+ table)){scroll-margin-top:20px}
.demo{border:1px solid #DCE9F5;border-radius:14px;padding:4px 22px 18px;margin:26px 0;
      background:linear-gradient(180deg,#F7FBFE,#fff)}
.demo>h3:first-child{margin-top:16px;color:#123A63;display:flex;align-items:center;gap:8px}
.demo>h3:first-child::before{content:"▶";font-size:11px;color:#4E93C9}
details.answer{margin:10px 0 22px;max-width:78ch}
details.answer summary{
  display:inline-flex;align-items:center;gap:8px;cursor:pointer;list-style:none;
  padding:7px 16px;border-radius:999px;border:1px solid var(--line);
  background:#fff;color:var(--blue);font-size:14px;font-weight:600;user-select:none}
details.answer summary::-webkit-details-marker{display:none}
details.answer summary::before{content:"▸";font-size:12px}
details.answer[open] summary::before{content:"▾"}
details.answer summary:hover{background:var(--tint);border-color:#DCE9F5}
details.answer[open] summary{margin-bottom:10px}
.answer-body{padding:14px 18px;border-left:3px solid var(--blue);
             background:var(--tint);border-radius:0 10px 10px 0}
.answer-body p:first-child{margin-top:0}
.answer-body p:last-child{margin-bottom:0}
@media (max-width:900px){
  .layout{grid-template-columns:1fr}
  nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
  main{padding:28px 20px 80px}
}
"""


def main() -> int:
    md = markdown.Markdown(extensions=["extra", "sane_lists", "toc"])
    sections, links = [], []

    for filename, title in ORDER:
        path = COURSE / filename
        if not path.exists():
            print(f"пропущен: {filename}")
            continue
        anchor = filename.replace(".md", "")
        links.append(f'<a href="#{anchor}">{html.escape(title)}</a>')
        sections.append(f'<section id="{anchor}">{convert(path.read_text(encoding="utf-8"), md)}</section>')

    page = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Лимитный модуль АББ — курс</title>
<style>{STYLE}</style>
</head>
<body>
<div class="layout">
  <nav><h2>Содержание</h2>{''.join(links)}</nav>
  <main>{''.join(sections)}</main>
</div>
</body>
</html>"""

    OUT.write_text(page, encoding="utf-8")
    print(f"{OUT} — {len(page):,} символов, разделов {len(sections)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
