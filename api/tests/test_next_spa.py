from pathlib import Path

import pytest
from fastapi import HTTPException

from app.main import resolve_next


def test_company_refresh_returns_the_app(tmp_path: Path):
    (tmp_path / "index.html").write_text("<!doctype html>", encoding="utf-8")
    assert resolve_next(tmp_path, "company/101165625") == tmp_path / "index.html"


def test_real_asset_is_served_as_a_file(tmp_path: Path):
    asset = tmp_path / "assets" / "app.js"
    asset.parent.mkdir()
    asset.write_text("console.log(1)", encoding="utf-8")
    assert resolve_next(tmp_path, "assets/app.js") == asset


def test_missing_asset_stays_404(tmp_path: Path):
    (tmp_path / "index.html").write_text("<!doctype html>", encoding="utf-8")
    with pytest.raises(HTTPException) as caught:
        resolve_next(tmp_path, "assets/missing.js")
    assert caught.value.status_code == 404


def test_path_outside_the_build_is_rejected(tmp_path: Path):
    (tmp_path / "index.html").write_text("<!doctype html>", encoding="utf-8")
    with pytest.raises(HTTPException) as caught:
        resolve_next(tmp_path, "../index.html")
    assert caught.value.status_code == 404
