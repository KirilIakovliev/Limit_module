"""
Модели ответов API (Pydantic v2).

Правила:
  * Все поля из витрин Optional — в DDL источника все колонки nullable.
  * Деньги / ставки (NUMERIC) сериализуются строкой без экспоненты (Money),
    чтобы не терять точность и не превращать ИНН/суммы в float.
  * Даты — ISO YYYY-MM-DD (стандартная сериализация date).
  * ИНН — всегда строка (ведущие нули).
Соответствие полей колонкам витрин — docs/database_migration.md, раздел «UI → DB Mapping».
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, PlainSerializer

Money = Annotated[Optional[Decimal], PlainSerializer(lambda v: None if v is None else format(v, "f"), return_type=Optional[str])]

StatusCode = Literal["active", "inactive", "pending", "unknown"]


# ---------------------------------------------------------------- клиенты
class ClientShort(BaseModel):
    """Строка подсказки поиска: t_lm_1_2_clients."""
    inn: str
    name: Optional[str] = None
    kpp: Optional[str] = None


class GroupRef(BaseModel):
    """Ссылка на ГК клиента: t_lm_1_2_gk_info (fallback t_lm_1_3_limits.gk_*)."""
    crm_id: str
    name: Optional[str] = None


class ClientCard(BaseModel):
    """Карточка клиента: одна строка t_lm_1_2_clients на ИНН."""
    inn: str
    name: Optional[str] = None
    code: Optional[str] = None            # uparty_code
    ogrn: Optional[str] = None
    kpp: Optional[str] = None
    address: Optional[str] = None
    okved: Optional[str] = None           # okved_code; расшифровки в DDL нет (MISSING)
    source: Optional[str] = None
    group: Optional[GroupRef] = None
    groups_found: int = 0                 # >1 — клиент в нескольких ГК (показываем первую)


# ---------------------------------------------------------------- группы
class GroupSummary(BaseModel):
    """Сводка ГК по одной валюте: t_lm_1_2_gk_info GROUP BY group_crm_id1, currency."""
    currency: Optional[str] = None
    members: int
    total_limit: Money = None             # MAX("cовокупный лимит на гк")
    total_utilized: Money = None          # MAX("утилиз-й совокупный лимит на гк")
    total_available: Money = None         # MAX("доступный совокупный лимит на гк")
    unified_limit: Money = None           # SUM("единый лимит по клиенту")
    unified_utilized: Money = None        # SUM("утилиз-й единый лимит по клиенту")
    unified_available: Money = None       # SUM("доступный единый лимит по клиенту")
    is_exceeded: bool = False             # total_utilized > total_limit


class GroupMember(BaseModel):
    inn: str
    name: Optional[str] = None            # t_lm_1_2_clients (LATERAL) или t_lm_1_3_limits.client_name
    currency: Optional[str] = None
    unified_limit: Money = None
    unified_utilized: Money = None
    unified_available: Money = None
    has_card: bool = False                # есть строка в t_lm_1_2_clients


class GroupCard(BaseModel):
    crm_id: str
    name: Optional[str] = None
    summaries: list[GroupSummary]
    members: list[GroupMember]


# ---------------------------------------------------------------- лимиты
class LimitRow(BaseModel):
    """Строка t_lm_1_3_limits (+ comment_egar из t_lm_egar_limits для ИБ)."""
    limit_id: Optional[str] = None
    owner: Optional[str] = None
    product: Optional[str] = None
    currency: Optional[str] = None
    status: Optional[str] = None          # limit_status (текст витрины)
    status_code: StatusCode = "unknown"   # производный код по префиксу limit_status
    src_status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    rate: Money = None
    lim_value: Money = None
    lim_utiled: Money = None
    rest_lim: Money = None                # из витрины, не вычисляется
    client_limits: Optional[str] = None   # текст (агрегация витрины)
    lim_top: Optional[str] = None         # текст («крышка»)
    client_raroc: Money = None
    comment: Optional[str] = None         # t_lm_egar_limits.comment_egar (только ИБ)
    is_exceeded: bool = False             # lim_utiled > lim_value


class UnifiedRow(BaseModel):
    """Единые показатели клиента по валюте: t_lm_1_2_gk_info WHERE party_inn = :inn."""
    group_crm_id: Optional[str] = None
    group_name: Optional[str] = None
    currency: Optional[str] = None
    unified_limit: Money = None
    unified_utilized: Money = None
    unified_available: Money = None


class LimitsResponse(BaseModel):
    inn: str
    client_name: Optional[str] = None
    limits: list[LimitRow]                # status_code in (active, inactive, unknown)
    applications: list[LimitRow]          # status_code == pending
    unified: list[UnifiedRow]


# ---------------------------------------------------------------- мета
class Meta(BaseModel):
    """Актуальность копии: app.load_log (БТ 2.2 / 2.5.3)."""
    updated_at: Optional[datetime] = None
    data_date: Optional[date] = None
    stale: bool = True                    # нет записи или прошло > 24 ч
    stale_after_hours: int = 24
