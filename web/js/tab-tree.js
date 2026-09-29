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
    view: null,          // 'company'
    section: null,       // 'main' | 'limits' | 'sublimits' | 'reserves'
    group: 'balance',
    attribute: null,     // выбранный атрибут в «Основной информации» ('group' раскрывает ГК)
    groupSelection: null, // ИНН компании, выбранной в структуре ГК
    eventFilter: 'critical',
    groupCard: null,     // лениво загруженная карточка ГК
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
    const { limits, profile } = state.data;

    // --- уровень 1
    tabNodes.company = createTab({
      label: 'Компания', value: company.name, note: 'Открыть карточку',
      index: 0, onClick: () => selectView('company'),
    });
    tabNodes.company.classList.add('tab--company');

    const criticalCount = Events.countBy(state.events, 'critical');
    tabNodes.events = createTab({
      label: 'События', labelFlag: '(в разработке)',
      value: criticalCount ? `${criticalCount} требуют внимания` : 'отклонений нет',
      index: 3, onClick: () => selectView('events'),
    });
    tabNodes.events.classList.add('tab--events');
    if (criticalCount) tabNodes.events.classList.add('has-alert');

    tabNodes.eventFilters = {};
    EVENT_FILTERS.forEach((filter, index) => {
      const count = Events.countBy(state.events, filter.code);
      tabNodes.eventFilters[filter.code] = createTab({
        label: filter.label, value: String(count), note: filter.note,
        index, onClick: () => selectEventFilter(filter.code),
      });
    });

    setRowTabs(companyTabs, [tabNodes.company, createIdentityPair(company), tabNodes.events]);

    const limitCount = (limits && limits.limits) ? limits.limits.length : 0;
    const appCount = (limits && limits.applications) ? limits.applications.length : 0;

    tabNodes.sections = {
      main: createTab({
        label: 'Основная информация', value: profile.name,
        note: profile.group ? profile.group.name : 'без группы компаний',
        index: 0, onClick: () => selectSection('main'),
      }),
      limits: createTab({
        label: 'Лимиты', value: String(limitCount),
        note: `${appCount} заявок`, index: 1, onClick: () => selectSection('limits'),
      }),
      sublimits: createTab({
        label: 'Сублимиты', value: '—',
        note: 'источник не подключён', index: 2, onClick: () => selectSection('sublimits'),
      }),
      reserves: createTab({
        label: 'Информация о резервах', value: '—',
        note: 'источник не подключён', index: 3, onClick: () => selectSection('reserves'),
      }),
    };
    sectionTabs.replaceChildren(...Object.values(tabNodes.sections));

    tabNodes.groups = {};

    const attributeTabs = [
      { code: 'inn',     label: 'ИНН',   value: profile.inn },
      { code: 'ogrn',    label: 'ОГРН',  value: profile.ogrn || '—' },
      { code: 'address', label: 'Адрес', value: profile.address || '—' },
      { code: 'okved',   label: 'ОКВЭД', value: profile.okved || '—' },
    ];
    tabNodes.attributes = {};
    attributeTabs.forEach((attribute, index) => {
      tabNodes.attributes[attribute.code] = createTab({
        label: attribute.label, value: attribute.value, note: attribute.note,
        isStatic: true, index,
      });
    });

    tabNodes.attributes.group = profile.group
      ? createTab({
          label: 'Группа компаний', value: profile.group.name,
          index: attributeTabs.length,
          onClick: () => toggleGroup(),
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
    const showAttributes = companyOpen && state.section === 'main';
    const showGroups = showAttributes;

    tabNodes.company.classList.toggle('is-active', companyOpen);
    tabNodes.company.noteElement.textContent = companyOpen ? 'Свернуть карточку' : 'Открыть карточку';
    tabNodes.events.classList.toggle('is-active', eventsOpen);

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
        html = state.attribute === 'group' && state.groupCard
          ? TableViews.group(state.groupCard, {
              selectedInn: state.groupSelection,
              currentInn: state.company.inn,
            })
          : TableViews.profile(data.profile);
      }
      else if (state.section === 'limits')    html = TableViews.limits(data.limits);
      else if (state.section === 'sublimits') html = TableViews.sublimits();
      else if (state.section === 'reserves')  html = TableViews.reserves();
    }

    contentArea.innerHTML = html;

    contentArea.querySelectorAll('[data-inn]').forEach(node =>
      node.addEventListener('click', () => {
        const inn = node.dataset.inn;
        state.groupSelection = state.groupSelection === inn ? null : inn;
        renderContent();
      }));

    const goButton = contentArea.querySelector('[data-go-inn]');
    if (goButton) {
      goButton.addEventListener('click', () => callbacks.openCompany(goButton.dataset.goInn));
    }

    contentArea.style.animation = 'none';
    void contentArea.offsetWidth;
    contentArea.style.animation = '';
  }

  async function toggleGroup() {
    if (state.attribute === 'group') {
      state.attribute = null;
      syncTabs();
      renderContent();
      return;
    }
    state.attribute = 'group';
    syncTabs();
    const ref = state.data.profile && state.data.profile.group;
    if (ref && !state.groupCard) {
      contentArea.innerHTML = '<p class="events-empty">Загружаем структуру группы…</p>';
      try {
        state.groupCard = await API.group(ref.crm_id);
      } catch (error) {
        contentArea.innerHTML = '<p class="events-empty">Не удалось загрузить группу компаний.</p>';
        console.error(error);
        return;
      }
    }
    renderContent();
  }

  function selectView(view) {
    state.view = state.view === view ? null : view;
    state.section = null;
    state.attribute = null;
    state.groupSelection = null;
    if (state.view === 'events') state.eventFilter = 'critical';
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

  function render(company, data) {
    Object.assign(state, {
      company, data,
      events: Events.detect(data),
      view: null, section: null, group: 'balance', eventFilter: 'critical',
      attribute: null, groupSelection: null, groupCard: null,
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
      group: 'balance', eventFilter: 'critical', attribute: null,
      groupSelection: null, groupCard: null,
    });
  }

  return {
    render, clear,
    onOpenCompany: fn => { callbacks.openCompany = fn; },
    getGroupCard: () => state.groupCard,
  };
})();
