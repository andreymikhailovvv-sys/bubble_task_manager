import React from 'react';
import { createRoot } from 'react-dom/client';
import AuthEmailPage from './AuthEmailPage';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AuthEmailPage /></React.StrictMode>
);
