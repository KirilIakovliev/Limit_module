/* ============================================================
   Сборка: поиск -> «Обработка» -> дерево вкладок -> выгрузка.
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
     «Обработка», параллельная загрузка всех разделов, сборка дерева.
     Прежние данные не переиспользуются. */
  TabTree.onOpenCompany(async companyId => {
    document.body.classList.add('is-searching');
    resultPanel.classList.add('is-visible');
    TabTree.clear();
    hideActionBar();
    errorBox.classList.remove('is-visible');
    processing.classList.add('is-visible');
    processingNote.textContent = 'Открываем карточку компании';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const company = await API.company(companyId);
      if (!company) throw new Error('Компания не найдена');
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
      const [profile, indicators, limits, sublimits, reserves] = await Promise.all([
        API.profile(company.id),
        API.indicators(company.id),
        API.limits(company.id),
        API.sublimits(company.id),
        API.reserves(company.id),
      ]);
      const data = { profile, indicators, limits, sublimits, reserves };
      loaded = { company, data };

      processing.classList.remove('is-visible');
      TabTree.render(company, data);
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

  /* Когда справочник компаний обновлялся последний раз.
     Если бэкенда нет — честно говорим, что данные демонстрационные. */
  async function updateFreshness() {
    if (API.isOffline()) {
      statusChip.textContent = 'демо-данные';
      statusChip.className = 'status-chip is-warning';
      statusChip.title = 'Бэкенд не отвечает, показаны демо-данные';
      statusChip.hidden = false;
      return;
    }

    const meta = await API.meta();
    const stamp = meta && meta.directory && meta.directory.updated_at;
    if (!stamp) { statusChip.hidden = true; return; }

    const moment = new Date(stamp);
    const isToday = moment.toDateString() === new Date().toDateString();
    const time = moment.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = moment.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

    statusChip.textContent = `Последнее обновление ${isToday ? time : day + ' ' + time}`;
    statusChip.className = 'status-chip is-fresh';
    statusChip.title = `Справочник: ${meta.directory.count} компаний · ${moment.toLocaleString('ru-RU')}`;
    statusChip.hidden = false;
  }

  /* ---------- выгрузка ----------
     Вкладка «События» в файл не попадает: это аналитика на лету,
     а не таблица из базы. */
  function downloadExcel() {
    if (!loaded || !loaded.data) return;
    const label = exportButton.lastChild;
    const previousLabel = label.textContent;
    exportButton.disabled = true;
    label.textContent = ' Формируем файл…';
    try {
      ExcelExport.download(loaded.company, loaded.data, API.isOffline());
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
