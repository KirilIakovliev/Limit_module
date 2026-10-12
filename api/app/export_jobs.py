"""Фоновая выгрузка без очереди.

Celery и Redis-воркера в проекте нет, объём — одна карточка. Runner держит
задачи в процессе и пишет файл во временный каталог. Контракт submit / view /
download можно позже отдать очереди, не меняя API.
"""
from __future__ import annotations

import logging
import re
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .export_book import Filters, load_snapshot, ordered, write_workbook

log = logging.getLogger("app.export")

MAX_ACTIVE = 2
QUEUE_LIMIT = 8
TTL_SECONDS = 15 * 60
FAILED = "Не удалось сформировать файл"
ACTIVE = {"queued", "collecting", "building"}
_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")


class ExportSection(str, Enum):
    info = "info"
    limits = "limits"
    applications = "applications"
    reserves = "reserves"


class ExportFilters(BaseModel):
    as_of: str = ""
    today: str = ""
    show_closed: bool = True

    @field_validator("as_of", "today")
    @classmethod
    def day(cls, value: str) -> str:
        value = value.strip()
        if not value:
            return ""
        if not _DAY.fullmatch(value):
            raise ValueError("ожидается дата YYYY-MM-DD")
        return value


class ExportRequest(BaseModel):
    sections: list[ExportSection] = Field(min_length=1, max_length=4)
    filters: ExportFilters = ExportFilters()

    @field_validator("sections")
    @classmethod
    def unique(cls, value: list[ExportSection]) -> list[ExportSection]:
        if len(set(value)) != len(value):
            raise ValueError("разделы повторяются")
        return value


class ExportCreated(BaseModel):
    export_id: str


class ExportStatus(BaseModel):
    export_id: str
    status: Literal["queued", "collecting", "building", "ready", "failed"]
    progress: int
    stage: str


class ExportBusy(Exception):
    pass


@dataclass
class _Job:
    id: str
    key: str
    client: dict
    sections: tuple[str, ...]
    filters: Filters
    filename: str
    status: str = "queued"
    progress: int = 0
    stage: str = "В очереди"
    path: Path | None = None
    updated: float = 0.0


@dataclass(frozen=True)
class JobView:
    export_id: str
    status: str
    progress: int
    stage: str
    path: Path | None
    filename: str


class ExportRunner:
    def __init__(self, work=None, max_active: int = MAX_ACTIVE, queue_limit: int = QUEUE_LIMIT, ttl: float = TTL_SECONDS):
        self._work = work or _run_export
        self._sem = threading.Semaphore(max_active)
        self._limit = queue_limit
        self._ttl = ttl
        self._lock = threading.Lock()
        self._jobs: dict[str, _Job] = {}
        self._active: dict[str, str] = {}
        self._dir = Path(tempfile.mkdtemp(prefix="lm-exports-"))

    def submit(self, client: dict, sections, filters: Filters) -> _Job:
        chosen = ordered(sections)
        key = _fingerprint(client["inn"], chosen, filters)
        with self._lock:
            self._sweep()
            current = self._jobs.get(self._active.get(key, ""))
            if current and current.status in ACTIVE:
                return current
            if sum(job.status in ACTIVE for job in self._jobs.values()) >= self._limit:
                raise ExportBusy
            job = _Job(
                id=str(uuid.uuid4()),
                key=key,
                client=client,
                sections=chosen,
                filters=filters,
                filename=_filename(client["inn"], filters.today or date.today().isoformat()),
                updated=time.monotonic(),
            )
            self._jobs[job.id] = job
            self._active[key] = job.id
        threading.Thread(target=self._guard, args=(job,), daemon=True, name=f"export-{job.id[:8]}").start()
        return job

    def view(self, export_id: str) -> JobView | None:
        with self._lock:
            self._sweep()
            job = self._jobs.get(export_id)
            return _view(job) if job else None

    def finish(self, export_id: str) -> None:
        with self._lock:
            job = self._jobs.pop(export_id, None)
            if job:
                self._active.pop(job.key, None)
                _unlink(job.path)

    def reset(self) -> None:
        with self._lock:
            for job in self._jobs.values():
                _unlink(job.path)
            self._jobs.clear()
            self._active.clear()

    def _guard(self, job: _Job) -> None:
        with self._sem:
            with self._lock:
                if job.id not in self._jobs:
                    return
            try:
                self._work(job, self._touch, self._dir)
            except Exception:
                log.exception("export %s failed", job.id)
                self._touch(job, status="failed", stage=FAILED)
            finally:
                with self._lock:
                    if self._active.get(job.key) == job.id and job.status not in ACTIVE:
                        self._active.pop(job.key, None)

    def _touch(self, job: _Job, **fields) -> None:
        with self._lock:
            if "progress" in fields:
                fields["progress"] = max(0, min(100, int(fields["progress"])))
            for name, value in fields.items():
                setattr(job, name, value)
            job.updated = time.monotonic()

    def _sweep(self) -> None:
        now = time.monotonic()
        expired = [
            job.id for job in self._jobs.values()
            if job.status not in ACTIVE and now - job.updated > self._ttl
        ]
        for export_id in expired:
            job = self._jobs.pop(export_id)
            self._active.pop(job.key, None)
            _unlink(job.path)


def _run_export(job: _Job, touch, directory: Path) -> None:
    touch(job, status="collecting", progress=5, stage="Подготавливаем данные")
    snap = load_snapshot(job.client, job.sections, job.filters)
    path = directory / f"{job.id}.xlsx"

    def advance(progress: int, stage: str) -> None:
        touch(job, status="building", progress=progress, stage=stage)

    try:
        write_workbook(path, snap, job.sections, advance)
    except Exception:
        _unlink(path)
        raise
    touch(job, status="ready", progress=100, stage="Готово", path=path)


def _fingerprint(inn: str, sections: tuple[str, ...], filters: Filters) -> str:
    return f"{inn}|{','.join(sections)}|{filters.as_of}|{filters.today}|{int(filters.show_closed)}"


def _filename(inn: str, day: str) -> str:
    digits = "".join(ch for ch in inn if ch.isdigit()) or "company"
    stamp = day if _DAY.fullmatch(day) else date.today().isoformat()
    return f"limit_module_{digits}_{stamp}.xlsx"


def _view(job: _Job) -> JobView:
    return JobView(job.id, job.status, job.progress, job.stage, job.path, job.filename)


def _unlink(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        log.warning("export file remains: %s", path)


runner = ExportRunner()
