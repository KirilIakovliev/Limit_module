/* ============================================================
   Клиент API. Единственное место, которое знает про бэкенд.

   GET /api/clients?q=&limit=
   GET /api/clients/{inn}
   GET /api/clients/{inn}/limits
   GET /api/groups/{crmId}
   GET /api/meta
   ============================================================ */
const API = (() => {
  const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api';

  async function call(path) {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  return {
    health: () => call('/health').catch(() => null),
    meta: () => call('/meta').catch(() => null),
    searchCompanies: q => call(`/clients?q=${encodeURIComponent(q)}&limit=8`),
    client: inn => call(`/clients/${encodeURIComponent(inn)}`),
    company: inn => call(`/clients/${encodeURIComponent(inn)}`),
    limits: inn => call(`/clients/${encodeURIComponent(inn)}/limits`),
    group: crmId => call(`/groups/${encodeURIComponent(crmId)}`),
  };
})();
