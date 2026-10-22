import { Skeleton } from '@mantine/core';
import { useLimits } from '../../api/hooks';
import { formatDay, money } from './format';
import type { LimitRow } from './limitsView';
import classes from './ApplicationsTab.module.css';

const HEADS = ['Название продукта', 'Валюта лимита', 'Сумма лимита', 'Срок лимита', 'Сумма резерва', 'Категория качества', '% резервирования'] as const;

export function ReservesTab({ query }: { query: ReturnType<typeof useLimits> }) {
  if (query.isError) {
    return (
      <section className={classes.panel}>
        <h2>Не удалось загрузить резервы</h2>
        <button type="button" className={classes.retry} onClick={() => void query.refetch()}>Повторить</button>
      </section>
    );
  }
  if (!query.data) return <Skeleton className={classes.bone} height={120} radius="md" />;

  const rows = query.data.limits.filter((row) => row.status_code !== 'pending' && /^[A-Za-z]{3}$/.test(row.currency?.trim() ?? ''));
  return (
    <>
      {['Резервы РСБУ', 'Резервы МСФО'].map((title) => (
        <section key={title} className={`${classes.panel} ${classes.rise}`} aria-label={title}>
          <h2>{title}</h2>
          {rows.length ? (
            <div className={classes.scroll}>
              <table className={classes.grid}>
                <thead>
                  <tr>{HEADS.map((head) => <th key={head}>{head}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => <ReserveRow key={`${row.limit_id ?? row.product}-${index}`} row={row} />)}
                </tbody>
              </table>
            </div>
          ) : <p className={classes.muted}>Лимитов для показа резерва нет.</p>}
        </section>
      ))}
    </>
  );
}

function ReserveRow({ row }: { row: LimitRow }) {
  const start = row.start_date ? formatDay(row.start_date) : '';
  const end = row.end_date ? formatDay(row.end_date) : '';
  return (
    <tr>
      <td>{row.product?.trim() || '—'}</td>
      <td>{row.currency?.trim() || '—'}</td>
      <td>{money(row.lim_value)}</td>
      <td>{[start, end].filter(Boolean).join(' — ') || '—'}</td>
      <td>{money('0')}</td>
      <td>1</td>
      <td>0 %</td>
    </tr>
  );
}
