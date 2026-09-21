"""Тонкая обёртка над Redis. Если Redis недоступен — приложение работает без кэша."""
import json
import logging

log = logging.getLogger(__name__)


class Cache:
    def __init__(self, url: str | None):
        self.enabled = False
        self._r = None
        if not url:
            return
        try:
            import redis

            self._r = redis.Redis.from_url(url, socket_timeout=0.3, socket_connect_timeout=0.3)
            self._r.ping()
            self.enabled = True
        except Exception as e:  # noqa: BLE001
            log.warning("Redis недоступен, работаем без кэша: %s", e)

    def get(self, key: str):
        if not self.enabled:
            return None
        try:
            raw = self._r.get(key)
            return json.loads(raw) if raw else None
        except Exception:  # noqa: BLE001
            return None

    def set(self, key: str, value, ttl: int | None = 300) -> None:
        """ttl=None — хранить без срока (снимок справочника живёт до следующего обновления)."""
        if not self.enabled:
            return
        try:
            payload = json.dumps(value, ensure_ascii=False, default=str)
            if ttl is None:
                self._r.set(key, payload)
            else:
                self._r.setex(key, ttl, payload)
        except Exception:  # noqa: BLE001
            pass

    def drop_prefix(self, prefix: str) -> None:
        """Сбрасывает кэш после обновления справочника."""
        if not self.enabled:
            return
        try:
            for k in self._r.scan_iter(match=f"{prefix}*", count=500):
                self._r.delete(k)
        except Exception:  # noqa: BLE001
            pass
