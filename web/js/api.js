/* ============================================================
   Клиент API. Единственное место, которое знает про бэкенд.

   GET /api/companies?q=&limit=
   GET /api/companies/{id}
   GET /api/companies/{id}/indicators
   GET /api/companies/{id}/limits
   GET /api/companies/{id}/sublimits
   GET /api/companies/{id}/reserves
   ============================================================ */
const API = (() => {
  const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api';
  let offline = false; // переключается в true, если бэкенд не отвечает

  async function call(path) {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* Если бэкенда нет — работаем на демо-данных, чтобы прототип
     можно было открыть без Docker. В проде удалите fallback. */
  async function withFallback(path, mockFn) {
    if (offline) return mockFn();
    try {
      return await call(path);
    } catch (e) {
      if (typeof DemoData === 'undefined') throw e;
      offline = true;
      console.info(
        `[АББ] Бэкенд не отвечает по ${BASE} (${e.message}) — интерфейс переключён на демо-данные. ` +
        'Для работы с реальной базой запустите docker compose up.'
      );
      return mockFn();
    }
  }

  return {
    isOffline: () => offline,
    meta: () => call('/meta').catch(() => null),
    searchCompanies: q =>
      withFallback(`/companies?q=${encodeURIComponent(q)}&limit=8`, () => DemoData.search(q)),
    company: id => withFallback(`/companies/${id}`, () => DemoData.byId(id)),
    profile: id => withFallback(`/companies/${id}/profile`, () => DemoData.profile(id)),
    indicators: id => withFallback(`/companies/${id}/indicators`, () => DemoData.indicators(id)),
    limits: id => withFallback(`/companies/${id}/limits`, () => DemoData.limits(id)),
    sublimits: id => withFallback(`/companies/${id}/sublimits`, () => DemoData.sublimits(id)),
    reserves: id => withFallback(`/companies/${id}/reserves`, () => DemoData.reserves(id)),
  };
})();
