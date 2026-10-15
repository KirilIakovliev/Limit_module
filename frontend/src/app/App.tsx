import { RouterProvider, type DataRouter } from 'react-router';
import { Providers } from './providers';

export function App({ router }: { router: DataRouter }) {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
