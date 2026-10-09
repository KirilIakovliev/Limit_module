import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createAppRouter } from './app/router';
import '@mantine/core/styles.css';
import './styles/tokens.css';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Элемент #root не найден');

const router = createAppRouter();

createRoot(root).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
);
