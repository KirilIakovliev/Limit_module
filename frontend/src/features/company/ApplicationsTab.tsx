import { Skeleton } from '@mantine/core';
import { useLimits } from '../../api/hooks';
import { formatDay, money } from './format';
import classes from './ApplicationsTab.module.css';

const MISSING = 'нет в витрине';

export function ApplicationsTab({ query }: { query: ReturnType<typeof useLimits> }) {
  if (query.isError) {
    return (
      <section className={classes.panel}>
        <h2>Не удалось загрузить заявки</h2>
        <button type="button" className={classes.retry} onClick={() => void query.refetch()}>Повторить</button>
      </section>
    );
  }
  if (!query.data) return <Skeleton className={classes.bone} height={120} radius="md" />;

  const rows = query.data.applications;
  return (
    <section className={`${classes.panel} ${classes.rise}`} aria-label="Потенциальные сделки">
      <h2>Потенциальные сделки</h2>
      {rows.length ? (
        <div className={classes.scroll}>
          <table className={classes.grid}>
            <thead>
              <tr>
                <th>Статус</th>
                <th>Сумма</th>
                <th>Валюта</th>
                <th>Продукт</th>
                <th>Дата начала</th>
                <th>Дата окончания</th>
                <th>Владелец</th>
                <th title={MISSING}>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.limit_id ?? `${row.product}-${index}`}>
                  <td><span className={classes.badge}>{row.status?.trim() || '—'}</span></td>
                  <td>{money(row.lim_value, row.currency)}</td>
                  <td>{row.currency?.trim() || '—'}</td>
                  <td>{row.product?.trim() || '—'}</td>
                  <td>{formatDay(row.start_date)}</td>
                  <td>{formatDay(row.end_date)}</td>
                  <td>{row.owner?.trim() || '—'}</td>
                  <td className={classes.missing} title={MISSING}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={classes.muted}>Заявок на рассмотрении нет.</p>
      )}
    </section>
  );
}
