/* ============================================================
   Дерево вкладок.

   Уровень 1   Компания · ИНН · КПП · События
   Уровень 2   Основная информация · Лимиты · Сублимиты · Резервы
   Уровень 3   Баланс · Финрезультаты · Коэффициенты

   Вкладки создаются один раз на загрузку компании, дальше меняются
   только классы — иначе анимация появления повторялась бы на каждый клик.
   ============================================================ */
const TabTree = (() => {
  const byId = id => document.getElementById(id);

  const treeRoot = byId('tabTree'),
        companyLevel = byId('companyLevel'),
        sectionLevel = byId('sectionLevel'),
        groupLevel = byId('groupLevel'),
        companyTabs = byId('companyTabs'),
        sectionTabs = byId('sectionTabs'),
        groupTabs = byId('groupTabs'),
        contentArea = byId('panelContent');

  const arrowLeft = treeRoot.querySelector('.row-arrow--left');
  const arrowRight = treeRoot.querySelector('.row-arrow--right');

  const state = {
    company: null,
    data: null,
    events: [],
    view: null,          // 'company' | 'events' — что выбрано на первом уровне
    section: null,       // 'main' | 'statements' | 'limits' | 'sublimits' | 'reserves'
    group: 'balance',    // 'balance' | 'results' | 'ratios'
    attribute: null,     // выбранный атрибут в «Основной информации» ('group' раскрывает ГК)
    groupSelection: null, // компания, выбранная в структуре ГК для перехода
    eventFilter: 'critical',  // какая категория событий показана
  };

  const tabNodes = {
    company: null, events: null, sections: {}, groups: {},
    eventFilters: {}, attributes: {},
  };

  const callbacks = { openCompany: () => {} };

  const EVENT_FILTERS = [
    { code: 'critical', label: 'Требуют внимания', note: 'резкие отклонения' },
    { code: 'warning',  label: 'Наблюдение',       note: 'умеренные изменения' },
    { code: 'positive', label: 'Положительная динамика', note: 'улучшение показателей' },
  ];

  const INDICATOR_GROUPS = [
    { code: 'balance', title: 'Баланс' },
    { code: 'results', title: 'Фин. результаты' },
    { code: 'ratios',  title: 'Коэффициенты' },
  ];

  /* ---------- конструктор вкладки ---------- */
  function createTab({ label, labelFlag, value, note, isStatic, index = 0, onClick }) {
    const node = document.createElement(isStatic ? 'div' : 'button');
    node.className = 'tab' + (isStatic ? ' is-static' : '');
    node.style.animationDelay = index * 45 + 'ms';
    if (!isStatic) {
      node.type = 'button';
      node.addEventListener('click', onClick);
    }
    node.innerHTML =
      (label ? `<span class="tab-label">${Format.escape(label)}` +
               (labelFlag ? ` <i class="tab-flag">${Format.escape(labelFlag)}</i>` : '') +
               `</span>` : '') +
      `<span class="tab-value">${Format.escape(value)}</span>` +
      `<span class="tab-note">${note || ''}</span>`;
    node.noteElement = node.querySelector('.tab-note');
    return node;
  }

  /* ИНН и КПП живут одним серым блоком: это реквизиты одной компании,
     дробить их на две карточки незачем. Блок отделён от боковых вкладок
     короткими вертикальными линиями. */
  function createIdentityPair(company) {
    const pair = document.createElement('div');
    pair.className = 'tab-pair';
    [['ИНН', company.inn], ['КПП', company.kpp || '—']].forEach(([label, value]) => {
      const cell = document.createElement('div');
      cell.className = 'tab-cell';
      cell.innerHTML = `<span class="tab-label">${Format.escape(label)}</span>` +
                       `<span class="tab-value">${Format.escape(value)}</span>`;
      pair.append(cell);
    });
    return pair;
  }

  /* ---------- построение уровней ---------- */
  function buildTabs() {
    const company = state.company;
    const { indicators, limits, sublimits, reserves, profile } = state.data;

    // --- уровень 1
    tabNodes.company = createTab({
      label: 'Компания', value: company.name, note: 'Открыть карточку',
      index: 0, onClick: () => selectView('company'),
    });
    tabNodes.company.classList.add('tab--company');   // ширина по длине названия

    const criticalCount = Events.countBy(state.events, 'critical');
    tabNodes.events = createTab({
      label: 'События', labelFlag: '(в разработке)',
      value: criticalCount ? `${criticalCount} требуют внимания` : 'отклонений нет',
      index: 3, onClick: () => selectView('events'),
    });
    tabNodes.events.classList.add('tab--events');
    if (criticalCount) tabNodes.events.classList.add('has-alert');

    // фильтры событий — второй уровень, когда открыта вкладка «События»
    tabNodes.eventFilters = {};
    EVENT_FILTERS.forEach((filter, index) => {
      const count = Events.countBy(state.events, filter.code);
      tabNodes.eventFilters[filter.code] = createTab({
        label: filter.label, value: String(count), note: filter.note,
        index, onClick: () => selectEventFilter(filter.code),
      });
    });

    setRowTabs(companyTabs, [tabNodes.company, createIdentityPair(company), tabNodes.events]);

    // --- уровень 2
    const utilization = limits.total
      ? (limits.used / limits.total * 100).toFixed(1).replace('.', ',') : '0';

    tabNodes.sections = {
      main: createTab({
        label: 'Основная информация', value: profile.name,
        note: profile.group ? profile.group.name : 'без группы компаний',
        index: 0, onClick: () => selectSection('main'),
      }),
      statements: createTab({
        label: 'Финансовая отчётность', value: `${indicators.years[0]}–${indicators.years[indicators.years.length - 1]}`,
        note: 'Баланс · Фин. рез-ты · Коэф-ты',
        index: 1, onClick: () => selectSection('statements'),
      }),
      limits: createTab({
        label: 'Лимиты', value: Format.compact(limits.total),
        note: `утилизация ${utilization}%`, index: 2, onClick: () => selectSection('limits'),
      }),
      sublimits: createTab({
        label: 'Сублимиты', value: Format.compact(sublimits.total),
        note: `${sublimits.items.length} позиций`, index: 3, onClick: () => selectSection('sublimits'),
      }),
      reserves: createTab({
        label: 'Информация о резервах', value: Format.compact(reserves.total),
        note: 'РСБУ · МСФО', index: 4, onClick: () => selectSection('reserves'),
      }),
    };
    sectionTabs.replaceChildren(...Object.values(tabNodes.sections));

    // --- уровень 3: разделы отчётности
    tabNodes.groups = {};
    INDICATOR_GROUPS.forEach((group, index) => {
      const source = indicators.groups.find(item => item.code === group.code);
      tabNodes.groups[group.code] = createTab({
        value: group.title,
        note: source ? `${source.rows.length} показателей` : '',
        index,
        onClick: () => {
          state.group = group.code;
          syncTabs();
          renderContent();
        },
      });
    });

    // --- уровень 3: атрибутный состав карточки клиента
    // ИНН, ОГРН, адрес и ОКВЭД — справочные, кликается только группа компаний
    const attributeTabs = [
      { code: 'inn',     label: 'ИНН',   value: profile.inn },
      { code: 'ogrn',    label: 'ОГРН',  value: profile.ogrn || '—' },
      { code: 'address', label: 'Адрес', value: profile.address || '—' },
      { code: 'okved',   label: 'ОКВЭД', value: profile.okved || '—', note: profile.okved_name || '' },
    ];
    tabNodes.attributes = {};
    attributeTabs.forEach((attribute, index) => {
      tabNodes.attributes[attribute.code] = createTab({
        label: attribute.label, value: attribute.value, note: attribute.note,
        isStatic: true, index,
      });
    });

    // группа компаний: раскрывается, если есть; иначе «Отсутствует» на том же месте
    tabNodes.attributes.group = profile.group
      ? createTab({
          label: 'Группа компаний', value: profile.group.name,

          index: attributeTabs.length,
          onClick: () => {
            state.attribute = state.attribute === 'group' ? null : 'group';
            syncTabs();
            renderContent();
          },
        })
      : createTab({
          label: 'Группа компаний', value: 'Отсутствует',
          note: 'клиент не входит в ГК',
          isStatic: true, index: attributeTabs.length,
        });
  }

  /* ---------- синхронизация состояний ---------- */
  function syncTabs() {
    const companyOpen = state.view === 'company';
    const eventsOpen = state.view === 'events';
    const showStatements = companyOpen && state.section === 'statements';
    const showAttributes = companyOpen && state.section === 'main';
    const showGroups = showStatements || showAttributes;

    tabNodes.company.classList.toggle('is-active', companyOpen);
    tabNodes.company.noteElement.textContent = companyOpen ? 'Свернуть карточку' : 'Открыть карточку';
    tabNodes.events.classList.toggle('is-active', eventsOpen);

    // второй уровень показывает либо разделы компании, либо фильтры событий
    if (eventsOpen) {
      setRowTabs(sectionTabs, Object.values(tabNodes.eventFilters));
      Object.entries(tabNodes.eventFilters).forEach(([code, node]) =>
        node.classList.toggle('is-active', state.eventFilter === code));
    } else {
      setRowTabs(sectionTabs, Object.values(tabNodes.sections));
      Object.entries(tabNodes.sections).forEach(([code, node]) =>
        node.classList.toggle('is-active', state.section === code));
    }

    if (showAttributes) {
      setRowTabs(groupTabs, Object.values(tabNodes.attributes));
      if (tabNodes.attributes.group) {
        tabNodes.attributes.group.classList.toggle('is-active', state.attribute === 'group');
      }
    } else {
      setRowTabs(groupTabs, Object.values(tabNodes.groups));
      Object.entries(tabNodes.groups).forEach(([code, node]) =>
        node.classList.toggle('is-active', state.group === code));
    }

    setLevelVisible(sectionLevel, companyOpen || eventsOpen);
    setLevelVisible(groupLevel, showGroups);

    // сторона ветки: «Компания» — крайняя слева, «События» — крайняя справа.
    // Ни одна не выбрана — строка возвращается в центр.
    treeRoot.classList.toggle('branch-left', companyOpen);
    treeRoot.classList.toggle('branch-right', eventsOpen);

    // считаем после того, как браузер применил классы и состав строк
    requestAnimationFrame(() => {
      fitTopRow();
      layoutBranch();
    });
  }

  /* Меняет состав строки только когда он действительно другой —
     иначе повторялась бы анимация появления вкладок */
  function setRowTabs(row, nodes) {
    if (row.firstElementChild !== nodes[0] || row.childElementCount !== nodes.length) {
      row.replaceChildren(...nodes);
    }
  }

  /* ------------------------------------------------------------
     Геометрия уровней.

     Все строки — включая первую — выравниваются по одному краю:
     левому при раскрытии «Компании», правому при раскрытии «Событий».
     Цель фиксированная (граница поля контейнера), а не карточка, по
     которой кликнули, поэтому раскрытие «Финансовой отчётности» и
     «Основной информации» даёт одинаковую раскладку.

     Черта-указатель никаких вычислений не требует: она нарисована
     на краю контейнера средствами CSS и одинакова для всех уровней.

     offsetLeft читает положение ДО transform, поэтому измерения не
     зависят от текущей анимации сдвига.
     ------------------------------------------------------------ */
  const cssPx = name =>
    parseInt(getComputedStyle(treeRoot).getPropertyValue(name), 10) || 0;

  function offsetWithin(node, ancestor) {
    let x = 0;
    while (node && node !== ancestor) {
      x += node.offsetLeft;
      node = node.offsetParent;
    }
    return x;
  }

  function offsetWithinY(node, ancestor) {
    let y = 0;
    while (node && node !== ancestor) {
      y += node.offsetTop;
      node = node.offsetParent;
    }
    return y;
  }

  /* ------------------------------------------------------------
     Подбор ширины верхней строки.

     ИНН и КПП переносить нельзя — число, разорванное на две строки,
     читается как ошибка. Ширина подбирается в два подхода:

       1. вся карточка в одну строку (max-content) — идеальный вариант;
       2. если такая строка не помещается, берётся ширина самого длинного
          слова (min-content): длинное наименование переносится по пробелам,
          но ни слово, ни число не разрываются.

     Полученная ширина назначается обеим боковым вкладкам, поэтому они
     всегда одного размера; серый блок ИНН/КПП занимает столько, сколько
     нужно реквизитам. Если не помещается и второй вариант, замер
     не применяется.
     ------------------------------------------------------------ */
  const TAB_GAP = 12;

  function measureRow(mode) {
    companyTabs.classList.add(mode);
    const sides = [companyTabs.firstElementChild, companyTabs.lastElementChild];
    const needed = sides.reduce((max, tab) => Math.max(max, tab ? tab.offsetWidth : 0), 0);
    companyTabs.classList.remove(mode);
    return needed;
  }

  function fitTopRow() {
    const sides = [companyTabs.firstElementChild, companyTabs.lastElementChild];
    if (!sides[0] || sides[0] === sides[1]) return;

    companyTabs.style.removeProperty('--tab-min');
    companyTabs.style.removeProperty('max-width');
    if (!companyTabs.clientWidth) return;

    const pair = companyTabs.querySelector('.tab-pair');
    const pairWidth = pair ? pair.offsetWidth : 0;
    const normal = companyTabs.clientWidth;
    const roomy = treeRoot.clientWidth - 12;   // строка может занять поля под черту
    const rowWidth = width => width * 2 + pairWidth;

    // 1. лучший вариант: боковые вкладки целиком в одну строку
    const whole = measureRow('is-measuring-whole');
    // 2. запасной: не рвать слова и числа, но разрешить перенос по пробелам
    const unbroken = measureRow('is-measuring-word');

    let needed = 0;
    let useGutters = false;

    if (rowWidth(whole) <= normal) needed = whole;
    else if (rowWidth(whole) <= roomy) { needed = whole; useGutters = true; }
    else if (rowWidth(unbroken) <= normal) needed = unbroken;
    else if (rowWidth(unbroken) <= roomy) { needed = unbroken; useGutters = true; }
    else return;                                // не помещается и так

    if (useGutters) companyTabs.style.maxWidth = '100%';
    companyTabs.style.setProperty('--tab-min', Math.ceil(needed) + 'px');
  }

  /* Стрелки ставятся вплотную к крайним карточкам первой строки и
     сдвигаются на ту же величину, что и сама строка. */
  const ARROW_SIZE = 16;
  const ARROW_GAP = 14;

  function placeArrows(shift) {
    const first = companyTabs.firstElementChild;
    const last = companyTabs.lastElementChild;
    if (!arrowLeft || !first || !companyTabs.offsetWidth) return;

    const base = offsetWithin(companyTabs, treeRoot);
    const left = base + first.offsetLeft + shift;
    const right = base + last.offsetLeft + last.offsetWidth + shift;
    const middle = offsetWithinY(first, treeRoot) + first.offsetHeight / 2 - ARROW_SIZE / 2;

    arrowLeft.style.left = Math.round(left - ARROW_GAP - ARROW_SIZE) + 'px';
    arrowRight.style.left = Math.round(right + ARROW_GAP) + 'px';
    arrowLeft.style.top = arrowRight.style.top = Math.round(middle) + 'px';
  }

  /* ближний к ветке край крайней карточки строки */
  function nearEdge(row, toRight) {
    const tab = toRight ? row.lastElementChild : row.firstElementChild;
    if (!tab) return null;
    const x = offsetWithin(row, treeRoot) + tab.offsetLeft;
    return toRight ? x + tab.offsetWidth : x;
  }

  function layoutBranch() {
    const toRight = treeRoot.classList.contains('branch-right');
    const toLeft = treeRoot.classList.contains('branch-left');
    const rows = [companyTabs, sectionTabs, groupTabs];

    if (!toLeft && !toRight) {
      rows.forEach(row => { row.style.transform = ''; });
      placeArrows(0);
      return;
    }

    const gutter = cssPx('--marker-gutter');
    const target = toRight ? treeRoot.offsetWidth - gutter : gutter;
    const visible = new Set(visibleRows().map(entry => entry.row));

    rows.forEach(row => {
      // строка третьего уровня остаётся по центру: карточек в ней меньше,
      // и прижатая к краю она выглядела бы обрубленной
      if (row === groupTabs || !visible.has(row) || !row.offsetWidth) {
        row.style.transform = '';
        return;
      }
      const edge = nearEdge(row, toRight);
      if (edge === null) return;
      const shift = Math.round(target - edge);
      row.style.transform = shift ? `translateX(${shift}px)` : '';
      if (row === companyTabs) placeArrows(shift);
    });
  }

  function visibleRows() {
    const list = [{ row: companyTabs, branch: null }];
    if (sectionLevel.classList.contains('is-open')) {
      list.push({ row: sectionTabs, branch: sectionLevel.querySelector('.tab-branch') });
    }
    if (groupLevel.classList.contains('is-open')) {
      list.push({ row: groupTabs, branch: groupLevel.querySelector('.tab-branch') });
    }
    return list;
  }

  /* пересчёт при изменении ширины окна */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fitTopRow();
      layoutBranch();
    }, 120);
  });

  /* inert убирает скрытые уровни из обхода по Tab */
  function setLevelVisible(level, visible) {
    level.classList.toggle('is-open', visible);
    level.toggleAttribute('inert', !visible);
  }

  /* ---------- контент ---------- */
  function renderContent() {
    const data = state.data;
    let html = '';

    if (state.view === 'events') {
      html = TableViews.events(state.events, state.eventFilter);
    } else if (state.view === 'company') {
      if (state.section === 'main') {
        html = state.attribute === 'group' && data.profile.group
          ? TableViews.group(data.profile.group, {
              selectedId: state.groupSelection,
              currentId: state.company.id,
            })
          : TableViews.profile(data.profile);
      }
      else if (state.section === 'statements') html = TableViews.indicators(data.indicators, state.group);
      else if (state.section === 'limits')    html = TableViews.limits(data.limits);
      else if (state.section === 'sublimits') html = TableViews.sublimits(data.sublimits);
      else if (state.section === 'reserves')  html = TableViews.reserves(data.reserves);
    }

    contentArea.innerHTML = html;

    // выбор компании в структуре ГК: клик отмечает её, кнопка «Перейти» —
    // запускает полноценный запрос за данными выбранной компании
    contentArea.querySelectorAll('[data-company-id]').forEach(node =>
      node.addEventListener('click', () => {
        const id = +node.dataset.companyId;
        state.groupSelection = state.groupSelection === id ? null : id;
        renderContent();
      }));

    const goButton = contentArea.querySelector('[data-go]');
    if (goButton) {
      goButton.addEventListener('click', () => callbacks.openCompany(+goButton.dataset.go));
    }

    contentArea.style.animation = 'none';   // перезапуск анимации появления
    void contentArea.offsetWidth;
    contentArea.style.animation = '';
  }

  /* ---------- взаимодействие ---------- */
  /* Один клик раскрывает ровно один уровень: карточка компании
     показывает строку разделов и ничего не выбирает в ней, раздел
     показывает свою строку — и так далее вглубь. */
  function selectView(view) {
    state.view = state.view === view ? null : view;
    state.section = null;
    state.attribute = null;
    state.groupSelection = null;
    if (state.view === 'events') state.eventFilter = 'critical';   // по умолчанию — критичные
    syncTabs();
    renderContent();
  }

  function selectEventFilter(code) {
    state.eventFilter = code;
    syncTabs();
    renderContent();
  }

  function selectSection(section) {
    state.section = state.section === section ? null : section;
    state.attribute = null;
    state.groupSelection = null;
    syncTabs();
    renderContent();
  }

  /* ---------- публичный интерфейс ---------- */
  function render(company, data) {
    Object.assign(state, {
      company, data,
      events: Events.detect(data),
      view: null, section: null, group: 'balance', eventFilter: 'critical',
      attribute: null, groupSelection: null,
    });
    treeRoot.hidden = false;
    buildTabs();
    companyLevel.classList.add('is-open');
    syncTabs();
    renderContent();
  }

  function clear() {
    treeRoot.hidden = true;
    companyTabs.style.removeProperty('--tab-min');
    treeRoot.classList.remove('branch-left', 'branch-right');
    companyLevel.classList.remove('is-open');
    setLevelVisible(sectionLevel, false);
    setLevelVisible(groupLevel, false);
    contentArea.innerHTML = '';
    Object.assign(state, {
      company: null, data: null, events: [], view: null, section: null,
      group: 'balance', eventFilter: 'critical', attribute: null, groupSelection: null,
    });
  }

  return {
    render, clear,
    onOpenCompany: fn => { callbacks.openCompany = fn; },
  };
})();
