/* ============================================================
   Рендер таблиц. Каждая функция возвращает HTML-строку.
   ============================================================ */
const TableViews = (() => {

  const head = (title, meta) =>
    `<div class="content-head"><h2>${Format.escape(title)}</h2>${meta ? `<span class="content-meta">${meta}</span>` : ''}</div>`;

  const card = (k, v, accent) =>
    `<div class="card${accent ? ' is-accent' : ''}"><div class="card-key">${k}</div><div class="card-value">${v}</div></div>`;

  const usageBar = (used, total) => {
    const p = total ? Math.min(100, used / total * 100) : 0;
    return `<div class="usage-bar"><i style="width:${p.toFixed(1)}%"></i></div>`;
  };

  /* ---------- Основная информация: баланс / финрезультаты / коэффициенты ---------- */
  function indicators(data, groupCode) {
    const g = data.groups.find(x => x.code === groupCode);
    if (!g) return '<p class="events-empty">Нет данных</p>';
    const yrs = data.years;

    const rows = g.rows.map(r => {
      const prev = r.values[r.values.length - 2];
      const cur = r.values[r.values.length - 1];
      return `<tr><td>${Format.escape(r.label)}</td>` +
        r.values.map(v => `<td>${Format.byKind(v, r.kind)}</td>`).join('') +
        `<td>${Format.delta(prev, cur)}</td></tr>`;
    }).join('');

    return head(g.title, `период ${yrs[0]}–${yrs[yrs.length - 1]} · ${data.unit}`) +
      `<div class="table-wrap"><table>
        <thead><tr><th>Показатель</th>${yrs.map(y => `<th>${y}</th>`).join('')}<th>Δ ${yrs[yrs.length - 1]}/${yrs[yrs.length - 2]}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Лимиты ----------
     Два раздела: установленные лимиты (корпоративный и инвестиционный
     блоки плюс единый сублимит клиента) и заявки на рассмотрении.
     Единый сублимит не хранится отдельно — по глоссарию это совокупность
     лимитов обоих блоков, установленных на клиента. */
  const STATUS_TITLES = { active: 'Активный', closed: 'Закрыт', suspended: 'Приостановлен' };

  function limitBlock(block) {
    const rows = block.items.map(item => `<tr>
        <td>${Format.escape(item.product)}</td>
        <td><span class="badge">${Format.escape(STATUS_TITLES[item.status] || item.status)}</span></td>
        <td>${Format.escape(item.currency)}</td>
        <td>${Format.rub(item.limit_amount)}</td>
        <td>${Format.rub(item.used_amount)}</td>
        <td>${Format.rub(item.available)}</td>
        <td>${Format.rub(item.total_limit)}</td>
        <td>${Number(item.utilization_cap_pct).toFixed(0)}<span class="unit">%</span></td>
      </tr>`).join('');

    return `<h4 class="sub-title">${Format.escape(block.title)}</h4>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Тип лимита</th><th>Статус лимита</th><th>Валюта</th><th>Сумма лимита</th>
          <th>Утилизация лимита</th><th>Доступный остаток</th>
          <th>Совокупный лимит</th><th>«Крышка»</th>
        </tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  function applicationsBlock(applications) {
    if (!applications.length) {
      return `<h3 class="block-title">Заявки на рассмотрении</h3>
              <p class="events-empty">Заявок на рассмотрении нет.</p>`;
    }
    const rows = applications.map(item => `<tr>
        <td>${Format.escape(item.product)}</td>
        <td><span class="badge is-pending">${Format.escape(item.status)}</span></td>
        <td>${Format.escape(item.currency)}</td>
        <td>${item.term_months} мес.</td>
        <td>${Format.rub(item.amount)}</td>
        <td class="comment-cell">${Format.escape(item.comment || '—')}</td>
      </tr>`).join('');

    return `<h3 class="block-title">Заявки на рассмотрении</h3>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Тип лимита</th><th>Статус лимита</th><th>Валюта</th>
          <th>Срок лимита</th><th>Запрошенная сумма</th><th>Комментарии</th>
        </tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  function limits(d) {
    const blocks = d.blocks || [];
    const unified = d.unified || { sublimit: d.total, utilized: d.used, available: d.total - d.used };
    const utilization = unified.sublimit ? unified.utilized / unified.sublimit * 100 : 0;

    return head('Лимиты', `установленные лимиты и заявки · валюта ₽`) +
      `<h3 class="block-title">Установленные лимиты</h3>
       ${blocks.map(limitBlock).join('')}

       <h4 class="sub-title">Единый сублимит</h4>
       <div class="cards">
         ${card('Единый сублимит', Format.compact(unified.sublimit), true)}
         ${card('Единый доступный сублимит', Format.compact(unified.available))}
         ${card('Единый утилизированный сублимит', Format.compact(unified.utilized))}
       </div>
       ${usageBar(unified.utilized, unified.sublimit)}
       <p class="bar-note">Утилизация ${utilization.toFixed(1).replace('.', ',')}% от единого сублимита</p>

       ${applicationsBlock(d.applications || [])}`;
  }

  /* ---------- Сублимиты ---------- */
  function sublimits(d) {
    let last = null;
    const rows = d.items.map(x => {
      const group = x.product !== last
        ? `<tr class="group-row"><td colspan="6">${Format.escape(x.product)}</td></tr>` : '';
      last = x.product;
      return group + `<tr>
        <td>${Format.escape(x.name)}</td>
        <td>${Format.rub(x.amount)}</td>
        <td>${Format.rub(x.used_amount)}</td>
        <td>${Format.rub(x.available)}</td>
        <td>${x.tenor_months} мес.</td>
        <td>${(x.used_amount / x.amount * 100).toFixed(1).replace('.', ',')}<span class="unit">%</span></td>
      </tr>`;
    }).join('');

    return head('Сублимиты', `${d.items.length} позиций`) +
      `<div class="cards">
        ${card('Сумма сублимитов', Format.compact(d.total), true)}
        ${card('Использовано', Format.compact(d.used))}
        ${card('Свободно', Format.compact(d.total - d.used))}
      </div>
      ${usageBar(d.used, d.total)}
      <div class="table-wrap"><table>
        <thead><tr><th>Сублимит</th><th>Сумма</th><th>Использовано</th><th>Доступно</th><th>Срок</th><th>Утилизация</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Информация о резервах ----------
     Два блока по стандартам учёта: РСБУ и МСФО. Внутри — название
     продукта, валюта и сумма лимита, срок лимита и сумма резерва.
     Наименование клиента выводится в правом верхнем углу раздела. */
  function reserveBlock(block) {
    const rows = block.items.map(item => `<tr>
        <td>${Format.escape(item.product)}</td>
        <td>${Format.escape(item.currency)}</td>
        <td>${Format.rub(item.limit_amount)}</td>
        <td>${item.term_months} мес.</td>
        <td>${Format.rub(item.reserve_amount)}</td>
        <td>${(item.reserve_amount / item.limit_amount * 100).toFixed(2).replace('.', ',')}<span class="unit">%</span></td>
      </tr>`).join('');

    return `<h3 class="block-title">${Format.escape(block.title)} · ${Format.compact(block.total)}</h3>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Название продукта</th><th>Валюта лимита</th><th>Сумма лимита</th>
          <th>Срок лимита</th><th>Сумма резерва</th><th>Ставка резервирования</th>
        </tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  function reserves(d) {
    const blocks = d.blocks || [];
    if (!blocks.length) {
      return head('Информация о резервах', '') +
        '<p class="events-empty">Позиции резервов не заведены.</p>';
    }

    return head('Информация о резервах', `сформировано ${Format.compact(d.total)}`) +
      blocks.map(reserveBlock).join('');
  }

  /* ---------- События ----------
     Список фильтруется вкладками второго уровня; сами вкладки строит tab-tree.js */
  const EVENT_LABEL = {
    critical: 'Требует внимания',
    warning: 'Наблюдение',
    positive: 'Положительная динамика',
    info: 'Информация',
  };

  const FILTER_TITLE = {
    critical: 'Требуют внимания',
    warning: 'Наблюдение',
    positive: 'Положительная динамика',
  };

  function events(list, filter) {
    const visible = filter ? list.filter(event => event.level === filter) : list;
    const period = list.length ? list[0].period : '';

    if (!visible.length) {
      return head(FILTER_TITLE[filter] || 'События', 'за текущий период') +
        `<p class="events-empty">Событий нет.</p>`;
    }

    const items = visible.map(event => `
      <li class="event event--${event.level}">
        <span class="event-marker"></span>
        <div class="event-body">
          <div class="event-head">
            <span class="event-title">${Format.escape(event.title)}</span>
            <span class="event-tag">${EVENT_LABEL[event.level]}</span>
          </div>
          <div class="event-detail">${Format.escape(event.detail)}</div>
          <div class="event-source">${Format.escape(event.source)} · ${Format.escape(event.period)}</div>
        </div>
      </li>`).join('');

    return head(FILTER_TITLE[filter] || 'События',
                `${visible.length} за текущий период${period ? ' · ' + Format.escape(period) : ''}`) +
      `<ul class="events">${items}</ul>`;
  }

  /* ---------- Основная информация: структура группы компаний ----------
     Сетка из пяти колонок: верхняя строка — показатели единого лимита
     группы, ниже по строке на каждую компанию. Все карточки справочные,
     кликов по ним нет. Термины — по глоссарию: единый лимит включает
     корпоративный и инвестиционный блоки, сублимит — часть единого
     лимита, установленная на конкретного клиента. */
  const groupCell = (label, value, accent) => `
    <div class="group-cell${accent ? ' is-accent' : ''}">
      ${label ? `<span class="cell-label">${Format.escape(label)}</span>` : ''}
      <span class="cell-value">${value}</span>
    </div>`;

  /* Кликается только наименование — по нему выбирают компанию для перехода.
     Компания, карточка которой открыта сейчас, остаётся справочной. */
  const selectableCell = (label, value, member, selected) => `
    <button type="button"
            class="group-cell is-selectable${selected ? ' is-selected' : ''}"
            data-company-id="${member.id}"
            aria-pressed="${selected}">
      <span class="cell-label">${Format.escape(label)}</span>
      <span class="cell-value">${Format.escape(value)}</span>
    </button>`;

  const currentCell = (label, value) => `
    <div class="group-cell is-current">
      <span class="cell-label">${Format.escape(label)}</span>
      <span class="cell-value">${Format.escape(value)}</span>
      <span class="cell-note">текущая компания</span>
    </div>`;

  function group(data, options = {}) {
    const { selectedId = null, currentId = null } = options;
    const utilization = data.unified_limit
      ? data.utilized_limit / data.unified_limit * 100 : 0;

    const limitRow = `
      <div class="group-grid">
        ${groupCell('Сумма единого лимита', Format.compact(data.unified_limit), true)}
        ${groupCell('Единый доступный лимит', Format.compact(data.available_limit))}
        ${groupCell('Единый утилизированный лимит', Format.compact(data.utilized_limit))}
        ${groupCell('Совокупный лимит', Format.compact(data.total_limit))}
        ${groupCell('«Крышка» по утилизации', Number(data.utilization_cap_pct).toFixed(0) + '%')}
      </div>`;

    const headings = ['Компания', 'ИНН', 'Единый сублимит',
                      'Единый доступный сублимит', 'Единый утилизированный сублимит'];


    // подписи в карточках компаний дублируют шапку и скрыты на широком
    // экране — на узком шапка прячется, и подписи становятся видны
    // текущая компания всегда первой строкой
    const ordered = [...data.members].sort((a, b) =>
      (b.id === currentId) - (a.id === currentId) || b.sublimit_amount - a.sublimit_amount);

    // кнопка перехода встаёт отдельной строкой сразу под выбранной компанией
    // и раздвигает остальные строки вниз; сетка та же, поэтому кнопка
    // оказывается ровно под карточкой с наименованием
    const goRow = id => id !== selectedId ? '' : `
      <div class="go-row">
        <div class="go-cell">
          <button type="button" class="go-button" data-go="${id}">Перейти</button>
        </div>
      </div>`;

    const memberRows = ordered.map(member => `
      <div class="group-grid group-grid--members">
        ${member.id === currentId
            ? currentCell(headings[0], member.name)
            : selectableCell(headings[0], member.name, member, member.id === selectedId)}
        ${groupCell(headings[1], Format.escape(member.inn))}
        ${groupCell(headings[2], Format.compact(member.sublimit_amount))}
        ${groupCell(headings[3], Format.compact(member.available_amount))}
        ${groupCell(headings[4], Format.compact(member.utilized_amount))}
      </div>
      ${goRow(member.id)}`).join('');

    return head(data.name, `Компаний в структуре: ${data.members.length}`) +
      `<h3 class="block-title">Единый лимит</h3>
       ${limitRow}
       ${usageBar(data.utilized_limit, data.unified_limit)}
       <p class="bar-note">Утилизация ${utilization.toFixed(1).replace('.', ',')}% при «крышке»
          ${Number(data.utilization_cap_pct).toFixed(0)}%</p>

       <div class="block-head">
         <h3 class="block-title">Компании в структуре ГК</h3>
         <span class="block-hint">Выберите наименование компании, чтобы перейти к её карточке</span>
       </div>
       <div class="group-grid group-grid--head">
         ${headings.map(title => `<span>${Format.escape(title)}</span>`).join('')}
       </div>
       ${memberRows}`;
  }

  /* ---------- Основная информация: атрибутный состав ---------- */
  function profile(data) {
    const attributes = [
      ['Наименование компании', data.name],
      ['ИНН', data.inn],
      ['ОГРН', data.ogrn || '—'],
      ['КПП', data.kpp || '—'],
      ['Адрес', data.address || '—'],
      ['ОКВЭД', data.okved ? `${data.okved} — ${data.okved_name || ''}` : '—'],
      ['Группа компаний', data.group ? data.group.name : 'Отсутствует'],
    ];
    const rows = attributes.map(([key, value]) =>
      `<tr><td>${Format.escape(key)}</td><td class="value-cell">${Format.escape(value)}</td></tr>`).join('');

    return head('Основная информация', '') +
      `<div class="table-wrap"><table>
        <thead><tr><th>Атрибут</th><th>Значение</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  return { indicators, limits, sublimits, reserves, events, group, profile };
})();
