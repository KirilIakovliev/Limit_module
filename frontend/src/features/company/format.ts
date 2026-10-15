const nf = (min: number, max: number) => new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: min,
  maximumFractionDigits: max,
});

/** Отображение денежной строки API. Number только для компактной подписи, как в старом format.js. */
export function compactMoney(value: string | null | undefined, currency?: string | null): string {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const suffix = currency?.trim() ? ` ${currency.trim()}` : '';
  const abs = Math.abs(amount);
  if (abs >= 1e9) return `${nf(2, 2).format(amount / 1e9)} млрд${suffix}`;
  if (abs >= 1e6) return `${nf(1, 1).format(amount / 1e6)} млн${suffix}`;
  if (abs >= 1e3) return `${nf(0, 0).format(amount / 1e3)} тыс.${suffix}`;
  return `${nf(0, 2).format(amount)}${suffix}`;
}

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

/** Полная сумма строки лимита, как Format.money в старом прототипе. */
export function money(value: string | null | undefined, currency?: string | null): string {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const code = currency?.trim();
  return `${nf(0, 2).format(amount)}${code ? ` ${code}` : ''}`;
}

export function rate(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${nf(2, 4).format(amount)} %`;
}
