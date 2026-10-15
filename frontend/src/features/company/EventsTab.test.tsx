import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventsTab } from './EventsTab';

describe('EventsTab', () => {
  it('показывает пример событий и фильтры прототипа', () => {
    render(<EventsTab />);
    expect(screen.getByText(/Раздел в разработке/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Требуют внимания/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Текущая ликвидность')).toBeInTheDocument();
    expect(screen.getByText('2 за текущий период · 2025')).toBeInTheDocument();
    expect(screen.queryByText('Выручка: рост на 18,6%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Положительная динамика/ }));
    expect(screen.getByText('Выручка: рост на 18,6%')).toBeInTheDocument();
    expect(screen.queryByText('Текущая ликвидность')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Наблюдение/ }));
    expect(screen.getByText('Коэффициент автономии')).toBeInTheDocument();
  });
});
