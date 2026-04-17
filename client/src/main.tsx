import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { api } from './lib/api';
import './styles.css';

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Ошибка рендера приложения', error);
    void api.reportClientError({
      source: 'error-boundary',
      message: error.message,
      stack: error.stack,
      url: window.location.href
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="max-w-lg rounded-2xl border border-rose-500/40 bg-slate-900/80 p-4 text-center">
            <h1 className="mb-2 text-lg font-semibold">Не удалось отрисовать интерфейс</h1>
            <p className="text-sm text-slate-300">Ошибка уже отправлена в серверные логи. Обновите страницу или попробуйте позже.</p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  const message = event.error instanceof Error ? event.error.message : event.message;
  const stack = event.error instanceof Error ? event.error.stack : undefined;
  void api.reportClientError({
    source: 'window-error',
    message,
    stack,
    details: `${event.filename ?? 'unknown'}:${event.lineno ?? 0}:${event.colno ?? 0}`,
    url: window.location.href
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reasonText = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unknown rejection');
  const stack = event.reason instanceof Error ? event.reason.stack : undefined;
  void api.reportClientError({
    source: 'unhandledrejection',
    message: reasonText,
    stack,
    url: window.location.href
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
