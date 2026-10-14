import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';
import { compactMoney, formatStamp } from './format';

const card = {
  inn: '7702070139',
  name: 'Банк ВТБ (ПАО)',
  ogrn: null,
  kpp: '784201001',
  address: '220007, Беларусь, г. Минск, ул Московская, д. 14',
  okved: '64.19',
  group: { crm_id: '1-VTB', name: 'ГК ВТБ' },
  groups_found: 1,
};

const group = {
  crm_id: '1-VTB',
  name: 'ГК ВТБ',
  summaries: [
    { currency: 'RUB', members: 2, total_limit: '24100000', unified_limit: '213500000', unified_utilized: '6000000', unified_available: '207400000', is_exceeded: false },
    { currency: 'USD', members: 2, total_limit: '200000', unified_limit: '133000', unified_utilized: '113000', unified_available: '20000', is_exceeded: false },
  ],
  members: [
    { inn: '7702070139', name: 'Банк ВТБ (ПАО)', currency: 'RUB', unified_limit: '210500000', unified_utilized: '6000000', unified_available: '204400000', has_card: true },
    { inn: '101165625', name: 'ЗАО «Банк ВТБ (Беларусь)»', currency: 'RUB', unified_limit: '3000000', unified_utilized: '0', unified_available: '3000000', has_card: true },
    { inn: '0000000001', name: 'Без карточки', currency: 'RUB', unified_limit: null, unified_utilized: null, unified_available: null, has_card: false },
  ],
};

const meta = { updated_at: '2025-09-12T14:35:00', data_date: '2025-09-12', stale: false, stale_after_hours: 24 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderProfile(inn = '7702070139') {
  return render(<App router={createMemoryRouter(routes, { initialEntries: [`/company/${inn}`] })} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('format', () => {
  it('сжимает денежную строку и не сдвигает штамп через Date', () => {
    expect(compactMoney('213500000', 'RUB')).toBe('213,5 млн RUB');
    expect(compactMoney('20000', 'USD')).toBe('20 тыс. USD');
    expect(compactMoney(null, 'RUB')).toBe('—');
    expect(formatStamp('2025-09-12T14:35:00.657146Z')).toBe('12.09.2025 14:35');
  });
});

describe('CompanyPage', () => {
  it('показывает общую информацию, группу и порядок колонок', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      if (url.includes('/api/groups/')) return Promise.resolve(json(group));
      if (url.includes('/api/clients/101165625')) {
        return Promise.resolve(json({ ...card, inn: '101165625', name: 'ЗАО «Банк ВТБ (Беларусь)»' }));
      }
      return Promise.resolve(json(card));
    });
    renderProfile();
    expect(await screen.findByRole('heading', { name: /ГК ВТБ/ })).toBeInTheDocument();
    expect(screen.getByText('Дата актуализации данных: 12.09.2025 14:35')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Общая информация' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Лимиты' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Лимиты' })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('tab', { name: /События/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /События/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Валют:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/участников:/)).not.toBeInTheDocument();
    expect(screen.getByText('213,5 млн RUB')).toBeInTheDocument();
    expect(screen.queryByText('текущая компания')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ГК ВТБ/ }));
    expect(screen.getByRole('button', { name: /ГК ВТБ/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Компании в структуре ГК' })).toBeInTheDocument();
    expect(screen.getByText('текущая компания')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Банк ВТБ (ПАО)' })).not.toBeInTheDocument();
    expect(screen.getByText('карточки нет')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Без карточки' })).not.toBeInTheDocument();
    const titles = screen.getAllByRole('heading').map((heading) => heading.textContent ?? '');
    expect(titles.findIndex((title) => title.includes('ГК ВТБ'))).toBeGreaterThan(titles.findIndex((title) => title.includes('Общая информация')));
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual([
      'Атрибут',
      'Значение',
      'Наименование ГК',
      'Совокупный лимит',
      'Сумма единого лимита',
      'Единый утилизированный лимит',
      'Единый доступный лимит',
      '«Крышка»',
    ]);
    fireEvent.click(screen.getByRole('link', { name: 'ЗАО «Банк ВТБ (Беларусь)»' }));
    expect(await screen.findByRole('heading', { name: /ГК ВТБ/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ГК ВТБ/ }));
    expect(await screen.findByRole('link', { name: 'Банк ВТБ (ПАО)' })).toHaveAttribute('href', '/company/7702070139');
    expect(screen.queryByRole('link', { name: 'ЗАО «Банк ВТБ (Беларусь)»' })).not.toBeInTheDocument();
    expect(screen.getAllByText('нет данных').length).toBeGreaterThanOrEqual(3);
    expect(urls.some((url) => url.includes('/api/groups/1-VTB'))).toBe(true);
    expect(urls.some((url) => url.includes('/limits'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /События/ }));
    expect(await screen.findByText(/Раздел в разработке/)).toBeInTheDocument();
    expect(screen.getByText('Текущая ликвидность')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Общая информация' })).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByRole('link', { name: 'К поиску' }));
    expect(await screen.findByRole('heading', { name: 'Поиск компании' })).toBeInTheDocument();
  });

  it('без группы не показывает блок ГК и не запрашивает его', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/api/meta')) return Promise.resolve(json(meta));
      return Promise.resolve(json({ ...card, ogrn: '1027700198767', group: null, groups_found: 0 }));
    });
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Общая информация' })).toBeInTheDocument();
    expect(screen.getAllByText('1027700198767')).toHaveLength(1);
    expect(screen.getAllByText('Отсутствует').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'ГК ВТБ' })).not.toBeInTheDocument();
    expect(screen.queryByText('Единый лимит')).not.toBeInTheDocument();
    expect(urls.some((url) => url.includes('/api/groups/'))).toBe(false);
  });
});
