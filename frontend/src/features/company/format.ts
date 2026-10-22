const nf = (min: number, max: number) => new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: min,
  maximumFractionDigits: max,
});

/** Дата и время из строки API, без перевода через Date. */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}` : iso;
}

/** Календарный день YYYY-MM-DD, без Date. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
}

/**
 * Сумма строки лимита без округления. Хвостовые нули масштаба numeric отбрасываются,
 * нули между значащими цифрами сохраняются. Number не используется.
 */
function formatExact(value: string): string | null {
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '');
  const frac = (match[3] ?? '').replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const body = frac ? `${grouped},${frac}` : grouped;
  if (match[1] === '-' && body !== '0') return `-${body}`;
  return body;
}

/** Полная сумма строки лимита. Крупные суммы только группируются, доли не округляются. Валюта в строку не входит. */
export function money(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return formatExact(value) ?? '—';
}

export function rate(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${nf(2, 4).format(amount)} %`;
}

/** client_raroc — число уровня клиента, в витрине NUMERIC(15, 2). Ноль и отрицательное значение сохраняются. */
export function raroc(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return nf(2, 2).format(amount);
}
