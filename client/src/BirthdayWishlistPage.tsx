import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Camera, Check, CreditCard, Gift, Heart, Map as MapIcon, PlugZap,
  RefreshCw, Sparkles, Watch
} from 'lucide-react';
import './BirthdayWishlistPage.css';

type GiftVisual = 'map' | 'camera' | 'charger' | 'bracelet' | 'black-orchid' | 'lip-oil';
type GiftItem = {
  id: GiftVisual;
  name: string;
  subtitle: string;
  shop: string;
  url: string;
  image?: string;
  label: string;
};
type Reservation = { giftId: string; id: string };
type SavedClaim = { reservationId: string; token: string };
type Claims = Partial<Record<GiftVisual, SavedClaim>>;
const API_PATH = '/api/gifts-birthday-8f3c2a91';
const STORAGE_KEY = 'birthday-gifts-8f3c2a91-claims';

const gifts: GiftItem[] = [
  {
    id: 'map', name: 'Карта', subtitle: 'Небольшая подсказка к подарку',
    shop: 'Яндекс Маркет', label: '01',
    url: 'https://market.yandex.ru/cc/BP2EN4'
  },
  {
    id: 'camera', name: 'Фотоаппарат', subtitle: 'Для новых ярких воспоминаний',
    shop: 'Яндекс Маркет', label: '02',
    url: 'https://market.yandex.ru/cc/BP2EjV'
  },
  {
    id: 'charger', name: 'Зарядка', subtitle: 'Полезная вещь на каждый день',
    shop: 'Яндекс Маркет', label: '03',
    url: 'https://market.yandex.ru/cc/BP2Eue'
  },
  {
    id: 'bracelet', name: 'Браслет', subtitle: 'Небольшой, но особенный подарок',
    shop: 'Яндекс Маркет', label: '04',
    url: 'https://market.yandex.ru/cc/BP2FFc'
  },
  {
    id: 'black-orchid', name: 'Black Orchid Parfum', subtitle: 'TOM FORD · парфюм',
    shop: 'Золотое Яблоко', label: '05',
    url: 'https://goldapple.ru/19760314283-black-orchid-parfum',
    image: 'https://www.perfumenz.co.nz/cdn/shop/products/tom-ford-black-orchid-parfum-50ml---2_1519x1519.png?v=1606690032'
  },
  {
    id: 'lip-oil', name: 'Lip Comfort Oil', subtitle: 'CLARINS · масло для губ',
    shop: 'Золотое Яблоко', label: '06',
    url: 'https://goldapple.ru/19000033385-lip-comfort-oil',
    image: 'https://media.sephora.eu/content/dam/gdam/europe/digital/pim/published/C/CLARINS/318780/39668-media_swatch.jpg?scaleHeight=750&scaleMode=fit&scaleWidth=750'
  }
];
const validIds = new Set(gifts.map((gift) => gift.id));

function loadClaims(): Claims {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const safe: Claims = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!validIds.has(key as GiftVisual) || !value || typeof value !== 'object') continue;
      const claim = value as Partial<SavedClaim>;
      if (typeof claim.reservationId === 'string' && typeof claim.token === 'string'
        && /^[0-9a-f]{64}$/.test(claim.token)) {
        safe[key as GiftVisual] = { reservationId: claim.reservationId, token: claim.token };
      }
    }
    return safe;
  } catch {
    return {};
  }
}

function Symbol({ kind }: { kind: GiftVisual }) {
  const props = { strokeWidth: 1.15, size: 110, 'aria-hidden': true as const };
  if (kind === 'camera') return <Camera {...props} />;
  if (kind === 'charger') return <PlugZap {...props} />;
  if (kind === 'bracelet') return <Watch {...props} />;
  if (kind === 'map') return <MapIcon {...props} />;
  if (kind === 'black-orchid') return <Sparkles {...props} />;
  return <Heart {...props} />;
}

