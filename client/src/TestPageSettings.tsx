import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, CalendarClock, Check, ClipboardList, Loader2, Settings2, UserRound, X } from 'lucide-react';
import { api, type CurrentUser } from './lib/api';
import type { ChatMessage } from './lib/types';
import { AiCheckupScheduleSettings } from './components/AiCheckupScheduleSettings';
import { CustomSelect } from './components/CustomSelect';
import type { ThemePreference } from './lib/autoTheme';

const ZONES = [
  'Europe/Moscow','Europe/Kaliningrad','Europe/Samara','Asia/Yekaterinburg','Asia/Omsk','Asia/Krasnoyarsk',
  'Asia/Irkutsk','Asia/Yakutsk','Asia/Vladivostok','Asia/Magadan','Asia/Kamchatka','Europe/Riga',
  'Europe/Berlin','Europe/London','Europe/Istanbul','Asia/Dubai','Asia/Almaty',
  'Asia/Tbilisi','Asia/Tashkent','Asia/Tokyo','Asia/Shanghai','America/New_York',
  'America/Chicago','America/Los_Angeles','UTC'
];
const booleanOptions = [{ value: 'enabled', label: 'Включены' }, { value: 'disabled', label: 'Выключены' }];

type Props = {
  user: CurrentUser;
  themeMode: ThemePreference;
  onThemeMode: (next: ThemePreference) => void;
  onUserUpdated: (user: CurrentUser) => void;
  onCheckup: (message: ChatMessage) => void;
  onClose: () => void;
};

