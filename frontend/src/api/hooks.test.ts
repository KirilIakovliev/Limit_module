import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClient, useGroup, useLimits, useSearch } from './hooks';

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrap({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hooks', () => {
  it('не ищет короче 3 символов и не открывает пустой ИНН', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useSearch('ро'), { wrapper: wrapper() });
    renderHook(() => useClient(' '), { wrapper: wrapper() });
    renderHook(() => useLimits(''), { wrapper: wrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('поздний ответ поиска не затирает новый запрос', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal) signals.push(signal);
      const query = new URL(String(input), 'http://local').searchParams.get('q');
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          const inn = query === 'рост' ? '111' : '222';
          resolve(json([{ inn, name: query, kpp: null }]));
        }, query === 'рост' ? 40 : 5);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const { result, rerender } = renderHook(({ q }) => useSearch(q), {
      initialProps: { q: 'рост' },
      wrapper: wrapper(),
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    rerender({ q: 'мтсб' });
    await waitFor(() => expect(result.current.data?.[0]?.inn).toBe('222'));
    expect(signals[0]?.aborted).toBe(true);
    expect(result.current.data?.[0]?.name).toBe('мтсб');
  });

  it('группа грузится только по запросу', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      urls.push(String(input));
      return Promise.resolve(json({ crm_id: '1-T15NKU4', summaries: [], members: [] }));
    });

    const { result, rerender } = renderHook(({ on }) => useGroup('1-T15NKU4', on), {
      initialProps: { on: false },
      wrapper: wrapper(),
    });
    expect(urls).toEqual([]);
    rerender({ on: true });
    await waitFor(() => expect(result.current.data?.crm_id).toBe('1-T15NKU4'));
    expect(urls).toEqual(['/api/groups/1-T15NKU4']);
  });
});
