"""Снимок OpenAPI. Импорт приложения не открывает пул БД и не запускает lifespan."""
import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
os.environ["REDIS_URL"] = ""
os.environ["WEB_DIR"] = str(root / "web")
sys.path.insert(0, str(root / "api"))

from app.main import app  # noqa: E402

out = Path(__file__).resolve().parents[1] / "openapi.json"
out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(out)
