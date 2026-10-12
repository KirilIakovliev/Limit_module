import { MantineProvider, createTheme, type MantineColorsTuple } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

const green: MantineColorsTuple = [
  '#e7f6ee',
  '#d3efe0',
  '#b7e2c8',
  '#8fd0a6',
  '#5cb87e',
  '#2f9d5c',
  '#1f8a4c',
  '#187541',
  '#115f35',
  '#0c4c2b',
];

const theme = createTheme({
  fontFamily: 'var(--font-sans)',
  primaryColor: 'green',
  primaryShade: 6,
  defaultRadius: 'md',
  colors: { green },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>{children}</MantineProvider>
    </QueryClientProvider>
  );
}
