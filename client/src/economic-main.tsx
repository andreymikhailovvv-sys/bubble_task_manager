import React from 'react';
import ReactDOM from 'react-dom/client';
import './economic-base.css';
const EconomicApp = React.lazy(() => import('./EconomicApp'));

class EconomicErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    document.getElementById('economic-boot-splash')?.remove();
    console.error('[Economic] rendering error', error);
  }
  render() {
    return this.state.hasError
      ? <main style={{ padding: 36, color: '#f1dac2' }}>Экономыч AI временно недоступен. Обновите страницу.</main>
      : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EconomicErrorBoundary>
      <React.Suspense fallback={null}><EconomicApp /></React.Suspense>
    </EconomicErrorBoundary>
  </React.StrictMode>
);
