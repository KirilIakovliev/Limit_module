/* ============================================================
   Поисковая строка: подсказки после 3 символов, по названию и ИНН.
   Наружу отдаёт onSelect(company) и onSubmit(company).
   ============================================================ */
const SearchBar = (() => {
  const byId = id => document.getElementById(id);

  const input = byId('searchInput'),
        field = byId('searchField'),
        dropdown = byId('suggestionList'),
        submitButton = byId('searchButton'),
        hint = byId('searchHint'),
        clearButton = byId('clearButton');

  let suggestions = [];        // компании, показанные в выпадающем списке
  let highlightedIndex = -1;   // подсвеченная строка списка
  let selectedCompany = null;  // компания, выбранная пользователем
  let requestCounter = 0;      // номер запроса, чтобы отбрасывать устаревшие ответы
  let debounceTimer = null;

  const callbacks = { select: () => {}, submit: () => {} };

  /* ---------- ввод ---------- */
  input.addEventListener('focus', () => field.classList.add('is-focused'));
  input.addEventListener('blur', () => field.classList.remove('is-focused'));

  input.addEventListener('input', () => {
    field.classList.toggle('has-text', input.value.length > 0);
    if (selectedCompany && input.value !== selectedCompany.name && input.value !== selectedCompany.inn) {
      clearSelection();
    }
    const text = input.value.trim();
    clearTimeout(debounceTimer);

    if (text.length < 3) {
      closeDropdown();
      hint.textContent = 'Введите не менее 3 символов';
      return;
    }
    hint.textContent = 'Выберите компанию из списка';
    debounceTimer = setTimeout(() => loadSuggestions(text), 160);
  });

  async function loadSuggestions(text) {
    const requestId = ++requestCounter;
    let result = [];
    try { result = await API.searchCompanies(text); } catch { result = []; }
    if (requestId !== requestCounter) return;   // ответ устарел — пользователь допечатал
    suggestions = result;
    highlightedIndex = -1;
    renderDropdown(text);
  }

  function renderDropdown(text) {
    if (!suggestions.length) {
      dropdown.innerHTML = '<div class="suggestions-empty">Ничего не найдено — проверьте написание или введите ИНН</div>';
      openDropdown();
      return;
    }
    dropdown.innerHTML = suggestions.map((company, i) => `
      <div class="suggestion" role="option" id="suggestion${i}" aria-selected="false" data-index="${i}">
        <span class="suggestion-dot"></span>
        <span>
          <span class="suggestion-name">${highlightMatch(company.name, text)}</span>
          <span class="suggestion-meta">ИНН ${highlightMatch(company.inn, text)} · КПП ${Format.escape(company.kpp || '—')} · ${Format.escape(company.industry || '')}</span>
        </span>
      </div>`).join('');

    dropdown.querySelectorAll('.suggestion').forEach(node => {
      node.addEventListener('mousedown', event => {
        event.preventDefault();
        selectCompany(suggestions[+node.dataset.index]);
      });
      node.addEventListener('mouseenter', () => highlight(+node.dataset.index));
    });
    openDropdown();
  }

  function highlightMatch(value, text) {
    const position = Format.normalize(value).indexOf(Format.normalize(text));
    if (position < 0) return Format.escape(value);
    return Format.escape(value.slice(0, position)) +
           '<b>' + Format.escape(value.slice(position, position + text.length)) + '</b>' +
           Format.escape(value.slice(position + text.length));
  }

  const openDropdown = () => {
    dropdown.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
  };

  const closeDropdown = () => {
    dropdown.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    highlightedIndex = -1;
  };

  function highlight(index) {
    highlightedIndex = index;
    dropdown.querySelectorAll('.suggestion').forEach((node, i) =>
      node.setAttribute('aria-selected', i === index));
    const active = dropdown.querySelector('#suggestion' + index);
    if (active) active.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', 'suggestion' + index);
  }

  /* ---------- клавиатура ---------- */
  input.addEventListener('keydown', event => {
    const isOpen = dropdown.classList.contains('is-open');
    if (event.key === 'ArrowDown' && isOpen) {
      event.preventDefault();
      highlight((highlightedIndex + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && isOpen) {
      event.preventDefault();
      highlight((highlightedIndex - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isOpen && highlightedIndex > -1) selectCompany(suggestions[highlightedIndex]);
      else if (selectedCompany) callbacks.submit(selectedCompany);
    } else if (event.key === 'Escape') {
      closeDropdown();
    }
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.search-area')) closeDropdown();
  });

  /* ---------- выбор компании ---------- */
  function selectCompany(company) {
    selectedCompany = company;
    input.value = company.name;
    field.classList.add('has-text');
    closeDropdown();
    submitButton.disabled = false;
    hint.textContent = 'Компания выбрана — нажмите «Поиск»';
    callbacks.select(company);
  }

  function clearSelection() {
    selectedCompany = null;
    submitButton.disabled = true;
  }

  function reset() {
    input.value = '';
    field.classList.remove('has-text');
    clearSelection();
    closeDropdown();
    hint.textContent = 'Введите не менее 3 символов';
    input.focus();
  }

  clearButton.addEventListener('click', reset);
  submitButton.addEventListener('click', () => {
    if (selectedCompany) callbacks.submit(selectedCompany);
  });

  return {
    onSelect: fn => { callbacks.select = fn; },
    onSubmit: fn => { callbacks.submit = fn; },
    getSelected: () => selectedCompany,
    setBusy: busy => { submitButton.disabled = busy || !selectedCompany; },
    reset,
  };
})();
