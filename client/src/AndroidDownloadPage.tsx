import { useEffect, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Download, LockKeyhole, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';

type Release =
  | { available: false }
  | { available: true; versionCode: number; versionName: string; sizeBytes: number;
      publishedAt: string; notes: string; downloadPath: string };

export default function AndroidDownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = () => {
    setLoading(true); setError('');
    void fetch('/api/android/latest', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось проверить опубликованную версию');
        return await response.json() as Release;
      })
      .then(data => setRelease(data))
      .catch(cause => { setRelease(null); setError(cause instanceof Error ? cause.message : 'Сервис временно недоступен'); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);
  const available = release?.available === true;
  const download = available ? '/api/android/download' : undefined;

  return (
    <article className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
      <div className="rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-white via-sky-50 to-violet-100/75 px-6 py-10 shadow-sm sm:px-12 sm:py-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-violet-700">
          <Smartphone size={15}/> Официальное Android-приложение
        </span>
        <div className="mt-6 grid items-center gap-8 md:grid-cols-[1fr_210px]">
          <div>
            <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Планировыч всегда под рукой
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Задачи, привычки, таймлайн и ИИ-ассистент в отдельном Android-приложении.
              Работайте со своим аккаунтом Планировыча, данные синхронизируются с сайтом.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {available ? (
                <a href={download} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:from-violet-700 hover:to-indigo-700">
                  <Download size={19}/> Скачать APK
                </a>
              ) : (
                <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-500">
                  {loading ? 'Проверяем версию…' : 'APK готовится к публикации'}
                </span>
              )}
              <div aria-live="polite" className="text-sm text-slate-600">
                {available ? (
                  <span>Версия <strong>{release.versionName}</strong> · {(release.sizeBytes / 1024 / 1024).toFixed(1)} МБ</span>
                ) : null}
                {error && <span className="text-rose-700">{error}</span>}
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Бесплатная APK для Android 8.0 и новее. Установка подтверждается средствами Android.
            </p>
          </div>
          <div className="mx-auto flex h-52 w-44 flex-col items-center justify-center gap-4 rounded-[2.5rem] border-[7px] border-slate-900 bg-white shadow-xl shadow-indigo-200/50">
            <img src="/icon.png" alt="Значок Планировыча" className="h-20 w-20 rounded-3xl"/>
            <strong className="text-sm text-slate-900">Планировыч AI</strong>
            <span className="h-1 w-12 rounded-full bg-slate-900/80"/>
          </div>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { title:'1. Скачайте', desc:'Загрузите APK с этой страницы на телефон.', Icon:ArrowDownToLine },
          { title:'2. Подтвердите', desc:'Откройте файл и разрешите установку из браузера, если Android запросит доступ.', Icon:ShieldCheck },
          { title:'3. Обновляйтесь', desc:'Планировыч проверяет новые версии и предлагает перейти сюда для установки обновления.', Icon:RefreshCw }
        ].map(({title,desc,Icon}) => (
          <section key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Icon className="mb-3 text-violet-600" size={23}/>
            <h2 className="font-bold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
          </section>
        ))}
      </div>
      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><LockKeyhole size={19} className="text-violet-600"/> Безопасные обновления</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Устанавливайте приложение только по ссылке с planirovych.ru. Android проверяет цифровую подпись:
              новая APK заменит предыдущую только если она подписана тем же ключом и имеет совместимый идентификатор.
              Удалять текущую release-версию перед обновлением не нужно.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Если ранее вы устанавливали отладочную версию с пометкой debug, официальный выпуск
              будет отдельным приложением. Для первого перехода потребуется установить release APK.
            </p>
          </div>
          <CheckCircle2 className="text-emerald-500" size={25}/>
        </div>
        {available && release.notes.trim() && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Что нового в {release.versionName}</h3>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{release.notes.slice(0,1200)}</p>
          </div>
        )}
      </section>
    </article>
  );
}
