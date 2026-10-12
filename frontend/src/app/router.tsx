import { AppLayout } from '../features/layout/AppLayout';
import { CompanyPage } from '../features/company/CompanyPage';
import { SearchPage } from '../features/search/SearchPage';
import { createBrowserRouter, type RouteObject } from 'react-router';

/** Следующие экраны добавляются в этот список. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'company/:inn', element: <CompanyPage /> },
    ],
  },
];

/** Vite base `/next/` пишет BASE_URL со слэшем; Router ждёт basename без него. */
export function routerBasename(baseUrl: string): string | undefined {
  if (baseUrl === '/' || baseUrl === '') return undefined;
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed === '' ? undefined : trimmed;
}

export function createAppRouter() {
  return createBrowserRouter(routes, { basename: routerBasename(import.meta.env.BASE_URL) });
}
