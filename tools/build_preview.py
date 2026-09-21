#!/usr/bin/env python3
"""
Собирает web/index.html + css + js в один файл preview.html.

Нужен только для того, чтобы открыть прототип двойным кликом или показать
его там, где нельзя раздать папку целиком. Рабочая версия — всегда web/.

    python3 tools/build_preview.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
OUT = ROOT / "preview.html"

html = (WEB / "index.html").read_text(encoding="utf-8")

# <link rel="stylesheet" href="css/..."> -> <style>
def inline_css(m: re.Match) -> str:
    css = (WEB / m.group(1)).read_text(encoding="utf-8")
    return f"<style>\n{css}\n</style>"

html = re.sub(r'<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?">', inline_css, html)

# <script src="js/..."></script> -> <script>
def inline_js(m: re.Match) -> str:
    js = (WEB / m.group(1)).read_text(encoding="utf-8")
    return f"<script>\n{js}\n</script>"

html = re.sub(r'<script src="([^"?]+)(?:\?[^"]*)?"></script>', inline_js, html)

OUT.write_text(html, encoding="utf-8")
print(f"{OUT} — {len(html):,} символов")
