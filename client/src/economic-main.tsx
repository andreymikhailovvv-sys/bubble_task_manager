import React from 'react';
import ReactDOM from 'react-dom/client';
import './economic-base.css';
const EconomicApp = React.lazy(() => import('./EconomicApp'));
// The Android WebView loads /economic with explicit viewport and theme params.
const economicParams = new URLSearchParams(window.location.search);
const isMobileEconomic = economicParams.get('mobile') === '1';
const themeParam = economicParams.get('mobileTheme');
const economicThemeOverride = themeParam === 'light' || themeParam === 'dark' ? themeParam : undefined;

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
      <React.Suspense fallback={null}><EconomicApp mobile={isMobileEconomic} themeOverride={economicThemeOverride} /></React.Suspense>
    </EconomicErrorBoundary>
  </React.StrictMode>
);
