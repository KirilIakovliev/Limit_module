/* ============================================================
   События: отклонения, на которые стоит обратить внимание.

   Считаются на уже загруженных данных компании — отдельный запрос
   к базе не нужен. Когда правила станут настраиваемыми (пороги на
   отрасль, веса, история решений), их место — на бэкенде.

   Events.detect({indicators, limits, sublimits, reserves}) -> [событие]

   Событие: { level, title, detail, source, period }
   level: critical | warning | positive | info
   ============================================================ */
const Events = (() => {

  /* Для каких показателей рост — это хорошо, а для каких — тревожный сигнал */
  const DIRECTION = {
    'Выручка': 'up-good',
    'Чистая прибыль': 'up-good',
    'Прибыль от продаж': 'up-good',
    'Валовая прибыль': 'up-good',
    'Прибыль до налогообложения': 'up-good',
    'Денежные средства и эквиваленты': 'up-good',
    'Капитал и резервы': 'up-good',
    'Активы, всего': 'up-good',
    'Оборотные активы': 'up-good',
    'Краткосрочные обязательства': 'up-bad',
    'Долгосрочные обязательства': 'up-bad',
    'Себестоимость продаж': 'up-bad',
    'Дебиторская задолженность': 'up-bad',
    'Коммерческие и управленческие расходы': 'up-bad',
  };

  /* Пороговые значения коэффициентов */
  const RATIO_RULES = {
    'Текущая ликвидность': {
      min: 1.0, level: 'critical',
      message: v => `Текущая ликвидность ${fmt(v)} — оборотных активов не хватает на покрытие краткосрочных обязательств`,
    },
    'Коэффициент автономии': {
      min: 0.3, level: 'warning',
      message: v => `Коэффициент автономии ${fmt(v)} — доля собственных средств ниже 30%`,
    },
    'Рентабельность продаж': {
      min: 0, level: 'critical',
      message: v => `Рентабельность продаж ${fmt(v)}% — деятельность убыточна`,
    },
    'Долг / Чистая прибыль': {
      max: 5, level: 'warning',
      message: v => `Долговая нагрузка ${fmt(v)} годовых прибылей — обслуживание долга под давлением`,
    },
  };

  const SIGNIFICANT = 25;   // % отклонения, с которого показатель попадает в события
  const SEVERE = 50;        // % отклонения, считающегося резким

  /* События строятся ТОЛЬКО по текущему периоду: последний год в отчётности
     сравнивается с предыдущим и с медианой всей предыдущей истории.
     Отклонения между прошлыми годами уже отработаны и в список не попадают.
     Когда появятся квартальные и месячные данные, «текущим периодом» станет
     последний доступный срез — логика сравнения не изменится. */

  const fmt = v => Number(v).toFixed(2).replace('.', ',');
  const pct = v => Math.abs(v).toFixed(1).replace('.', ',');

  /* ---------- медиана предыдущих периодов ----------
     Сравнение с одним прошлым годом даёт ложные срабатывания, когда
     тот год сам был выбросом. Медиана всей истории устойчивее. */
  function median(values) {
    const clean = values.filter(v => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b);
    if (!clean.length) return null;
    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  }

  /* ---------- отклонения в показателях ---------- */
  function fromIndicators(data) {
    const found = [];
    const years = data.years;
    if (!years || years.length < 2) return found;

    const lastYear = years[years.length - 1];
    const prevYear = years[years.length - 2];

    data.groups.forEach(group => {
      group.rows.forEach(row => {
        const values = row.values;
        const current = values[values.length - 1];
        const previous = values[values.length - 2];

        // --- пороги для коэффициентов
        const rule = RATIO_RULES[row.label];
        if (rule && typeof current === 'number') {
          const broken = (rule.min !== undefined && current < rule.min)
                      || (rule.max !== undefined && current > rule.max);
          if (broken) {
            found.push({
              level: rule.level,
              title: row.label,
              detail: rule.message(current),
              source: group.title,
              period: String(lastYear),
              weight: rule.level === 'critical' ? 100 : 70,
            });
          }
        }

        // --- резкие изменения год к году
        if (row.kind !== 'money') return;
        if (typeof current !== 'number' || typeof previous !== 'number' || previous === 0) return;

        const changeYoY = (current - previous) / Math.abs(previous) * 100;
        if (Math.abs(changeYoY) < SIGNIFICANT) return;

        const base = median(values.slice(0, -1));
        const changeVsHistory = base ? (current - base) / Math.abs(base) * 100 : changeYoY;

        const direction = DIRECTION[row.label] || 'up-good';
        const rising = changeYoY > 0;
        const good = (direction === 'up-good') === rising;
        const severe = Math.abs(changeYoY) >= SEVERE;

        found.push({
          level: good ? 'positive' : (severe ? 'critical' : 'warning'),
          title: `${row.label}: ${rising ? 'рост' : 'снижение'} на ${pct(changeYoY)}%`,
          detail: `${prevYear} → ${lastYear}: ${Format.money(previous)} → ${Format.money(current)} тыс. ₽` +
                  (base ? `. Отклонение от медианы за ${years[0]}–${prevYear}: ${changeVsHistory > 0 ? '+' : '−'}${pct(changeVsHistory)}%` : ''),
          source: group.title,
          period: `${prevYear} → ${lastYear}`,
          weight: Math.min(Math.abs(changeYoY), 99) + (good ? 0 : 20),
        });
      });
    });

    return found;
  }

  /* ---------- лимиты: утилизация и сроки ---------- */
  function fromLimits(data) {
    const found = [];
    const soonDays = 90;
    const now = new Date();

    data.items.forEach(item => {
      const used = item.limit_amount ? item.used_amount / item.limit_amount * 100 : 0;

      if (used >= 100) {
        found.push({
          level: 'critical', title: `${item.product}: лимит выбран полностью`,
          detail: `Использовано ${Format.compact(item.used_amount)} из ${Format.compact(item.limit_amount)}`,
          source: 'Лимиты', period: 'текущий', weight: 110,
        });
      } else if (used >= 90) {
        found.push({
          level: 'warning', title: `${item.product}: утилизация ${used.toFixed(1).replace('.', ',')}%`,
          detail: `Свободный остаток ${Format.compact(item.available)}`,
          source: 'Лимиты', period: 'текущий', weight: 80,
        });
      }

      if (item.valid_until) {
        const days = Math.round((new Date(item.valid_until) - now) / 86400000);
        if (days >= 0 && days <= soonDays) {
          found.push({
            level: 'warning', title: `${item.product}: срок действия истекает`,
            detail: `Осталось ${days} дн. — до ${Format.date(item.valid_until)}`,
            source: 'Лимиты', period: Format.date(item.valid_until), weight: 85,
          });
        }
      }
    });

    return found;
  }

  /* ---------- резервы ----------
     Сигнал — высокая ставка резервирования: отношение суммы резерва
     к сумме лимита. По МСФО она выше по определению, поэтому порог
     для каждого стандарта свой. */
  const RESERVE_THRESHOLD = { rsbu: 7, ifrs: 9 };

  function fromReserves(data) {
    const items = data.items || [];
    return items
      .map(item => ({
        item,
        rate: item.limit_amount ? item.reserve_amount / item.limit_amount * 100 : 0,
      }))
      .filter(({ item, rate }) => rate >= (RESERVE_THRESHOLD[item.standard] || 10))
      .map(({ item, rate }) => ({
        level: 'warning',
        title: `Повышенная ставка резервирования: ${rate.toFixed(2).replace('.', ',')}%`,
        detail: `${item.product} — резерв ${Format.compact(item.reserve_amount)} ` +
                `при лимите ${Format.compact(item.limit_amount)}`,
        source: item.standard === 'ifrs' ? 'Резервы МСФО' : 'Резервы РСБУ',
        period: Format.date(item.calc_date),
        weight: 70 + rate,
      }));
  }

  /* ---------- сборка ---------- */
  function detect(data) {
    const all = [
      ...fromIndicators(data.indicators),
      ...fromLimits(data.limits),
      ...fromReserves(data.reserves),
    ];
    // сначала самое важное; вес учитывает и величину отклонения, и знак
    const rank = { critical: 3, warning: 2, positive: 1, info: 0 };
    all.sort((a, b) => rank[b.level] - rank[a.level] || b.weight - a.weight);
    return all;
  }

  const countBy = (list, level) => list.filter(event => event.level === level).length;

  return { detect, countBy };
})();