function GiftPicture({ gift }: { gift: GiftItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className={'birthday-gift-photo birthday-gift-photo--' + gift.id}>
      <div className="birthday-art-orbit" aria-hidden="true" />
      <div className="birthday-art-symbol"><Symbol kind={gift.id} /></div>
      {gift.image && !imageFailed && (
        <img
          className="birthday-product-image"
          src={gift.image}
          alt={gift.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      )}
      <span className="birthday-photo-number">{gift.label} / 06</span>
    </div>
  );
}

function readErrorMessage(result: unknown): string {
  if (result && typeof result === 'object' && 'error' in result
    && typeof result.error === 'string') return result.error;
  return 'Не удалось сохранить выбор. Попробуйте ещё раз.';
}

export default function BirthdayWishlistPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [claims, setClaims] = useState<Claims>(loadClaims);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API_PATH + '/status', { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Cannot fetch reservations');
      const result = await response.json() as { reservations?: Reservation[] };
      if (!Array.isArray(result.reservations)) throw new Error('Invalid response');
      setReservations(result.reservations);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Виш-лист ко дню рождения';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow, noarchive';
    document.head.append(robots);
    void refresh();
    const refreshOnVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', refreshOnVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshOnVisible);
      robots.remove();
    };
  }, [refresh]);

  const reservedById = useMemo(
    () => new Map(reservations.map((reservation) => [reservation.giftId, reservation.id])),
    [reservations]
  );
  const available = gifts.length - reservations.length;

  const updateClaim = (giftId: GiftVisual, claim?: SavedClaim) => {
    setClaims((previous) => {
      const next = { ...previous };
      if (claim) next[giftId] = claim;
      else delete next[giftId];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  const toggleGift = async (gift: GiftItem) => {
    if (busy || loadError || loading) return;
    const reservedId = reservedById.get(gift.id);
    const ownClaim = claims[gift.id];
    const isOwn = Boolean(reservedId && reservedId === ownClaim?.reservationId);
    if (reservedId && !isOwn) return;
    setBusy(gift.id);
    setNotice('');
    try {
      const response = await fetch(API_PATH + '/' + gift.id + '/reserve', {
        method: isOwn ? 'DELETE' : 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: isOwn ? JSON.stringify({ token: ownClaim?.token }) : '{}'
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          // A reservation changed in another browser. The database remains the authority.
          await refresh();
        }
        throw new Error(readErrorMessage(payload));
      }
      if (isOwn) {
        updateClaim(gift.id);
        setReservations((previous) => previous.filter((row) => row.giftId !== gift.id));
        setNotice('Бронирование снято. Подарок снова свободен.');
      } else {
        const claim = payload as { reservationId?: unknown; token?: unknown };
        if (typeof claim.reservationId !== 'string' || typeof claim.token !== 'string') {
          await refresh();
          throw new Error('Подарок забронирован, но подтверждение не сохранилось. Обновите страницу.');
        }
        updateClaim(gift.id, { reservationId: claim.reservationId, token: claim.token });
        setReservations((previous) => [
          ...previous.filter((row) => row.giftId !== gift.id),
          { giftId: gift.id, id: claim.reservationId as string }
        ]);
        setNotice('Подарок за вами! Остальные гости увидят, что он занят.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось обновить статус.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="birthday-page">
      <div className="birthday-noise" aria-hidden="true" />
      <section className="birthday-hero">
        <div className="birthday-hero-kicker"><span className="birthday-kicker-line" /> A LITTLE BIRTHDAY MAGIC <span className="birthday-kicker-line" /></div>
        <div className="birthday-hero-icon" aria-hidden="true"><Gift size={29} strokeWidth={1.35} /></div>
        <h1>Виш-лист <em>ко дню рождения</em></h1>
        <p className="birthday-hero-copy">Самое приятное в подарке — внимание. А чтобы сюрпризы не повторялись, можно выбрать что-нибудь из этого списка.</p>
        <div className="birthday-hero-bottom">
          <span className="birthday-mini-star" aria-hidden="true">✳</span>
          <span>Маленькие желания, большие эмоции</span>
          <span className="birthday-mini-star" aria-hidden="true">✳</span>
        </div>
      </section>

      <section className="birthday-list-section" aria-label="Список подарков">
        <div className="birthday-list-topline">
          <div>
            <span className="birthday-eyebrow">THE WISH LIST</span>
            <h2>Выберите подарок <span className="birthday-heading-sparkle">✳</span></h2>
            <p>Нажмите «Выбрать подарок», чтобы закрепить его за собой. Отменить выбор можно в этом же браузере.</p>
          </div>
          <div className="birthday-count" aria-live="polite">
            <strong>{loading || loadError ? '—' : available}</strong>
            <span>из {gifts.length} свободно</span>
          </div>
        </div>

        {loadError && (
          <div className="birthday-alert" role="alert">
            <span>Не удалось загрузить актуальную занятость. Выбор временно недоступен.</span>
            <button type="button" onClick={() => { setLoading(true); void refresh(); }}>
              <RefreshCw size={15} /> Обновить
            </button>
          </div>
        )}

        <div className="birthday-gift-grid" aria-busy={busy !== null}>
          {gifts.map((gift) => {
            const reservedId = reservedById.get(gift.id);
            const isReserved = Boolean(reservedId);
            const own = Boolean(reservedId && claims[gift.id]?.reservationId === reservedId);
            const working = busy === gift.id;
            const blocked = loading || loadError || Boolean(busy) || (isReserved && !own);
            return (
              <article key={gift.id} className={'birthday-gift-card' + (isReserved ? ' birthday-gift-card--reserved' : '')}>
                <GiftPicture gift={gift} />
                <div className="birthday-gift-details">
                  <div className="birthday-gift-heading-row">
                    <span className="birthday-gift-shop">{gift.shop}</span>
                    <span className={'birthday-gift-status' + (isReserved ? ' is-reserved' : '')}>
                      <span className="birthday-status-dot" />
                      {loading ? 'Проверяем' : own ? 'Ваш выбор' : isReserved ? 'Уже выбрали' : 'Свободно'}
                    </span>
                  </div>
                  <h3>{gift.name}</h3>
                  <p>{gift.subtitle}</p>
                  <a className="birthday-shop-link" href={gift.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                    Посмотреть в магазине <ArrowUpRight size={16} strokeWidth={1.8} />
                  </a>
                  <label className={'birthday-choice' + (blocked ? ' birthday-choice--disabled' : '') + (own ? ' birthday-choice--own' : '')}>
                    <input type="checkbox" checked={isReserved} disabled={blocked || working} onChange={() => void toggleGift(gift)} />
                    <span className="birthday-custom-check" aria-hidden="true"><Check size={15} strokeWidth={2.8} /></span>
                    <span>{working ? 'Сохраняем...' : own ? 'Вы выбрали · нажмите, чтобы отменить' : isReserved ? 'Подарок уже занят' : 'Выбрать этот подарок'}</span>
                  </label>
                </div>
              </article>
            );
          })}
        </div>
        <div className="birthday-feedback" role="status" aria-live="polite">{notice}</div>
      </section>

      <footer className="birthday-footer">
        <div className="birthday-footer-mark"><Heart size={17} fill="currentColor" /> Made with love</div>
        <span>Спасибо, что делаете этот день особенным.</span>
      </footer>
    </main>
  );
}
