import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';

const company = { inn: '7702070139', name: 'Банк ВТБ (ПАО)', kpp: '784201001' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderSearch() {
  return render(<App router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'ИНН или название компании' }), { target: { value } });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SearchPage', () => {
  it('показывает пустое состояние и не ищет короткий запрос', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderSearch();
    expect(screen.getByRole('heading', { name: 'Лимитный модуль' })).toBeInTheDocument();
    expect(screen.getByText('Результат поиска появится здесь')).toBeInTheDocument();
    typeQuery('вт');
    expect(screen.getByRole('button', { name: 'Найти' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Поиск компании' }));
    await delay(420);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Введите ИНН или название компании, чтобы найти организацию')).toBeInTheDocument();
  });

  it('ищет по кнопке и по Enter', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json([company])));
    vi.stubGlobal('fetch', fetchMock);
    renderSearch();
    typeQuery('  ВТБ  ');
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 200 });
    expect(await screen.findByText('Банк ВТБ (ПАО)')).toBeInTheDocument();
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toContain('q=%D0%92%D0%A2%D0%91');

    typeQuery('7702070139');
    fireEvent.submit(screen.getByRole('form', { name: 'Поиск компании' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 200 });
    expect(await screen.findByText('7702070139')).toBeInTheDocument();
  });

  it('ищет сам после паузы и не шлёт запрос на каждый символ', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json([company])));
    vi.stubGlobal('fetch', fetchMock);
    renderSearch();
    typeQuery('ВТБ');
    await delay(150);
    typeQuery('ВТББ');
    await delay(150);
    expect(fetchMock).not.toHaveBeenCalled();
    await delay(260);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toContain('q=%D0%92%D0%A2%D0%91%D0%91');
    expect(await screen.findByText('Банк ВТБ (ПАО)')).toBeInTheDocument();
  });

  it('оставляет на экране ответ последнего запроса', async () => {
    const pending: Array<(value: Response) => void> = [];
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => { pending.push(resolve); }));
    renderSearch();
    typeQuery('ВТБ');
    await delay(400);
    typeQuery('Банк');
    await delay(400);
    expect(pending).toHaveLength(2);
    pending[1]?.(json([{ inn: '2', name: 'Ак Барс', kpp: '165501001' }]));
    expect(await screen.findByText('Ак Барс')).toBeInTheDocument();
    pending[0]?.(json([company]));
    await delay(30);
    expect(screen.getByText('Ак Барс')).toBeInTheDocument();
    expect(screen.queryByText('Банк ВТБ (ПАО)')).not.toBeInTheDocument();
  });

  it('показывает загрузку, затем одну карточку и открывает профиль', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    renderSearch();
    typeQuery('ВТБ');
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByText('Ищем компанию...')).toBeInTheDocument();
    resolveFetch(json([company, { inn: '200', name: 'Ещё одна', kpp: null }]));
    expect(await screen.findByText('Найдено: 2')).toBeInTheDocument();
    expect(screen.getByText('784201001')).toBeInTheDocument();
    expect(screen.getByText('Ещё одна')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    const profile = screen.getAllByRole('link', { name: 'Открыть профиль' })
      .find((link) => link.getAttribute('href')?.includes('7702070139'));
    fireEvent.click(profile!);
    expect(await screen.findByRole('link', { name: 'К поиску' })).toBeInTheDocument();
  });

  it('показывает «не найдено» без ошибки и очищает поиск', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(json([])));
    renderSearch();
    typeQuery('Ромашка 123');
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByRole('heading', { name: 'Компания не найдена' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(screen.getByText('Результат поиска появится здесь')).toBeInTheDocument();
  });

  it('показывает ошибку сети и 503 без текста исключения и повторяет запрос', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ detail: 'Витрины на отображение ещё не загружены' }, 503))
      .mockResolvedValueOnce(json([company]));
    vi.stubGlobal('fetch', fetchMock);
    renderSearch();
    typeQuery('7702070139');
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить поиск');
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить поиск');
    expect(screen.queryByText('Витрины на отображение ещё не загружены')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Банк ВТБ (ПАО)')).toBeInTheDocument();
  });
});
