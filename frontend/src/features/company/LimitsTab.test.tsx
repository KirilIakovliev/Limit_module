import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';
import { formatDay, money } from './format';
import { todayIso } from './limitsView';

const card = {
  inn: '7702070139',
  name: 'Банк ВТБ (ПАО)',
  kpp: '784201001',
  group: { crm_id: '1-VTB', name: 'ГК ВТБ' },
  groups_found: 1,
};

const group = {
  crm_id: '1-VTB',
  name: 'ГК ВТБ',
  summaries: [
    { currency: 'RUB', members: 2, total_limit: '24100000', unified_limit: '213450000', unified_utilized: '6020000', unified_available: '207430000', is_exceeded: false },
    { currency: 'USD', members: 2, total_limit: '200000', unified_limit: '132710', unified_utilized: '112710', unified_available: '20000', is_exceeded: false },
  ],
  members: [],
};

const limits = {
  inn: '7702070139',
  client_name: 'Банк ВТБ (ПАО)',
  applications: [{ product: 'Заявка', status_code: 'pending', status: 'На рассмотрении', is_exceeded: false }],
  unified: [
    { currency: 'RUB', unified_limit: '210450000', unified_utilized: '6020000', unified_available: '204430000' },
    { currency: 'USD', unified_limit: '112710', unified_utilized: '112710', unified_available: '0' },
  ],
  limits: [
    {
      limit_id: '1', owner: 'Инвестиционный блок', product: 'МБК', currency: 'RUB',
      status: 'Активен – Лимит доступен к утилизации', status_code: 'active',
      start_date: '2025-09-12', end_date: '2026-09-11',
      lim_value: '100000000', lim_utiled: '5000000', rest_lim: '95000000',
      rate: '4.5', client_raroc: '4.75', lim_top: 'В пределах норматива Н6', is_exceeded: false,
    },
    {
      limit_id: '2', owner: 'Инвестиционный блок', product: 'Архив МБК', currency: 'RUB',
      status: 'Не активен – Срок действия лимита истёк', status_code: 'inactive',
      start_date: '2025-09-12', end_date: '2026-03-11',
      lim_value: '8000000', lim_utiled: '8000000', rest_lim: '0', is_exceeded: false,
    },
    {
      limit_id: '3', owner: 'Корпоративный блок', product: 'Кредитные операции', currency: 'USD',
      status: 'Активен – Лимит доступен к утилизации', status_code: 'active',
      start_date: '2025-09-12', end_date: '2026-09-11',
      lim_value: '10000000', lim_utiled: '12000000', rest_lim: '0', is_exceeded: true,
    },
  ],
};

