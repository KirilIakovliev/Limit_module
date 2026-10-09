import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { routes } from '../../app/router';

describe('Shell', () => {
  it('показывает оболочку', () => {
    render(<App router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
    expect(screen.getByRole('heading', { name: 'Лимитный модуль' })).toBeInTheDocument();
  });
});
