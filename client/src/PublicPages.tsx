import type { PropsWithChildren } from 'react';
import { PrivacyPolicyContent, PRIVACY_POLICY_REVISION_DATE } from './legal/privacy';

function PublicLayout({ children }: PropsWithChildren) {
  return (
    <main className="public-shell min-h-screen" data-theme="light">
      <header className="public-header surface-topbar border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="mr-auto flex min-w-0 items-center gap-2 text-lg font-semibold text-primary">
            <img src="/icon.png" alt="" className="h-7 w-7 shrink-0 rounded-md" />
            <span>Планировыч AI</span>
          </a>
          <nav aria-label="Основная навигация" className="flex items-center gap-4 text-sm">
            <a href="/about" className="public-nav-link">О сервисе</a>
            <a href="/" className="public-nav-link">Войти</a>
            <a href="/" className="public-nav-link">Регистрация</a>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-200/80">
        <div className="mx-auto flex w-full max-w-5xl px-4 py-6 sm:px-6">
          <a href="/legal/privacy" className="public-secondary-link text-sm">
            Политика обработки персональных данных
          </a>
        </div>
      </footer>
    </main>
  );
}

function AboutPage() {
  return (
    <PublicLayout>
      <article className="public-content mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">О сервисе</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Планировыч AI</h1>
          <p className="mt-4 text-lg leading-8 text-muted">
            Сервис для планирования задач, привычек и повседневных дел в едином рабочем пространстве.
          </p>
        </header>

        <section>
          <h2>Основные возможности</h2>
          <p>Планировыч помогает создавать и упорядочивать задачи, распределять их по сферам и следить за расписанием.</p>
        </section>

        <section>
          <h2>Работа ИИ</h2>
          <p>ИИ-функции помогают работать с задачами и планами. Пользователь самостоятельно проверяет и принимает предложенные результаты.</p>
        </section>

        <section>
          <h2>Поддержка и обратная связь</h2>
          <p>Контактные данные службы поддержки будут размещены здесь после их утверждения.</p>
        </section>

        <section>
          <h2>Правовая информация</h2>
          <ul className="public-link-list">
            <li><a href="/legal/privacy">Политика обработки персональных данных</a></li>
          </ul>
        </section>
      </article>
    </PublicLayout>
  );
}

function PrivacyPage() {
  return (
    <PublicLayout>
      <article className="legal-document mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <header>
          <h1>Политика в отношении обработки персональных данных</h1>
          <p className="legal-revision">Редакция от {PRIVACY_POLICY_REVISION_DATE}</p>
        </header>
        <PrivacyPolicyContent />
      </article>
    </PublicLayout>
  );
}

export default function PublicPages() {
  return window.location.pathname === '/legal/privacy' ? <PrivacyPage /> : <AboutPage />;
}
