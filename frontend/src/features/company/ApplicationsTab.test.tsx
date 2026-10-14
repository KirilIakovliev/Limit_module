import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';

const card = { inn: '7707049388', name: 'ПАО «Ростелеком»', kpp: '770401001', group: null, groups_found: 0 };
const meta = { updated_at: '2026-10-02T12:03:49Z', data_date: '2026-10-01', stale: false, stale_after_hours: 24 };

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function renderProfile(applications: unknown[]) {
  vi.stubGlobal('fetch', (input: RequestInfo) => {
    const url = String(input);
    if (url.includes('/api/meta')) return Promise.resolve(json(meta));
    if (url.includes('/limits')) {
      return Promise.resolve(json({ inn: card.inn, limits: [], unified: [], applications }));
    }
    return Promise.resolve(json(card));
  });
  return render(<App router={createMemoryRouter(routes, { initialEntries: ['/company/7707049388'] })} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApplicationsTab', () => {
  it('показывает потенциальные сделки, а выгрузка остаётся на карточке', async () => {
    renderProfile([{
      limit_id: '1',
      owner: 'Корпоративный блок',
      product: 'ЦФА',
      currency: 'RUB',
      status: 'На рассмотрении – Ожидается решение по лимиту',
      status_code: 'pending',
      start_date: '2026-01-30',
      end_date: '2026-12-31',
      lim_value: '500000',
      comment: 'не из витрины',
      is_exceeded: false,
    }]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Лимиты на рассмотрении' }));
    expect(await screen.findByRole('heading', { name: 'Потенциальные сделки' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Лимиты на рассмотрении' })).toHaveAttribute('aria-selected', 'true');
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Продукт', 'Статус', 'Сумма', 'Валюта', 'Дата начала', 'Дата окончания', 'Владелец', 'Комментарий']);
    expect(screen.getByText('ЦФА')).toBeInTheDocument();
    expect(screen.getByText('30.01.2026')).toBeInTheDocument();
    expect(screen.queryByText('не из витрины')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выгрузить в Excel' })).toBeInTheDocument();
    expect(screen.getByText('ПАО «АК БАРС» БАНК')).toBeInTheDocument();
  });

  it('без заявок показывает пустое состояние', async () => {
    renderProfile([]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Лимиты на рассмотрении' }));
    expect(await screen.findByText('Заявок на рассмотрении нет.')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });
});
