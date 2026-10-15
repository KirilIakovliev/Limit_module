import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';
import { todayIso } from './limitsView';
import { clearExportDownloads } from './ExportMenu';

const card = { inn: '7702070139', name: 'Банк ВТБ (ПАО)', kpp: '784201001', group: null, groups_found: 0 };
const meta = { updated_at: '2026-10-02T12:03:49Z', data_date: '2026-10-01', stale: false, stale_after_hours: 24 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderCard(fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', fetch);
  return render(<App router={createMemoryRouter(routes, { initialEntries: ['/company/7702070139'] })} />);
}

afterEach(() => {
  clearExportDownloads();
  vi.unstubAllGlobals();
});

describe('ExportMenu', () => {
  it('по умолчанию берёт текущую вкладку и отмечает все разделы частично', async () => {
    renderCard((input) => {
      const url = String(input);
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      return Promise.resolve(json(card));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Выгрузить в Excel' }));
    const box = (name: string) => screen.getByRole('checkbox', { name, hidden: true });
    const all = await screen.findByRole('checkbox', { name: 'Все разделы', hidden: true });
    expect(all).toBePartiallyChecked();
    expect(box('Общая информация')).toBeChecked();
    expect(box('Лимиты')).not.toBeChecked();
    fireEvent.click(all);
    expect(box('Все разделы')).toBeChecked();
    expect(box('Резервы')).toBeChecked();
    fireEvent.click(box('Резервы'));
    expect(box('Все разделы')).toBePartiallyChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена', hidden: true }));
    expect(screen.getByRole('button', { name: 'Выгрузить в Excel' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('отправляет дату и закрытые лимиты и показывает ход', async () => {
    const posts: unknown[] = [];
    renderCard((input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(json({ export_id: 'job-progress' }, 202));
      }
      if (url.includes('/exports/job-progress')) {
        return Promise.resolve(json({
          export_id: 'job-progress',
          status: 'building',
          progress: 42,
          stage: 'Формируем лист «Лимиты»',
        }));
      }
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      if (url.includes('/limits')) return Promise.resolve(json({ inn: card.inn, limits: [], applications: [], unified: [] }));
      return Promise.resolve(json(card));
    });
    fireEvent.click(await screen.findByRole('tab', { name: 'Лимиты' }));
    fireEvent.change(await screen.findByLabelText('Дата'), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Показывать закрытые лимиты' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выгрузить в Excel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Сформировать файл' }));
    expect(await screen.findByText('Формируем Excel · 42%')).toBeInTheDocument();
    expect(screen.getByText('Формируем лист «Лимиты»')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сформировать файл' })).not.toBeInTheDocument();
    expect(posts).toEqual([{
      sections: ['limits'],
      filters: { as_of: '2026-05-01', today: todayIso(), show_closed: false },
    }]);
  });

  it('ошибку показывает без текста исключения и даёт повтор', async () => {
    let posts = 0;
    renderCard((input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        posts += 1;
        if (posts === 1) return Promise.resolve(json({ detail: 'IntegrityError: secret boom' }, 500));
        return Promise.resolve(json({ export_id: 'job-failed' }, 202));
      }
      if (url.includes('/exports/job-failed')) {
        return Promise.resolve(json({
          export_id: 'job-failed',
          status: 'failed',
          progress: 20,
          stage: 'Traceback secret boom',
        }));
      }
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      return Promise.resolve(json(card));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Выгрузить в Excel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Сформировать файл', hidden: true }));
    expect(await screen.findByText('Не удалось сформировать файл')).toBeInTheDocument();
    expect(screen.queryByText(/secret boom/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(posts).toBe(2));
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
    expect(screen.getByText('Не удалось сформировать файл')).toBeInTheDocument();
  });

  it('после готовности само скачивает файл', async () => {
    const calls: string[] = [];
    renderCard((input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST') return Promise.resolve(json({ export_id: 'job-ready' }, 202));
      if (url.includes('/download')) {
        return Promise.resolve(new Response(new Blob(['pk']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="limit_module_7702070139_2026-10-12.xlsx"' },
        }));
      }
      if (url.includes('/exports/job-ready')) {
        return Promise.resolve(json({ export_id: 'job-ready', status: 'ready', progress: 100, stage: 'Готово' }));
      }
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      return Promise.resolve(json(card));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Выгрузить в Excel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Сформировать файл', hidden: true }));
    expect(await screen.findByText('✓ Файл готов')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((item) => item.includes('/download'))).toBe(true));
  });
});
