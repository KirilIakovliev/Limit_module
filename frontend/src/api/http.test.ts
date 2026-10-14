import { afterEach, describe, expect, it, vi } from 'vitest';
import { client, limits, meta, searchClients } from './endpoints';
import { ApiError, getJson } from './http';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('http', () => {
  it('оставляет ИНН, деньги и даты строками', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/meta')) return Promise.resolve(json({ data_date: '2026-04-29', updated_at: '2026-04-29T10:00:00', stale: false, stale_after_hours: 24 }));
      if (url.endsWith('/limits')) {
        return Promise.resolve(json({
          inn: '0278938706',
          limits: [{ lim_value: '1000.50', start_date: '2026-04-29', end_date: null, status_code: 'active', is_exceeded: false }],
          applications: [],
          unified: [],
        }));
      }
      return Promise.resolve(json({ inn: '0278938706', name: 'Тест', groups_found: 0 }));
    });

    const card = await client('0278938706');
    const row = (await limits('0278938706')).limits[0];
    const freshness = await meta();

    expect(card?.inn).toBe('0278938706');
    expect(typeof row?.lim_value).toBe('string');
    expect(row?.lim_value).toBe('1000.50');
    expect(row?.start_date).toBe('2026-04-29');
    expect(freshness?.data_date).toBe('2026-04-29');
    expect(row?.start_date).not.toBeInstanceOf(Date);
  });

  it('разбирает 404 и 503', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      const status = String(input).includes('missing') ? 404 : 503;
      const detail = status === 404 ? 'Клиент не найден' : 'Витрины на отображение ещё не загружены';
      return Promise.resolve(json({ detail }, status));
    });

    await expect(client('missing')).rejects.toMatchObject({ name: 'ApiError', status: 404, detail: 'Клиент не найден' });
    await expect(getJson('/down')).rejects.toMatchObject({ status: 503, detail: 'Витрины на отображение ещё не загружены' });
  });

  it('сетевой сбой — status 0, отмена не становится ApiError', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(getJson('/health')).rejects.toMatchObject({ status: 0, name: 'ApiError' });

    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', (_input: RequestInfo, init?: RequestInit) => {
      if (init?.signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
      return Promise.resolve(json({}));
    });
    await expect(getJson('/health', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(getJson('/health', controller.signal)).rejects.not.toBeInstanceOf(ApiError);
  });

  it('не вызывает fetch для короткого поиска и пустого ИНН', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => searchClients('ро')).toThrow('Поиск короче 3 символов');
    expect(() => client('  ')).toThrow('ИНН пуст');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('карточка и лимиты запрашиваются параллельно', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      urls.push(String(input));
      const url = String(input);
      if (url.endsWith('/limits')) return Promise.resolve(json({ inn: '0278938706', limits: [], applications: [], unified: [] }));
      return Promise.resolve(json({ inn: '0278938706', groups_found: 0 }));
    });

    const card = client('0278938706');
    const rows = limits('0278938706');
    expect(urls).toEqual(['/api/clients/0278938706', '/api/clients/0278938706/limits']);
    await Promise.all([card, rows]);
  });
});