export function TestPageSettings({ user, themeMode, onThemeMode, onUserUpdated, onCheckup, onClose }: Props) {
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [checkupBusy, setCheckupBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: user.name || '', email: user.email || '', username: user.username || '',
    currentPassword: '', newPassword: ''
  });

  useEffect(() => setProfile({
    name: user.name || '', email: user.email || '', username: user.username || '',
    currentPassword: '', newPassword: ''
  }), [user.id]);

  const saveSetting = async (key: string, patch: Parameters<typeof api.updateUserSettings>[0]) => {
    setSaving(key); setError('');
    try {
      const response = await api.updateUserSettings(patch);
      onUserUpdated(response.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить настройку.');
    } finally { setSaving(''); }
  };
  const requestPermission = async () => {
    if (typeof Notification === 'undefined') { setError('В этом браузере системные уведомления недоступны.'); return; }
    try {
      const result = await Notification.requestPermission();
      if (result !== 'granted') setError('Разрешите уведомления в настройках браузера.');
      else setError('');
    } catch { setError('Браузер не разрешил включить уведомления.'); }
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving('profile'); setError('');
    try {
      const response = await api.updateProfile({
        name: profile.name.trim(), email: profile.email.trim(), username: profile.username.trim(),
        ...(profile.currentPassword ? { currentPassword: profile.currentPassword } : {}),
        ...(profile.newPassword ? { newPassword: profile.newPassword } : {})
      });
      onUserUpdated(response.user);
      setProfile(current => ({ ...current, currentPassword: '', newPassword: '' }));
      setProfileOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить профиль.');
    } finally { setSaving(''); }
  };
  const runCheckup = async () => {
    setCheckupBusy(true); setError('');
    try { const result = await api.generateAiCheckupNow(); onCheckup(result.message); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сформировать чекап.'); }
    finally { setCheckupBusy(false); }
  };

  return <div className="tp-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tp-dialog tp-settings-dialog" role="dialog" aria-label="Настройки Планировыча" aria-modal="true">
      <header><div><span className="tp-eyebrow">ПРЕДПОЧТЕНИЯ И АККАУНТ</span><h2>Настройки Планировыча</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><X size={19}/></button></header>
      <div className="tp-dialog-content tp-settings-content">
        {error && <div className="tp-alert" role="alert">{error}<button type="button" onClick={() => setError('')}><X size={15}/></button></div>}
        <div className="tp-setting-row">
          <div><strong><Settings2 size={16}/> Тема интерфейса</strong><p>Автоматическая тема переключается в 20:00 и 05:00 по выбранному часовому поясу.</p></div>
          <div className="tp-theme-switch" role="group" aria-label="Тема интерфейса">
            {(['light','dark','auto'] as const).map(mode => <button key={mode} type="button"
              aria-pressed={themeMode === mode} className={themeMode === mode ? 'selected' : ''}
              onClick={() => onThemeMode(mode)}>{mode === 'light' ? 'Светлая' : mode === 'dark' ? 'Тёмная' : 'Авто'}</button>)}
          </div>
        </div>
        <div className="tp-setting-row"><div><strong><CalendarClock size={16}/> Часовой пояс</strong><p>Используется в расписаниях, уведомлениях и прогрессе за день.</p></div>
          <CustomSelect ariaLabel="Часовой пояс" value={user.timeZone || 'Europe/Moscow'}
            options={[...new Set([user.timeZone || 'Europe/Moscow', ...ZONES])].map(value => ({ value, label:value }))}
            onChange={value => void saveSetting('timezone', { timeZone: value })}
            disabled={saving === 'timezone'}/>
          <button className="tp-text-action" type="button" disabled={!!saving} onClick={() => void saveSetting('timezone', { timeZone: 'Europe/Moscow' })}>Сбросить на Москву</button>
        </div>
        <div className="tp-setting-row"><div><strong><BellRing size={16}/> Уведомления браузера</strong><p>Показываются, когда вкладка Планировыча неактивна. Браузер должен разрешить отправку.</p></div>
          <CustomSelect ariaLabel="Уведомления браузера" value={user.browserNotificationsEnabled === false ? 'disabled' : 'enabled'}
            options={booleanOptions} disabled={saving === 'notifications'}
            onChange={value => void saveSetting('notifications', { browserNotificationsEnabled: value === 'enabled' })}/>
          {user.browserNotificationsEnabled !== false && <button type="button" className="tp-text-action" onClick={() => void requestPermission()}>Разрешить в браузере</button>}
        </div>
        <div className="tp-setting-row"><div><strong><ClipboardList size={16}/> Отчёт о выполнении задачи</strong><p>Предлагать отчёт после закрытия задачи.</p></div>
          <CustomSelect ariaLabel="Отчёт о выполнении" value={user.offerTaskCompletionReport === false ? 'disabled' : 'enabled'}
            options={[{value:'enabled',label:'Включено'},{value:'disabled',label:'Выключено'}]}
            disabled={saving === 'taskReport'}
            onChange={value => void saveSetting('taskReport', { offerTaskCompletionReport: value === 'enabled' })}/>
        </div>
        <div className="tp-setting-row">
          <AiCheckupScheduleSettings user={user} onUserUpdated={onUserUpdated}>
            <button className="tp-secondary" type="button" onClick={() => void runCheckup()} disabled={checkupBusy}>
              {checkupBusy ? <Loader2 size={15} className="tp-spin"/> : <Check size={15}/>}
              Сформировать чекап сейчас
            </button>
            <p className="tp-hint">ИИ-чекап использует реальные задачи и списывает кредиты за фактическое использование модели.</p>
          </AiCheckupScheduleSettings>
        </div>
        <div className="tp-setting-row">
          <button className="tp-setting-expand" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen(value => !value)}>
            <UserRound size={17}/><span>Настройки профиля</span><span>{profileOpen ? 'Свернуть' : 'Изменить'}</span>
          </button>
          {profileOpen && <form className="tp-profile-form" onSubmit={event => void saveProfile(event)}>
            <label>Имя<input value={profile.name} required onChange={e => setProfile(p => ({...p,name:e.target.value}))}/></label>
            <label>Логин<input value={profile.username} required onChange={e => setProfile(p => ({...p,username:e.target.value}))}/></label>
            <label>Email<input type="email" value={profile.email} required onChange={e => setProfile(p => ({...p,email:e.target.value}))}/></label>
            <label>Текущий пароль<input type="password" autoComplete="current-password" value={profile.currentPassword} onChange={e => setProfile(p => ({...p,currentPassword:e.target.value}))}/></label>
            <label>Новый пароль<input type="password" autoComplete="new-password" value={profile.newPassword} onChange={e => setProfile(p => ({...p,newPassword:e.target.value}))}/></label>
            <button type="submit" className="tp-primary" disabled={saving === 'profile'}>{saving === 'profile' ? 'Сохраняем…' : 'Сохранить профиль'}</button>
          </form>}
        </div>
      </div>
    </section>
  </div>;
}
