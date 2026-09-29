/* ============================================================
   Сборка: поиск -> «Обработка» -> дерево вкладок -> выгрузка.
   Ключ клиента — ИНН.
   ============================================================ */
(() => {
  const byId = id => document.getElementById(id);

  const resultPanel = byId('resultPanel'),
        processing = byId('processingIndicator'),
        processingNote = byId('processingNote'),
        errorBox = byId('errorBox'),
        errorMessage = byId('errorMessage'),
        actionBar = byId('actionBar'),
        exportButton = byId('exportButton'),
        statusChip = byId('statusChip');

  let loaded = null;             // { company, data } — то, что показано и выгружается
  let hideActionBarTimer = null; // отложенное скрытие панели

  SearchBar.onSubmit(loadCompany);

  /* Переход на карточку другой компании из структуры ГК.
     Это полноценный новый запрос — тот же цикл, что и при поиске:
     «Обработка», параллельная загрузка разделов, сборка дерева.
     Прежние данные не переиспользуются. */
  TabTree.onOpenCompany(async inn => {
    document.body.classList.add('is-searching');
    resultPanel.classList.add('is-visible');
    TabTree.clear();
    hideActionBar();
    errorBox.classList.remove('is-visible');
    processing.classList.add('is-visible');
    processingNote.textContent = 'Открываем карточку компании';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const company = await API.client(inn);
      if (!company) throw new Error('Клиент не найден');
      await loadCompany(company);
    } catch (error) {
      processing.classList.remove('is-visible');
      errorMessage.textContent =
        'Не удалось открыть карточку выбранной компании. Проверьте соединение с базой и повторите.';
      errorBox.classList.add('is-visible');
      console.error(error);
    }
  });
  byId('retryButton').addEventListener('click', () => loaded && loadCompany(loaded.company));
  byId('resetButton').addEventListener('click', resetView);
  exportButton.addEventListener('click', downloadExcel);

  async function loadCompany(company) {
    loaded = { company, data: null };
    document.body.classList.add('is-searching');
    resultPanel.classList.add('is-visible');
    TabTree.clear();
    hideActionBar();
    errorBox.classList.remove('is-visible');
    processing.classList.add('is-visible');
    processingNote.textContent = `Собираем данные по «${company.name}»`;
    SearchBar.setBusy(true);

    try {
      // все ветки дерева тянем параллельно
      const inn = company.inn;
      const [profile, limits] = await Promise.all([
        API.client(inn),
        API.limits(inn),
      ]);
      const data = { profile, limits };
      loaded = { company: profile, data };

      processing.classList.remove('is-visible');
      TabTree.render(profile, data);
      showActionBar();
    } catch (error) {
      processing.classList.remove('is-visible');
      errorMessage.textContent =
        `Не удалось получить данные по компании «${company.name}». Проверьте соединение с базой и повторите.`;
      errorBox.classList.add('is-visible');
      console.error(error);
    } finally {
      SearchBar.setBusy(false);
    }
  }

  /* ---------- плавающая панель ----------
     Скрытие отложено на время анимации, поэтому таймер обязательно
     снимается при показе: иначе при быстром ответе API панель успевала
     появиться и тут же пряталась сработавшим таймером. */
  function showActionBar() {
    clearTimeout(hideActionBarTimer);
    hideActionBarTimer = null;
    actionBar.hidden = false;
    requestAnimationFrame(() => actionBar.classList.add('is-visible'));
    updateFreshness();
  }

  function hideActionBar() {
    clearTimeout(hideActionBarTimer);
    actionBar.classList.remove('is-visible');
    hideActionBarTimer = setTimeout(() => {
      actionBar.hidden = true;
      hideActionBarTimer = null;
    }, 350);
  }

  async function updateFreshness() {
    const meta = await API.meta();
    if (!meta || !meta.updated_at) { statusChip.hidden = true; return; }

    const stamp = meta.updated_at;
    const moment = new Date(stamp);
    const isToday = moment.toDateString() === new Date().toDateString();
    const time = moment.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = moment.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const when = isToday ? time : `${day} ${time}`;

    if (meta.stale) {
      statusChip.textContent = `актуальность данных не гарантируется (нет обновления > ${meta.stale_after_hours || 24} ч)`;
      statusChip.className = 'status-chip is-warning';
      statusChip.title = `Последнее обновление ${moment.toLocaleString('ru-RU')}`;
    } else {
      statusChip.textContent = `Последнее обновление ${when}`;
      statusChip.className = 'status-chip is-fresh';
      statusChip.title = meta.data_date
        ? `Отчётная дата: ${meta.data_date} · ${moment.toLocaleString('ru-RU')}`
        : moment.toLocaleString('ru-RU');
    }
    statusChip.hidden = false;
  }

  /* ---------- выгрузка ----------
     Вкладки «События» и финотчётность в файл не попадают. */
  function downloadExcel() {
    if (!loaded || !loaded.data) return;
    const label = exportButton.lastChild;
    const previousLabel = label.textContent;
    exportButton.disabled = true;
    label.textContent = ' Формируем файл…';
    try {
      ExcelExport.download(loaded.company, {
        ...loaded.data,
        groupCard: TabTree.getGroupCard && TabTree.getGroupCard(),
      });
    } catch (error) {
      console.error('Не удалось сформировать файл:', error);
      alert('Не удалось сформировать файл. Подробности в консоли.');
    } finally {
      label.textContent = previousLabel;
      exportButton.disabled = false;
    }
  }

  function resetView() {
    document.body.classList.remove('is-searching');
    resultPanel.classList.remove('is-visible');
    hideActionBar();
    setTimeout(() => {
      TabTree.clear();
      errorBox.classList.remove('is-visible');
    }, 400);
    loaded = null;
    SearchBar.reset();
  }
})();
