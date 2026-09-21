/* ============================================================
   Демо-данные. Используются, только если API недоступен
   (например, файл открыт напрямую, без Docker).
   В боевой сборке этот файл можно не подключать.
   ============================================================ */
const DemoData = (() => {
  const COMPANIES = [
    { id: 1,  name: 'Магнит',              inn: '2309085638', kpp: '230901001', industry: 'Розничная торговля' },
    { id: 2,  name: 'Магнитогорский МК',   inn: '7414003633', kpp: '745501001', industry: 'Металлургия' },
    { id: 3,  name: 'Мосэнерго',           inn: '7705035012', kpp: '770501001', industry: 'Электроэнергетика' },
    { id: 4,  name: 'Московская биржа',    inn: '7702077840', kpp: '770201001', industry: 'Финансы' },
    { id: 5,  name: 'Норильский никель',   inn: '8401005730', kpp: '840101001', industry: 'Металлургия' },
    { id: 6,  name: 'Новатэк',             inn: '6316031581', kpp: '631601001', industry: 'Нефть и газ' },
    { id: 7,  name: 'Роснефть',            inn: '7706107510', kpp: '770601001', industry: 'Нефть и газ' },
    { id: 8,  name: 'Ростелеком',          inn: '7707049388', kpp: '784001001', industry: 'Телекоммуникации' },
    { id: 9,  name: 'Северсталь',          inn: '3528000597', kpp: '352801001', industry: 'Металлургия' },
    { id: 10, name: 'Сегежа Групп',        inn: '7714487093', kpp: '771401001', industry: 'Лесная промышленность' },
    { id: 11, name: 'Сибур Холдинг',       inn: '7727547261', kpp: '772701001', industry: 'Химия и нефтехимия' },
    { id: 12, name: 'Татнефть',            inn: '1644003838', kpp: '164401001', industry: 'Нефть и газ' },
    { id: 13, name: 'Транснефть',          inn: '7706061801', kpp: '770601002', industry: 'Транспорт' },
    { id: 14, name: 'Фосагро',             inn: '7736216869', kpp: '773601001', industry: 'Химия и нефтехимия' },
    { id: 15, name: 'Аэрофлот',            inn: '7712040126', kpp: '771201001', industry: 'Авиаперевозки' },
    { id: 16, name: 'Алроса',              inn: '1433000147', kpp: '143301001', industry: 'Добыча полезных ископаемых' },
    { id: 17, name: 'Полюс',               inn: '2434000335', kpp: '243401001', industry: 'Добыча полезных ископаемых' },
    { id: 18, name: 'Позитив Текнолоджиз', inn: '7718668887', kpp: '771801001', industry: 'ИТ и разработка ПО' },
    { id: 19, name: 'Яндекс',              inn: '7736207543', kpp: '773601002', industry: 'ИТ и разработка ПО' },
    { id: 20, name: 'ММК-Метиз',           inn: '7414002238', kpp: '741401001', industry: 'Металлургия' },
    { id: 21, name: 'Балтийский терминал', inn: '7801567234', kpp: '780101001', industry: 'Транспорт' },
    { id: 22, name: 'Агроальянс Юг',       inn: '2311456789', kpp: '231101001', industry: 'Сельское хозяйство' },
    { id: 23, name: 'Стройпуть',           inn: '5407123456', kpp: '540701001', industry: 'Строительство' },
    { id: 24, name: 'Дальресурс',          inn: '2540987654', kpp: '254001001', industry: 'Добыча полезных ископаемых' },
    // длинные наименования — проверка ширины карточек верхней строки
    { id: 25, name: 'Российские железные дороги', inn: '7708503727', kpp: '770801001', industry: 'Транспорт' },
    { id: 26, name: 'Объединённая судостроительная корпорация', inn: '7838395215', kpp: '783801001', industry: 'Судостроение' },
    { id: 27, name: 'Новолипецкий металлургический комбинат', inn: '4823006703', kpp: '482301001', industry: 'Металлургия' },
    { id: 28, name: 'Межрегиональная распределительная сетевая компания Центра', inn: '6901067107', kpp: '690101001', industry: 'Электроэнергетика' },
  ];

  /* детерминированный ГПСЧ, чтобы одна компания всегда давала те же цифры */
  const rng = seed => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  const search = query => {
    const n = Format.normalize(query);
    return COMPANIES
      .map(c => ({ c, i: Format.normalize(c.name).indexOf(n), j: c.inn.indexOf(n) }))
      .filter(x => x.i > -1 || x.j > -1)
      .sort((a, b) => (a.i > -1 ? a.i : 99) - (b.i > -1 ? b.i : 99))
      .slice(0, 8)
      .map(x => x.c);
  };

  const indicators = id => {
    const r = rng(id * 7919), years = [2021, 2022, 2023, 2024];
    const scale = 8e6 * (0.2 + r() * 3);
    const rev = [], cost = [], sell = [], assets = [], equity = [], lt = [], cash = [], inv = [], recv = [];
    let base = scale;
    years.forEach(() => {
      base *= 0.94 + r() * 0.26;
      rev.push(base);
      cost.push(base * (0.60 + r() * 0.15));
      sell.push(base * (0.05 + r() * 0.05));
      const a = base * (0.8 + r() * 0.9);
      assets.push(a);
      equity.push(a * (0.34 + r() * 0.20));
      lt.push(a * (0.10 + r() * 0.12));
      cash.push(a * (0.04 + r() * 0.05));
      inv.push(a * (0.08 + r() * 0.09));
      recv.push(a * (0.12 + r() * 0.11));
    });
    const gross = rev.map((v, i) => v - cost[i]);
    const op = gross.map((v, i) => v - sell[i]);
    const pretax = op.map(v => v * 0.92);
    const net = pretax.map(v => v * 0.8);
    const cur = assets.map((a, i) => cash[i] + inv[i] + recv[i]);
    const noncur = assets.map((a, i) => a - cur[i]);
    const st = assets.map((a, i) => a - equity[i] - lt[i]);

    return {
      years, unit: 'тыс. ₽',
      groups: [
        { code: 'balance', title: 'Бухгалтерский баланс', rows: [
          { label: 'Активы, всего', kind: 'money', values: assets },
          { label: 'Внеоборотные активы', kind: 'money', values: noncur },
          { label: 'Оборотные активы', kind: 'money', values: cur },
          { label: 'Запасы', kind: 'money', values: inv },
          { label: 'Дебиторская задолженность', kind: 'money', values: recv },
          { label: 'Денежные средства и эквиваленты', kind: 'money', values: cash },
          { label: 'Капитал и резервы', kind: 'money', values: equity },
          { label: 'Долгосрочные обязательства', kind: 'money', values: lt },
          { label: 'Краткосрочные обязательства', kind: 'money', values: st },
        ]},
        { code: 'results', title: 'Финансовые результаты', rows: [
          { label: 'Выручка', kind: 'money', values: rev },
          { label: 'Себестоимость продаж', kind: 'money', values: cost },
          { label: 'Валовая прибыль', kind: 'money', values: gross },
          { label: 'Коммерческие и управленческие расходы', kind: 'money', values: sell },
          { label: 'Прибыль от продаж', kind: 'money', values: op },
          { label: 'Прибыль до налогообложения', kind: 'money', values: pretax },
          { label: 'Чистая прибыль', kind: 'money', values: net },
        ]},
        { code: 'ratios', title: 'Коэффициенты', rows: [
          { label: 'Рентабельность продаж', kind: 'pct', values: net.map((v, i) => v / rev[i] * 100) },
          { label: 'Рентабельность активов', kind: 'pct', values: net.map((v, i) => v / assets[i] * 100) },
          { label: 'Рентабельность капитала', kind: 'pct', values: net.map((v, i) => v / equity[i] * 100) },
          { label: 'Текущая ликвидность', kind: 'ratio', values: cur.map((v, i) => v / st[i]) },
          { label: 'Коэффициент автономии', kind: 'ratio', values: equity.map((v, i) => v / assets[i]) },
          { label: 'Долг / Чистая прибыль', kind: 'ratio', values: lt.map((v, i) => (v + st[i]) / net[i]) },
        ]},
      ],
    };
  };

  const CORPORATE = ['Возобновляемая кредитная линия', 'Овердрафт', 'Банковские гарантии',
                     'Аккредитивы', 'Торговое финансирование'];
  const INVESTMENT = ['Синдицированный кредит', 'Проектное финансирование'];

  const APPLICATIONS = [
    ['Возобновляемая кредитная линия', 24, 'Ожидается решение кредитного комитета'],
    ['Банковские гарантии', 12, 'Запрошены уточнения по обеспечению'],
    ['Проектное финансирование', 60, 'На рассмотрении инвестиционного блока'],
  ];

  const limits = id => {
    const r = rng(id * 104729);

    const makeItems = (products, block) => products.map((product, i) => {
      const limit_amount = 1e6 + r() * 999e6;
      const used_amount = limit_amount * (0.15 + r() * 0.7);
      const until = new Date();
      until.setDate(until.getDate() + Math.round(90 + r() * 640));
      return {
        id: id * 10 + i, block, product, status: 'active', currency: 'RUB',
        limit_amount, used_amount, available: limit_amount - used_amount,
        total_limit: limit_amount * 1.15, utilization_cap_pct: 85,
        valid_until: until.toISOString().slice(0, 10),
      };
    }).sort((a, b) => b.limit_amount - a.limit_amount);

    const corporate = makeItems(CORPORATE, 'corporate');
    const investment = makeItems(INVESTMENT, 'investment');
    const items = [...corporate, ...investment];
    const total = items.reduce((sum, x) => sum + x.limit_amount, 0);
    const used = items.reduce((sum, x) => sum + x.used_amount, 0);

    // заявки есть не у каждого клиента — как и в базе
    const applications = id % 3 === 2
      ? APPLICATIONS.map(([product, term, comment], i) => {
          const created = new Date();
          created.setDate(created.getDate() - (id * 3 % 45));
          return {
            id: id * 100 + i, product, status: 'На рассмотрении', currency: 'RUB',
            term_months: term, amount: 50e6 + (id * 97 % 450) * 1e6, comment,
            created_at: created.toISOString().slice(0, 10),
          };
        })
      : [];

    return {
      blocks: [
        { code: 'corporate', title: 'Корпоративный блок', items: corporate },
        { code: 'investment', title: 'Инвестиционный блок', items: investment },
      ],
      unified: { sublimit: total, utilized: used, available: total - used },
      applications,
      items, total, used,
    };
  };
  const sublimits = id => {
    const r = rng(id * 15485863);
    const shares = [['Транш до 6 месяцев', 0.25], ['Транш до 12 месяцев', 0.35], ['Транш свыше 12 месяцев', 0.20]];
    const items = [];
    limits(id).items.forEach(l => shares.forEach(([name, share]) => {
      const amount = l.limit_amount * share;
      const used_amount = amount * (0.1 + r() * 0.75);
      items.push({
        id: items.length + 1, product: l.product, name,
        amount, used_amount, available: amount - used_amount,
        tenor_months: [3, 6, 12, 18, 24, 36][Math.floor(r() * 6)],
      });
    }));
    return {
      items,
      total: items.reduce((s, x) => s + x.amount, 0),
      used: items.reduce((s, x) => s + x.used_amount, 0),
    };
  };

  const reserves = id => {
    const source = limits(id).items
      .slice()
      .sort((a, b) => b.limit_amount - a.limit_amount)
      .slice(0, 3);

    const positions = (standard, base) => source.map((item, i) => ({
      id: id * 100 + i, standard,
      product: item.product,
      currency: item.currency,
      limit_amount: item.limit_amount,
      term_months: [6, 12, 18, 24, 36][(id + i) % 5],
      reserve_amount: item.limit_amount * (base + ((id + i) % 8) / 100),
      calc_date: new Date().toISOString().slice(0, 10),
    }));

    const rsbu = positions('rsbu', 0.03);
    const ifrs = positions('ifrs', 0.05);
    const sum = list => list.reduce((acc, x) => acc + x.reserve_amount, 0);

    return {
      blocks: [
        { code: 'rsbu', title: 'Резервы РСБУ', items: rsbu, total: sum(rsbu) },
        { code: 'ifrs', title: 'Резервы МСФО', items: ifrs, total: sum(ifrs) },
      ],
      items: [...rsbu, ...ifrs],
      total: sum(rsbu) + sum(ifrs),
    };
  };

  const byId = id => COMPANIES.find(c => c.id === id);

  /* ---------- группы компаний ---------- */
  const GROUPS = [
    { id: 1, name: 'ГК «Северная сталь»',  members: [9, 2, 20] },
    { id: 2, name: 'ГК «Энергоресурс»',    members: [3, 7, 12, 13] },
    { id: 3, name: 'ГК «Технополис»',      members: [19, 18, 8] },
    { id: 4, name: 'ГК «Полярный ресурс»', members: [16, 17, 14, 5] },
  ];

  const ADDRESSES = [
    '101000, г. Москва, ул. Мясницкая, д. 12, стр. 1',
    '190000, г. Санкт-Петербург, наб. реки Мойки, д. 58',
    '620014, г. Екатеринбург, ул. Малышева, д. 51',
    '630007, г. Новосибирск, ул. Советская, д. 5',
    '350000, г. Краснодар, ул. Красная, д. 176',
    '455000, г. Магнитогорск, ул. Кирова, д. 93',
    '162600, г. Череповец, ул. Мира, д. 30',
    '423450, г. Альметьевск, ул. Ленина, д. 75',
  ];

  const OKVED = {
    'Металлургия': '24.10', 'Нефть и газ': '06.10', 'Розничная торговля': '47.11',
    'ИТ и разработка ПО': '62.01', 'Электроэнергетика': '35.11', 'Транспорт': '49.50',
    'Финансы': '64.19', 'Химия и нефтехимия': '20.15', 'Авиаперевозки': '51.10',
    'Лесная промышленность': '16.10', 'Добыча полезных ископаемых': '07.10',
  };

  const memberSublimit = id => {
    const amount = 150000000 + (id * 37117 % 850000000);
    const used = amount * (0.2 + (id * 13 % 60) / 100);
    return { sublimit_amount: amount, utilized_amount: used, available_amount: amount - used };
  };

  function groupOf(companyId) {
    const found = GROUPS.find(g => g.members.includes(companyId));
    if (!found) return null;

    const members = found.members.map(memberId => {
      const company = byId(memberId);
      return { id: memberId, name: company.name, inn: company.inn, ...memberSublimit(memberId) };
    }).sort((a, b) => b.sublimit_amount - a.sublimit_amount);

    const unified = members.reduce((sum, m) => sum + m.sublimit_amount, 0);
    const utilized = members.reduce((sum, m) => sum + m.utilized_amount, 0);
    return {
      id: found.id, name: found.name,
      unified_limit: unified, utilized_limit: utilized,
      available_limit: unified - utilized,
      total_limit: unified * 1.15,
      utilization_cap_pct: 85,
      members,
    };
  }

  function profile(id) {
    const company = byId(id);
    return {
      ...company,
      ogrn: '1' + String(1000000 + id * 7919).padStart(12, '0').slice(-12),
      address: ADDRESSES[id % ADDRESSES.length],
      okved: OKVED[company.industry] || '46.90',
      okved_name: company.industry,
      group: groupOf(id),
    };
  }

  return { search, byId, indicators, limits, sublimits, reserves, profile };
})();
