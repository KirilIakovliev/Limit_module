const nf = (min: number, max: number) => new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: min,
  maximumFractionDigits: max,
});

/** Доли вроде 0,017 и 0,001 нельзя округлять до двух знаков: витрина хранит NUMERIC(..., 6). */
function fractionSpan(amount: number): { min: number; max: number } {
  const text = Object.is(amount, 0) ? '0' : amount.toFixed(6).replace(/\.?0+$/, '');
  const dot = text.indexOf('.');
  const frac = dot === -1 ? 0 : text.length - dot - 1;
  if (frac <= 2) return { min: 0, max: 2 };
  return { min: frac, max: frac };
}

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
  const span = fractionSpan(amount);
  return `${nf(span.min, span.max).format(amount)}${suffix}`;
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

/** Полная сумма строки лимита. Крупные суммы только группируются, доли не округляются. */
export function money(value: string | null | undefined, currency?: string | null): string {
  if (value == null || value === '') return '—';
  const exact = formatExact(value);
  if (exact == null) return '—';
  const code = currency?.trim();
  return `${exact}${code ? ` ${code}` : ''}`;
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
