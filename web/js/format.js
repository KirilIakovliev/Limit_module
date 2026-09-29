/* Форматирование чисел и дат. Всё в ru-RU.
   Суммы с API приходят строкой (Decimal); Number — только для отображения. */
const Format = (() => {
  const nf = (min, max) => new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: min, maximumFractionDigits: max,
  });

  const escape = s => String(s ?? '').replace(/[&<>"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const na = () => '<span class="no-data">—</span>';

  const toNumber = v => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const currencyCode = currency => {
    const c = (currency || '').trim();
    return c || '';
  };

  const money = (v, currency) => {
    const n = toNumber(v);
    if (n == null) return na();
    const code = currencyCode(currency);
    return nf(0, 2).format(n) + (code ? `<span class="unit">${escape(code)}</span>` : '');
  };

  const rate = v => {
    const n = toNumber(v);
    if (n == null) return na();
    return nf(2, 4).format(n) + '<span class="unit">%</span>';
  };

  /* 1 234 567 890 -> «1,23 млрд RUB» — для бейджей на вкладках */
  const compact = (v, currency) => {
    const n = toNumber(v);
    if (n == null) return '—';
    const code = currencyCode(currency);
    const suffix = code ? ` ${code}` : '';
    const abs = Math.abs(n);
    if (abs >= 1e9) return nf(2, 2).format(n / 1e9) + ' млрд' + suffix;
    if (abs >= 1e6) return nf(1, 1).format(n / 1e6) + ' млн' + suffix;
    if (abs >= 1e3) return nf(0, 0).format(n / 1e3) + ' тыс.' + suffix;
    return nf(0, 2).format(n) + suffix;
  };

  /* YYYY-MM-DD без Date(): new Date('2026-04-29') сдвигается по зоне. */
  const date = iso => {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
  };

  const normalize = s => String(s).toLowerCase().replace(/[«»"'`.,]/g, '').replace(/ё/g, 'е').trim();

  const dash = v => (v == null || v === '') ? '—' : String(v);

  return { money, rate, compact, date, escape, na, normalize, dash, toNumber };
})();
