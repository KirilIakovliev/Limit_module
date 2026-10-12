import type { components } from '../../api/schema';

export type LimitRow = components['schemas']['LimitRow'];

/** Локальный календарный день, без перевода отметки API через Date. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** На сегодня показывается снимок API. На другую дату — срок start/end. */
export function coversDate(row: LimitRow, day: string, today = ''): boolean {
  if (!day || (today !== '' && day === today)) return true;
  const start = row.start_date?.slice(0, 10) ?? '';
  const end = row.end_date?.slice(0, 10) ?? '';
  if (start && start > day) return false;
  if (end && end < day) return false;
  return true;
}

export function visibleLimits(rows: LimitRow[], day: string, showClosed: boolean, today = ''): LimitRow[] {
  return rows.filter((row) => coversDate(row, day, today) && (showClosed || row.status_code !== 'inactive'));
}

/** Как в прототипе: блок — подряд идущий owner, не слияние через другой блок. */
export function groupByOwner(rows: LimitRow[]): { owner: string; items: LimitRow[] }[] {
  const blocks: { owner: string; items: LimitRow[] }[] = [];
  for (const row of rows) {
    const owner = row.owner?.trim() || '—';
    const last = blocks[blocks.length - 1];
    if (!last || last.owner !== owner) blocks.push({ owner, items: [row] });
    else last.items.push(row);
  }
  return blocks;
}
