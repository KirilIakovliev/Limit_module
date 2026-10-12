import { Skeleton, Switch, Tooltip } from '@mantine/core';
import { useState } from 'react';
import { useGroup, useLimits } from '../../api/hooks';
import { compactMoney, formatDay, money, rate } from './format';
import { groupByOwner, todayIso, visibleLimits, type LimitRow } from './limitsView';
import classes from './LimitsTab.module.css';

const NO_DATA = 'нет данных';

export function LimitsTab({
  query,
  group,
}: {
  query: ReturnType<typeof useLimits>;
  group: ReturnType<typeof useGroup>;
}) {
  const today = todayIso();
  const [day, setDay] = useState(today);
  const [showClosed, setShowClosed] = useState(true);
  const selected = day;

  if (query.isError) {
    return (
      <section className={classes.panel}>
        <h2>Не удалось загрузить лимиты</h2>
        <button type="button" className={classes.retry} onClick={() => void query.refetch()}>Повторить</button>
      </section>
    );
  }
  if (!query.data) return <Skeleton className={classes.bone} height={160} radius="md" />;

  const rows = visibleLimits(query.data.limits, selected, showClosed, today);
  const onDay = visibleLimits(query.data.limits, selected, true, today).length;
  const blocks = groupByOwner(rows);

  return (
    <>
      <section className={classes.panel}>
        <div className={classes.controls}>
          <label className={classes.date}>
            Дата
            <input
              type="date"
              value={selected}
              onChange={(event) => setDay(event.currentTarget.value)}
            />
          </label>
          <Switch
            classNames={{ label: classes.switchLabel }}
            size="xs"
            color="green"
            label="Показывать закрытые лимиты"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.currentTarget.checked)}
          />
        </div>
      </section>
      <section className={`${classes.panel} ${classes.rise}`} aria-label="Установленные лимиты">
        <div className={classes.head}>
          <h2>Установленные лимиты</h2>
          <p>{selected ? `Лимиты на ${formatDay(selected)}` : 'Дата не выбрана — показаны все лимиты'}</p>
        </div>
        {blocks.length ? blocks.map((block, index) => (
          <div className={classes.block} key={`${block.owner}-${index}`}>
            <h3>{block.owner}</h3>
            <LimitTable rows={block.items} />
          </div>
        )) : (
          <p className={classes.muted}>{emptyLimits(selected, query.data.limits.length, onDay)}</p>
        )}
      </section>
      <section className={`${classes.panel} ${classes.rise}`} aria-label="Единый сублимит">
        <h2>Единый сублимит</h2>
        <Aggregate group={group} />
      </section>
    </>
  );
}

function emptyLimits(day: string, total: number, onDay: number) {
  if (!day) return 'Установленных лимитов нет.';
  if (onDay === 0 && total > 0) return `На ${formatDay(day)} установленных лимитов нет. Выберите другую дату.`;
  if (onDay === 0) return `На ${formatDay(day)} установленных лимитов нет.`;
  return `На ${formatDay(day)} открытых лимитов нет. Включите показ закрытых.`;
}

function LimitTable({ rows }: { rows: LimitRow[] }) {
  return (
    <div className={classes.scroll}>
      <table className={classes.grid}>
        <thead>
          <tr>
            <th>Продукт</th>
            <th>Статус</th>
            <th>Сумма</th>
            <th>Утилизация</th>
            <th>Доступный</th>
            <th>Валюта</th>
            <th>Дата установления</th>
            <th>Дата окончания</th>
            <th>
              <Tooltip label="Орган установивший лимит" withArrow openDelay={0} position="top">
                <span className={classes.oul} tabIndex={0}>ОУЛ</span>
              </Tooltip>
            </th>
            <th>Ставка</th>
            <th>RAROC</th>
            <th>Комментарий</th>
            <th>Крышка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.limit_id ?? `${row.product}-${index}`} className={row.status_code === 'inactive' ? classes.closed : undefined}>
              <td><strong>{row.product?.trim() || '—'}</strong></td>
              <td>
                <span className={row.status_code === 'inactive' ? classes.badgeClosed : classes.badge} title={row.src_status || undefined}>
                  {row.status?.trim() || '—'}
                </span>
              </td>
              <td>{money(row.lim_value, row.currency)}</td>
              <td className={row.is_exceeded ? classes.exceeded : undefined}>{money(row.lim_utiled, row.currency)}</td>
              <td>{money(row.rest_lim, row.currency)}</td>
              <td>{row.currency?.trim() || '—'}</td>
              <td>{formatDay(row.start_date)}</td>
              <td>{formatDay(row.end_date)}</td>
              <td>{NO_DATA}</td>
              <td>{rate(row.rate)}</td>
              <td>{row.client_raroc == null || row.client_raroc === '' ? '—' : String(row.client_raroc)}</td>
              <td className={classes.wrap}>{row.comment?.trim() || '—'}</td>
              <td className={classes.wrap}>{row.lim_top?.trim() || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Aggregate({ group }: { group: ReturnType<typeof useGroup> }) {
  if (group.isError) return <p className={classes.muted}>Не удалось загрузить совокупный лимит</p>;
  if (group.isFetching && !group.data) return <Skeleton className={classes.bone} height={72} radius="md" />;
  const summaries = group.data?.summaries ?? [];
  if (!summaries.length) return <p className={classes.muted}>Нет данных группы</p>;
  return (
    <div className={classes.scroll}>
      <table className={classes.grid}>
        <thead>
          <tr>
            <th>Валюта</th>
            <th>Сумма единого лимита</th>
            <th>Единый доступный лимит</th>
            <th>Единый утилизированный лимит</th>
            <th>Совокупный лимит</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((row) => (
            <tr key={row.currency ?? '—'}>
              <td><strong>{row.currency?.trim() || '—'}</strong></td>
              <td>{compactMoney(row.unified_limit, row.currency)}</td>
              <td>{compactMoney(row.unified_available, row.currency)}</td>
              <td>{compactMoney(row.unified_utilized, row.currency)}</td>
              <td className={row.is_exceeded ? classes.exceeded : undefined}>{compactMoney(row.total_limit, row.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

