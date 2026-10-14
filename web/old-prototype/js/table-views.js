/* ============================================================
   Рендер таблиц. Каждая функция возвращает HTML-строку.
   Поля, которых нет в витрине DataHub, показываются как «—» / «нет в витрине».
   ============================================================ */
const TableViews = (() => {

  const head = (title, meta) =>
    `<div class="content-head"><h2>${Format.escape(title)}</h2>${meta ? `<span class="content-meta">${meta}</span>` : ''}</div>`;

  const card = (k, v, accent) =>
    `<div class="card${accent ? ' is-accent' : ''}"><div class="card-key">${k}</div><div class="card-value">${v}</div></div>`;

  const missing = 'нет в витрине';

  /* ---------- Лимиты ---------- */
  function limitRows(items) {
    return items.map(item => `<tr class="${item.is_exceeded ? 'is-exceeded' : ''}">
        <td>${Format.escape(item.owner || '—')}</td>
        <td><span class="badge" title="${Format.escape(item.src_status || '')}">${Format.escape(item.status || '—')}</span></td>
        <td>${Format.money(item.lim_value, item.currency)}</td>
        <td>${Format.money(item.lim_utiled, item.currency)}</td>
        <td>${Format.money(item.rest_lim, item.currency)}</td>
        <td>${Format.escape(item.currency || '—')}</td>
        <td>${Format.date(item.start_date)}</td>
        <td>${Format.date(item.end_date)}</td>
        <td>${Format.escape(item.product || '—')}</td>
        <td>${Format.rate(item.rate)}</td>
        <td class="comment-cell">${Format.escape(item.client_limits || '—')}</td>
        <td>${item.client_raroc == null ? '—' : Format.escape(String(item.client_raroc))}</td>
        <td class="comment-cell">${Format.escape(item.comment || '—')}</td>
        <td class="comment-cell">${Format.escape(item.lim_top || '—')}</td>
        <td class="no-data" title="${missing}">—</td>
        <td class="no-data" title="${missing}">—</td>
      </tr>`).join('');
  }

  function limitBlock(owner, items) {
    return `<h4 class="sub-title">${Format.escape(owner)}</h4>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Владелец</th><th>Статус</th><th>Сумма</th>
          <th>Утилизация</th><th>Доступный</th><th>Валюта</th>
          <th>Дата установления</th><th>Дата окончания</th>
          <th>Продукт</th><th>Ставка</th><th>Совокупный лимит</th>
          <th>RAROC</th><th>Комментарий</th><th>Крышка</th>
          <th title="${missing}">№ договора</th><th title="${missing}">Дата решения</th>
        </tr></thead>
        <tbody>${limitRows(items)}</tbody></table></div>`;
  }

  function applicationsBlock(applications) {
    if (!applications.length) {
      return `<h3 class="block-title">Потенциальные сделки</h3>
              <p class="events-empty">Заявок на рассмотрении нет.</p>`;
    }
    const rows = applications.map(item => `<tr>
        <td><span class="badge is-pending">${Format.escape(item.status || '—')}</span></td>
        <td>${Format.money(item.lim_value, item.currency)}</td>
        <td>${Format.escape(item.currency || '—')}</td>
        <td>${Format.escape(item.product || '—')}</td>
        <td>${Format.date(item.start_date)}</td>
        <td>${Format.date(item.end_date)}</td>
        <td>${Format.escape(item.owner || '—')}</td>
        <td class="no-data" title="${missing}">—</td>
      </tr>`).join('');

    return `<h3 class="block-title">Потенциальные сделки</h3>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Статус</th><th>Сумма</th><th>Валюта</th><th>Продукт</th>
          <th>Дата начала</th><th>Дата окончания</th><th>Владелец</th>
          <th title="${missing}">Комментарий</th>
        </tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  function unifiedCards(unified) {
    if (!unified || !unified.length) return '';
    return unified.map(u => `
      <h4 class="sub-title">Единый сублимит${u.currency ? ' · ' + Format.escape(u.currency) : ''}</h4>
      <div class="cards">
        ${card('Единый сублимит', Format.compact(u.unified_limit, u.currency), true)}
        ${card('Единый доступный сублимит', Format.compact(u.unified_available, u.currency))}
        ${card('Единый утилизированный сублимит', Format.compact(u.unified_utilized, u.currency))}
      </div>`).join('');
  }

  function limits(d) {
    const items = d.limits || [];
    const byOwner = [];
    items.forEach(item => {
      const key = item.owner || '—';
      const last = byOwner[byOwner.length - 1];
      if (!last || last.owner !== key) byOwner.push({ owner: key, items: [item] });
      else last.items.push(item);
    });

    return head('Лимиты', `${items.length} лимитов · ${ (d.applications || []).length } заявок`) +
      `<h3 class="block-title">Установленные лимиты</h3>
       ${byOwner.length ? byOwner.map(b => limitBlock(b.owner, b.items)).join('')
                        : '<p class="events-empty">Установленных лимитов нет.</p>'}
       ${unifiedCards(d.unified)}
       ${applicationsBlock(d.applications || [])}`;
  }

  /* ---------- Сублимиты и резервы: источник не подключён ---------- */
  function disconnected(title) {
    return head(title, '') +
      '<p class="events-empty">Источник данных не подключён.</p>';
  }

  function sublimits() { return disconnected('Сублимиты'); }
  function reserves() { return disconnected('Информация о резервах'); }

  /* ---------- Основная информация: структура группы компаний ---------- */
  const groupCell = (label, value, accent) => `
    <div class="group-cell${accent ? ' is-accent' : ''}">
      ${label ? `<span class="cell-label">${Format.escape(label)}</span>` : ''}
      <span class="cell-value">${value}</span>
    </div>`;

  const selectableCell = (label, value, member, selected) => `
    <button type="button"
            class="group-cell is-selectable${selected ? ' is-selected' : ''}"
            data-inn="${Format.escape(member.inn)}"
            aria-pressed="${selected}">
      <span class="cell-label">${Format.escape(label)}</span>
      <span class="cell-value">${Format.escape(value || '—')}</span>
    </button>`;

  const currentCell = (label, value) => `
    <div class="group-cell is-current">
      <span class="cell-label">${Format.escape(label)}</span>
      <span class="cell-value">${Format.escape(value || '—')}</span>
      <span class="cell-note">текущая компания</span>
    </div>`;

  const staticNameCell = (label, value) => `
    <div class="group-cell">
      <span class="cell-label">${Format.escape(label)}</span>
      <span class="cell-value">${Format.escape(value || '—')}</span>
      <span class="cell-note">карточки нет</span>
    </div>`;

  function group(data, options = {}) {
    const { selectedInn = null, currentInn = null } = options;
    const summaries = data.summaries || [];
    const members = data.members || [];
    const headings = ['Компания', 'ИНН', 'Единый сублимит',
                      'Единый доступный сублимит', 'Единый утилизированный сублимит'];

    const goRow = inn => `
      <div class="go-row">
        <div class="go-cell">
          <button type="button" class="go-button" data-go-inn="${Format.escape(inn)}">Перейти</button>
        </div>
      </div>`;

    const lines = (rows, field) => rows.map(row =>
      `<span class="currency-line${row.is_exceeded ? ' is-exceeded' : ''}">${Format.compact(row[field], row.currency)}</span>`
    ).join('');

    const blocks = summaries.length ? `
      <h3 class="block-title">Единый лимит</h3>
      <div class="group-grid">
        ${groupCell('Сумма единого лимита', lines(summaries, 'unified_limit'), true)}
        ${groupCell('Единый доступный лимит', lines(summaries, 'unified_available'))}
        ${groupCell('Единый утилизированный лимит', lines(summaries, 'unified_utilized'))}
        ${groupCell('Совокупный лимит', lines(summaries, 'total_limit'))}
        ${groupCell('«Крышка»', `<span class="no-data" title="${missing}">нет данных</span>`)}
      </div>` : '';

    // Одна строка на ИНН. Валюты — отдельные строки внутри сумм, без сложения.
    const ordered = [...members].sort((a, b) => (b.inn === currentInn) - (a.inn === currentInn));
    const companies = [];
    for (const member of ordered) {
      let company = companies.find(item => item.inn === member.inn);
      if (!company) {
        company = { inn: member.inn, name: member.name, has_card: member.has_card, rows: [] };
        companies.push(company);
      }
      company.rows.push(member);
    }
    const companyRows = companies.map(company => `
      <div class="group-grid group-grid--members">
        ${company.inn === currentInn
            ? currentCell(headings[0], company.name)
            : company.has_card
              ? selectableCell(headings[0], company.name, company, company.inn === selectedInn)
              : staticNameCell(headings[0], company.name)}
        ${groupCell(headings[1], Format.escape(company.inn))}
        ${groupCell(headings[2], lines(company.rows, 'unified_limit'))}
        ${groupCell(headings[3], lines(company.rows, 'unified_available'))}
        ${groupCell(headings[4], lines(company.rows, 'unified_utilized'))}
      </div>
      ${company.has_card && company.inn === selectedInn ? goRow(company.inn) : ''}`).join('');

    const membersBlock = `
      <div class="block-head">
        <h3 class="block-title">Компании в структуре ГК</h3>
        <span class="block-hint">Выберите наименование компании, чтобы перейти к её карточке</span>
      </div>
      <div class="group-grid group-grid--head">
        ${headings.map(title => `<span>${Format.escape(title)}</span>`).join('')}
      </div>
      ${companyRows || '<p class="events-empty">Участников нет.</p>'}`;

    return head(data.name || 'Группа компаний', `Валют: ${summaries.length} · участников: ${new Set(members.map(m => m.inn)).size}`) +
      (blocks ? blocks + membersBlock : '<p class="events-empty">Нет данных по группе.</p>');
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

  /* ---------- Основная информация: атрибутный состав ---------- */
  function profile(data) {
    const attributes = [
      ['Наименование компании', data.name],
      ['ИНН', data.inn],
      ['ОГРН', data.ogrn || '—'],
      ['КПП', data.kpp || '—'],
      ['Адрес', data.address || '—'],
      ['ОКВЭД', data.okved || '—'],
      ['Группа компаний', data.group ? data.group.name : 'Отсутствует'],
    ];
    const rows = attributes.map(([key, value]) =>
      `<tr><td>${Format.escape(key)}</td><td class="value-cell">${Format.escape(value)}</td></tr>`).join('');

    return head('Основная информация', '') +
      `<div class="table-wrap"><table>
        <thead><tr><th>Атрибут</th><th>Значение</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  return { limits, sublimits, reserves, group, profile, events };
})();
