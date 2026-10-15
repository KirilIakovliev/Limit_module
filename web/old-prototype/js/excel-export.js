/* ============================================================
   Выгрузка в Excel. Листы: Компания · Группа компаний · Лимиты · Заявки.
   ИНН — текст (ведущие нули). Суммы — число, если парсятся.
   ============================================================ */
const ExcelExport = (() => {
  const H = 1;
  const M = 2;
  const N2 = 3;
  const T = 5;
  const B = 6;

  const h = v => ({ v, s: H });
  const text = v => (v == null || v === '') ? '' : String(v);
  const money = v => {
    if (v == null || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? { v: n, s: M } : String(v);
  };
  const num2 = v => {
    if (v == null || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? { v: n, s: N2 } : String(v);
  };

  function companySheet(c, data) {
    const profile = data.profile || c || {};
    const unified = (data.limits && data.limits.unified) || [];
    const unifiedRows = unified.flatMap(u => [
      [{ v: `Единый сублимит, ${u.currency || ''}`, s: B }, money(u.unified_limit)],
      [{ v: `Единый доступный, ${u.currency || ''}`, s: B }, money(u.unified_available)],
      [{ v: `Единый утилизированный, ${u.currency || ''}`, s: B }, money(u.unified_utilized)],
    ]);
    return {
      name: 'Компания',
      cols: [40, 56],
      rows: [
        [{ v: 'Лимитный модуль АББ', s: T }],
        [],
        [{ v: 'Наименование', s: B }, profile.name],
        [{ v: 'ИНН', s: B }, text(profile.inn)],
        [{ v: 'КПП', s: B }, profile.kpp || '—'],
        [{ v: 'ОГРН', s: B }, profile.ogrn || '—'],
        [{ v: 'Адрес', s: B }, profile.address || '—'],
        [{ v: 'ОКВЭД', s: B }, profile.okved || '—'],
        [{ v: 'Группа компаний', s: B }, profile.group ? profile.group.name : 'Отсутствует'],
        [],
        ...unifiedRows,
        [],
        [{ v: 'Дата выгрузки', s: B }, new Date().toLocaleString('ru-RU')],
        [{ v: 'Источник данных', s: B }, 'копия витрин DataHub'],
      ],
    };
  }

  function limitsSheet(d) {
    const rows = [
      [h('Владелец'), h('Статус'), h('Сумма'), h('Утилизация'), h('Доступный'),
       h('Валюта'), h('Дата установления'), h('Дата окончания'), h('Продукт'),
       h('Ставка'), h('Совокупный лимит'), h('RAROC'), h('Комментарий'), h('Крышка'),
       h('№ договора'), h('Дата решения')],
      ...(d.limits || []).map(item => [
        item.owner, item.status, money(item.lim_value), money(item.lim_utiled), money(item.rest_lim),
        item.currency, item.start_date || '', item.end_date || '', item.product,
        num2(item.rate), text(item.client_limits), num2(item.client_raroc),
        item.comment || '', text(item.lim_top), '—', '—',
      ]),
    ];
    return {
      name: 'Лимиты',
      cols: [28, 36, 16, 16, 16, 10, 14, 14, 28, 12, 40, 10, 36, 28, 14, 14],
      rows: [[{ v: 'Установленные лимиты', s: T }], ...rows],
    };
  }

  function applicationsSheet(applications) {
    if (!applications || !applications.length) return null;
    return {
      name: 'Заявки на рассмотрении',
      freeze: 3,
      cols: [36, 16, 10, 36, 14, 14, 24, 16],
      rows: [
        [{ v: 'Потенциальные сделки', s: T }], [],
        [h('Статус'), h('Сумма'), h('Валюта'), h('Продукт'),
         h('Дата начала'), h('Дата окончания'), h('Владелец'), h('Комментарий')],
        ...applications.map(item => [
          item.status, money(item.lim_value), item.currency, item.product,
          item.start_date || '', item.end_date || '', item.owner, '—',
        ]),
      ],
    };
  }

  function groupSheet(group) {
    if (!group) return null;
    const rows = [];
    (group.summaries || []).forEach(s => {
      rows.push([]);
      rows.push([{ v: `Единый лимит · ${s.currency || ''}`, s: B }]);
      rows.push([{ v: 'Сумма единого лимита', s: B }, money(s.unified_limit)]);
      rows.push([{ v: 'Единый доступный лимит', s: B }, money(s.unified_available)]);
      rows.push([{ v: 'Единый утилизированный лимит', s: B }, money(s.unified_utilized)]);
      rows.push([{ v: 'Совокупный лимит', s: B }, money(s.total_limit)]);
      rows.push([{ v: '«Крышка»', s: B }, 'нет данных']);
    });
    rows.push([]);
    rows.push([h('Наименование клиента'), h('ИНН'), h('Валюта'),
               h('Единый сублимит'), h('Единый доступный сублимит'),
               h('Единый утилизированный сублимит')]);
    (group.members || []).forEach(member => rows.push([
      member.name, text(member.inn), member.currency,
      money(member.unified_limit), money(member.unified_available), money(member.unified_utilized),
    ]));
    return {
      name: 'Группа компаний',
      freeze: 2,
      cols: [40, 18, 10, 22, 26, 30],
      rows: [[{ v: group.name || 'Группа компаний', s: T }], ...rows],
    };
  }

  function build(company, data) {
    return XlsxWriter.build([
      companySheet(company, data),
      groupSheet(data.groupCard || (data.profile && data.profile.groupCard)),
      limitsSheet(data.limits || { limits: [] }),
      applicationsSheet(data.limits && data.limits.applications),
    ].filter(Boolean));
  }

  function download(company, data) {
    const bytes = build(company, data);
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
