import { Link, createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from '../features/layout/AppLayout';
import { CompanyPage } from '../features/company/CompanyPage';
import { SearchPage } from '../features/search/SearchPage';

function MissingPage() {
  return (
    <section>
      <h2>Страница не найдена</h2>
      <p><Link to="/">К поиску</Link></p>
    </section>
  );
}

/** Следующие экраны добавляются в этот список. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'company/:inn', element: <CompanyPage /> },
      { path: '*', element: <MissingPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
