import { useState } from 'react';
import classes from './EventsTab.module.css';

type Level = 'critical' | 'warning' | 'positive';

const FILTERS: { code: Level; label: string; note: string }[] = [
  { code: 'critical', label: 'Требуют внимания', note: 'резкие отклонения' },
  { code: 'warning', label: 'Наблюдение', note: 'умеренные изменения' },
  { code: 'positive', label: 'Положительная динамика', note: 'улучшение показателей' },
];

const LEVEL_LABEL: Record<Level, string> = {
  critical: 'Требует внимания',
  warning: 'Наблюдение',
  positive: 'Положительная динамика',
};

/** Пример списка, как в прототипе. Расчёт по отчётности компании не подключён. */
const EVENTS: { level: Level; title: string; detail: string; source: string; period: string }[] = [
  {
    level: 'critical',
    title: 'Текущая ликвидность',
    detail: 'Текущая ликвидность 0,82 — оборотных активов не хватает на покрытие краткосрочных обязательств',
    source: 'Коэффициенты',
    period: '2025',
  },
  {
    level: 'critical',
    title: 'Чистая прибыль: снижение на 61,4%',
    detail: '2024 → 2025: 12,4 млрд ₽ → 4,8 млрд ₽. Отклонение от медианы за 2021–2024: −48,2%',
    source: 'Фин. результаты',
    period: '2024 → 2025',
  },
  {
    level: 'warning',
    title: 'Коэффициент автономии',
    detail: 'Коэффициент автономии 0,21 — доля собственных средств ниже 30%',
    source: 'Коэффициенты',
    period: '2025',
  },
  {
    level: 'positive',
    title: 'Выручка: рост на 18,6%',
    detail: '2024 → 2025: 86,1 млрд ₽ → 102,1 млрд ₽',
    source: 'Фин. результаты',
    period: '2024 → 2025',
  },
];

export function EventsTab() {
  const [filter, setFilter] = useState<Level>('critical');
  const visible = EVENTS.filter((event) => event.level === filter);
  const current = FILTERS.find((item) => item.code === filter) ?? FILTERS[0];
  const period = visible[0]?.period ?? '';

  return (
    <section className={`${classes.panel} ${classes.rise}`} aria-label="События">
      <p className={classes.notice}>Раздел в разработке. Ниже пример событий: расчёт по данным компании не подключён.</p>
      <div className={classes.filters} role="tablist" aria-label="Фильтры событий">
        {FILTERS.map((item) => {
          const count = EVENTS.filter((event) => event.level === item.code).length;
          const active = item.code === filter;
          return (
            <button
              key={item.code}
              type="button"
              role="tab"
              className={active ? classes.filterActive : classes.filter}
              aria-selected={active}
              onClick={() => setFilter(item.code)}
            >
              <span>{item.label}</span>
              <strong>{count}</strong>
              <small>{item.note}</small>
            </button>
          );
        })}
      </div>
      <h2>{current.label}</h2>
      <p className={classes.caption}>
        {visible.length ? `${visible.length} за текущий период${period ? ` · ${period}` : ''}` : 'за текущий период'}
      </p>
      {visible.length ? (
        <ul className={classes.list}>
          {visible.map((event) => (
            <li key={event.title} className={classes[event.level]}>
              <span className={classes.marker} aria-hidden="true" />
              <div>
                <div className={classes.head}>
                  <strong>{event.title}</strong>
                  <span>{LEVEL_LABEL[event.level]}</span>
                </div>
                <p>{event.detail}</p>
                <small>{event.source} · {event.period}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={classes.empty}>Событий нет.</p>
      )}
    </section>
  );
}