const meta = { updated_at: '2026-10-02T12:03:49.657146Z', data_date: '2026-10-01', stale: true, stale_after_hours: 24 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderProfile() {
  vi.stubGlobal('fetch', (input: RequestInfo) => {
    const url = String(input);
    if (url.includes('/api/meta')) return Promise.resolve(json(meta));
    if (url.includes('/api/groups/')) return Promise.resolve(json(group));
    if (url.includes('/limits')) return Promise.resolve(json(limits));
    return Promise.resolve(json(card));
  });
  return render(<App router={createMemoryRouter(routes, { initialEntries: ['/company/7702070139'] })} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LimitsTab', () => {
  it('фильтрует карту по дате и закрытым лимитам', async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole('tab', { name: 'Лимиты' }));
    const established = within(await screen.findByRole('region', { name: 'Установленные лимиты' }));
    const today = formatDay(todayIso());
    expect(screen.getByLabelText('Дата')).toHaveValue(todayIso());
    expect(established.getByText(`Лимиты на ${today}`)).toBeInTheDocument();
    expect(established.getByText('МБК')).toBeInTheDocument();
    expect(established.getByText('Архив МБК')).toBeInTheDocument();
    expect(established.getByText('Кредитные операции')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Показывать закрытые лимиты' })).toBeChecked();
    expect(established.queryByText(/Дата актуализации/)).not.toBeInTheDocument();
    expect(screen.getByText('Дата актуализации данных: 02.10.2026 12:03')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Показывать закрытые лимиты' }));
    expect(established.queryByText('Архив МБК')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-01' } });
    expect(established.getByRole('heading', { name: 'Инвестиционный блок' })).toBeInTheDocument();
    expect(established.getByRole('heading', { name: 'Корпоративный блок' })).toBeInTheDocument();
    expect(established.getByText('МБК')).toBeInTheDocument();
    expect(established.getByText('Кредитные операции')).toBeInTheDocument();
    expect(established.queryByText('Архив МБК')).not.toBeInTheDocument();
    expect(established.queryByText('Заявка')).not.toBeInTheDocument();

    const headers = established.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers[0]).toBe('Продукт');
    expect(headers).toContain('ОУЛ');
    expect(headers[headers.indexOf('ОУЛ') + 1]).toBe('Дата решения ОУЛ');
    expect(headers).not.toContain('Владелец');
    expect(established.getAllByText('нет данных').length).toBeGreaterThan(0);
    expect(established.getByText((text) => text.replace(/\s/g, ' ') === '100 000 000 RUB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Показывать закрытые лимиты' }));
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-02-01' } });
    const closed = established.getByText('Архив МБК').closest('tr');
    expect(closed?.className).toMatch(/closed/);
    expect(established.getByText('Не активен – Срок действия лимита истёк')).toBeInTheDocument();

    fireEvent.mouseEnter(established.getAllByText('ОУЛ')[0]);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Орган установивший лимит');
    fireEvent.mouseEnter(established.getAllByText('Дата решения ОУЛ')[0]);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Орган установивший лимит');

    const aggregate = within(screen.getByRole('region', { name: 'Единый сублимит' }));
    expect(aggregate.getByRole('columnheader', { name: 'Совокупный лимит' })).toBeInTheDocument();
    expect(aggregate.getByText('213,5 млн RUB')).toBeInTheDocument();
    expect(aggregate.getByText('24,1 млн RUB')).toBeInTheDocument();
    expect(aggregate.queryByRole('heading', { name: /Единый сублимит ·/ })).not.toBeInTheDocument();
    expect(aggregate.queryByText('210,5 млн RUB')).not.toBeInTheDocument();
    expect(established.getByText('4,75')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Единый лимит' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Лимиты' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Лимиты на рассмотрении' })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tab', { name: 'Резервы' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('показывает обе строки с одним limit_id и не округляет долю', async () => {
    const duplicated = {
      ...limits,
      limits: [
        {
          limit_id: 'same', owner: 'Инвестиционный блок', product: 'БКФ_ТоргЦб+; Акция ао', currency: '%',
          status: 'Активен – Лимит доступен к утилизации', status_code: 'active',
          lim_value: '0.017000', lim_utiled: '0.000000', rest_lim: '0.017000',
          client_raroc: '0.00', is_exceeded: false,
        },
        {
          limit_id: 'same', owner: 'Инвестиционный блок', product: 'БКФ_ТоргЦб+; Акция ао', currency: '%',
          status: 'Активен – Лимит доступен к утилизации', status_code: 'active',
          lim_value: '-0.020000', lim_utiled: '0.000000', rest_lim: '-0.020000',
          client_raroc: '0.00', is_exceeded: false,
        },
      ],
    };
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      if (url.includes('/api/groups/')) return Promise.resolve(json(group));
      if (url.includes('/limits')) return Promise.resolve(json(duplicated));
      return Promise.resolve(json(card));
    });
    render(<App router={createMemoryRouter(routes, { initialEntries: ['/company/7702070139'] })} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Лимиты' }));
    const established = within(await screen.findByRole('region', { name: 'Установленные лимиты' }));
    expect(established.getAllByText('БКФ_ТоргЦб+; Акция ао')).toHaveLength(2);
    expect(established.getAllByText(money('0.017000', '%'))).toHaveLength(2);
    expect(established.getAllByText(money('-0.020000', '%'))).toHaveLength(2);
    expect(established.getAllByText('0,00')).toHaveLength(2);
    expect(established.getAllByText('0,017 %')).toHaveLength(2);
    expect(established.queryByText('0,017000 %')).not.toBeInTheDocument();
    expect(established.queryByText('0,02 %')).not.toBeInTheDocument();
  });
});
