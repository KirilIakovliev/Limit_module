/* ============================================================
   Выгрузка в ExcelExport. Каждая ветка дерева — отдельный лист:

   Компания · Баланс · Финрезультаты · Коэффициенты ·
   Лимиты · Сублимиты · Резервы

   Выгружаются все данные, загруженные по компании, независимо
   от того, какие вкладки были открыты на экране.
   ============================================================ */
const ExcelExport = (() => {
  const H = 1;   // стиль шапки
  const M = 2;   // #,##0
  const N2 = 3;  // #,##0.00
  const N1 = 4;  // 0.0
  const T = 5;   // заголовок
  const B = 6;   // жирный

  const h = v => ({ v, s: H });
  const money = v => v == null ? '' : { v: Math.round(v), s: M };
  const num2 = v => v == null ? '' : { v: Math.round(v * 100) / 100, s: N2 };
  const num1 = v => v == null ? '' : { v: Math.round(v * 10) / 10, s: N1 };

  const pctChange = (prev, cur) =>
    prev == null || cur == null || !prev ? '' : num1((cur - prev) / Math.abs(prev) * 100);

  /* ---------- Лист «Компания» ---------- */
  function companySheet(c, data, offline) {
    const lim = data.limits, sub = data.sublimits, res = data.reserves;
    const profile = data.profile || {};
    return {
      name: 'Компания',
      cols: [34, 56],
      rows: [
        [{ v: 'Лимитный модуль АББ', s: T }],
        [],
        [{ v: 'Наименование', s: B }, c.name],
        [{ v: 'ИНН', s: B }, c.inn],
        [{ v: 'КПП', s: B }, c.kpp || '—'],
        [{ v: 'ОГРН', s: B }, profile.ogrn || '—'],
        [{ v: 'Адрес', s: B }, profile.address || '—'],
        [{ v: 'ОКВЭД', s: B }, profile.okved ? `${profile.okved} — ${profile.okved_name || ''}` : '—'],
        [{ v: 'Группа компаний', s: B }, profile.group ? profile.group.name : 'Отсутствует'],
        [{ v: 'Отрасль', s: B }, c.industry || '—'],
        [],
        [{ v: 'Установленные лимиты, ₽', s: B }, money(lim.total)],
        [{ v: 'Использовано, ₽', s: B }, money(lim.used)],
        [{ v: 'Свободный остаток, ₽', s: B }, money(lim.total - lim.used)],
        [{ v: 'Сумма сублимитов, ₽', s: B }, money(sub.total)],
        [{ v: 'Сформировано резервов, ₽', s: B }, money(res.total)],
        [],
        [{ v: 'Дата выгрузки', s: B }, new Date().toLocaleString('ru-RU')],
        [{ v: 'Источник данных', s: B }, offline ? 'демо-данные (API недоступен)' : 'база данных'],
      ],
    };
  }

  /* ---------- Листы «Баланс» / «Финрезультаты» / «Коэффициенты» ---------- */
  function indicatorSheet(ind, code, name) {
    const g = ind.groups.find(x => x.code === code);
    if (!g) return null;
    const yrs = ind.years;
    const last = yrs.length - 1;

    const header = [h('Показатель'), ...yrs.map(y => h(String(y))), h(`Δ ${yrs[last]}/${yrs[last - 1]}, %`)];

    const rows = g.rows.map(r => [
      r.label,
      ...r.values.map(v => r.kind === 'money' ? money(v) : r.kind === 'pct' ? num1(v) : num2(v)),
      pctChange(r.values[last - 1], r.values[last]),
    ]);

    const unit = code === 'ratios' ? '' : ' (тыс. ₽)';
    return {
      name,
      freeze: 3,
      cols: [46, 16, 16, 16, 16, 14],
      rows: [[{ v: g.title + unit, s: T }], [], header, ...rows],
    };
  }

  /* ---------- Лист «Лимиты» ---------- */
  const STATUS_TITLES = { active: 'Активный', closed: 'Закрыт', suspended: 'Приостановлен' };

  function limitsSheet(d) {
    const rows = [];
    (d.blocks || []).forEach(block => {
      rows.push([]);
      rows.push([{ v: block.title, s: B }]);
      rows.push([h('Тип лимита'), h('Статус'), h('Валюта'), h('Сумма лимита'),
                 h('Утилизация'), h('Доступный остаток'), h('Совокупный лимит'),
                 h('«Крышка», %'), h('Действует до')]);
      block.items.forEach(item => rows.push([
        item.product, STATUS_TITLES[item.status] || item.status, item.currency,
        money(item.limit_amount), money(item.used_amount), money(item.available),
        money(item.total_limit), num1(item.utilization_cap_pct), item.valid_until || '',
      ]));
    });

    const unified = d.unified || { sublimit: d.total, utilized: d.used, available: d.total - d.used };
    rows.push([]);
    rows.push([{ v: 'Единый сублимит', s: B }]);
    rows.push([{ v: 'Единый сублимит, ₽', s: B }, money(unified.sublimit)]);
    rows.push([{ v: 'Единый доступный сублимит, ₽', s: B }, money(unified.available)]);
    rows.push([{ v: 'Единый утилизированный сублимит, ₽', s: B }, money(unified.utilized)]);

    return {
      name: 'Лимиты',
      cols: [38, 16, 10, 18, 18, 18, 18, 12, 14],
      rows: [[{ v: 'Установленные лимиты, ₽', s: T }], ...rows],
    };
  }

  /* ---------- Лист «Заявки на рассмотрении» ---------- */
  function applicationsSheet(applications) {
    if (!applications || !applications.length) return null;
    return {
      name: 'Заявки на рассмотрении',
      freeze: 3,
      cols: [38, 20, 10, 14, 20, 46],
      rows: [
        [{ v: 'Заявки на рассмотрении', s: T }], [],
        [h('Тип лимита'), h('Статус лимита'), h('Валюта'), h('Срок, мес.'),
         h('Запрошенная сумма'), h('Комментарии')],
        ...applications.map(item => [
          item.product, item.status, item.currency, item.term_months,
          money(item.amount), item.comment || '',
        ]),
      ],
    };
  }

  /* ---------- Лист «Сублимиты» ---------- */
  function sublimitsSheet(d) {
    const rows = d.items.map(x => [
      x.product, x.name, money(x.amount), money(x.used_amount), money(x.available),
      x.tenor_months, num1(x.used_amount / x.amount * 100),
    ]);
    return {
      name: 'Сублимиты',
      freeze: 3,
      cols: [38, 26, 18, 18, 18, 12, 14],
      rows: [
        [{ v: 'Сублимиты, ₽', s: T }], [],
        [h('Продукт'), h('Сублимит'), h('Сумма'), h('Использовано'), h('Доступно'), h('Срок, мес.'), h('Утилизация, %')],
        ...rows,
        [],
        [{ v: 'Итого', s: B }, '', money(d.total), money(d.used), money(d.total - d.used)],
      ],
    };
  }

  /* ---------- Лист «Группа компаний» ---------- */
  function groupSheet(group) {
    if (!group) return null;
    const rows = group.members.map(member => [
      member.name, member.inn,
      money(member.sublimit_amount), money(member.available_amount), money(member.utilized_amount),
    ]);
    return {
      name: 'Группа компаний',
      freeze: 10,
      cols: [40, 18, 26, 26, 30],
      rows: [
        [{ v: group.name, s: T }], [],
        [{ v: 'Единый лимит', s: B }],
        [{ v: 'Сумма единого лимита, ₽', s: B }, money(group.unified_limit)],
        [{ v: 'Единый доступный лимит, ₽', s: B }, money(group.available_limit)],
        [{ v: 'Единый утилизированный лимит, ₽', s: B }, money(group.utilized_limit)],
        [{ v: 'Совокупный лимит, ₽', s: B }, money(group.total_limit)],
        [{ v: '«Крышка» по утилизации, %', s: B }, num1(group.utilization_cap_pct)],
        [],
        [h('Наименование клиента'), h('ИНН'), h('Сумма единого сублимита'),
         h('Единый доступный сублимит'), h('Единый утилизированный сублимит')],
        ...rows,
      ],
    };
  }

  /* ---------- Лист «Информация о резервах» ---------- */
  function reservesSheet(d) {
    const rows = [];
    (d.blocks || []).forEach(block => {
      rows.push([]);
      rows.push([{ v: `${block.title} — ${Math.round(block.total)} ₽`, s: B }]);
      rows.push([h('Название продукта'), h('Валюта лимита'), h('Сумма лимита'),
                 h('Срок лимита, мес.'), h('Сумма резерва'), h('Ставка, %')]);
      block.items.forEach(item => rows.push([
        item.product, item.currency, money(item.limit_amount),
        item.term_months, money(item.reserve_amount),
        num2(item.limit_amount ? item.reserve_amount / item.limit_amount * 100 : 0),
      ]));
    });

    return {
      name: 'Информация о резервах',
      cols: [40, 16, 20, 18, 20, 12],
      rows: [[{ v: 'Информация о резервах, ₽', s: T }], ...rows,
             [], [{ v: 'Итого сформировано, ₽', s: B }, money(d.total)]],
    };
  }

  /* ---------- сборка и скачивание ---------- */
  function build(company, data, offline) {
    return XlsxWriter.build([
      companySheet(company, data, offline),
      groupSheet(data.profile && data.profile.group),
      indicatorSheet(data.indicators, 'balance', 'Баланс'),
      indicatorSheet(data.indicators, 'results', 'Финрезультаты'),
      indicatorSheet(data.indicators, 'ratios', 'Коэффициенты'),
      limitsSheet(data.limits),
      applicationsSheet(data.limits.applications),
      sublimitsSheet(data.sublimits),
      reservesSheet(data.reserves),
    ].filter(Boolean));
  }

  function download(company, data, offline) {
    const bytes = build(company, data, offline);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `АББ_${company.inn}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { build, download };
})();

if (typeof module !== 'undefined') module.exports = { ExcelExport };
