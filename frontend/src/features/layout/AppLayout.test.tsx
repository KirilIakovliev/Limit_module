import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';

describe('AppLayout', () => {
  it('показывает общий заголовок и макет профиля', async () => {
    render(<App router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
    expect(screen.getByRole('heading', { name: 'Лимитный модуль' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Профиль пользователя' }));
    expect(await screen.findByText('Мария Иванова')).toBeInTheDocument();
    expect(screen.getByText('Кредитный аналитик')).toBeInTheDocument();
    const logout = screen.getByText('Выйти').closest('[role="menuitem"]');
    expect(logout).not.toBeNull();
    fireEvent.click(logout!);
    expect(screen.getByRole('heading', { name: 'Поиск компании' })).toBeInTheDocument();
    expect(screen.getByText('ПАО «АК БАРС» БАНК')).toBeInTheDocument();
  });
});
