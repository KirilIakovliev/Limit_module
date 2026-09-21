/* Форматирование чисел и дат. Всё в ru-RU. */
const Format = (() => {
  const nf = (min, max) => new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: min, maximumFractionDigits: max,
  });

  const na    = () => '<span class="no-data">—</span>';
  const money = v => v == null ? na() : nf(0, 0).format(Math.round(v));
  const pct   = v => v == null ? na() : nf(1, 1).format(v) + '<span class="unit">%</span>';
  const ratio = v => v == null ? na() : nf(2, 2).format(v);
  const rub   = v => v == null ? na() : nf(0, 0).format(Math.round(v)) + '<span class="unit">₽</span>';

  /* 1 234 567 890 -> «1,23 млрд ₽» — для бейджей на вкладках */
  const compact = v => {
    if (v == null) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return nf(2, 2).format(v / 1e9) + ' млрд ₽';
    if (abs >= 1e6) return nf(1, 1).format(v / 1e6) + ' млн ₽';
    if (abs >= 1e3) return nf(0, 0).format(v / 1e3) + ' тыс. ₽';
    return nf(0, 0).format(v) + ' ₽';
  };

  const byKind = (v, kind) =>
    kind === 'pct' ? pct(v) : kind === 'ratio' ? ratio(v) : money(v);

  const delta = (prev, cur) => {
    if (prev == null || cur == null || !isFinite(prev) || prev === 0) return na();
    const p = (cur - prev) / Math.abs(prev) * 100;
    return `<span class="delta ${p >= 0 ? 'is-up' : 'is-down'}">${p >= 0 ? '+' : '−'}${nf(1, 1).format(Math.abs(p))}%</span>`;
  };

  const date = iso => iso ? new Date(iso).toLocaleDateString('ru-RU') : '—';

  const escape = s => String(s).replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const normalize = s => String(s).toLowerCase().replace(/[«»"'`.,]/g, '').replace(/ё/g, 'е').trim();

  return { money, pct, ratio, rub, compact, byKind, delta, date, escape, na, normalize };
})();
