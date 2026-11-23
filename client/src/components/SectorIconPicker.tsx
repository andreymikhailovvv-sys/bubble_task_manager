import {
  BriefcaseBusiness, Heart, House, GraduationCap, Dumbbell, Wallet,
  BookOpen, Palette, Plane, Car, Music2, Star, Target, Laptop,
  Users, ShoppingCart, Sprout, Coffee, CalendarDays, Lightbulb,
  Sparkles, Trophy, Globe2, PawPrint,
  type LucideIcon
} from 'lucide-react';

const ICONS: Array<{ code: string; label: string; Icon: LucideIcon }> = [
  { code: 'briefcase', label: 'Работа', Icon: BriefcaseBusiness },
  { code: 'heart', label: 'Здоровье', Icon: Heart },
  { code: 'home', label: 'Дом', Icon: House },
  { code: 'graduation-cap', label: 'Учёба', Icon: GraduationCap },
  { code: 'dumbbell', label: 'Спорт', Icon: Dumbbell },
  { code: 'wallet', label: 'Финансы', Icon: Wallet },
  { code: 'book-open', label: 'Книги', Icon: BookOpen },
  { code: 'palette', label: 'Творчество', Icon: Palette },
  { code: 'plane', label: 'Поездки', Icon: Plane },
  { code: 'car', label: 'Авто', Icon: Car },
  { code: 'music', label: 'Музыка', Icon: Music2 },
  { code: 'star', label: 'Избранное', Icon: Star },
  { code: 'target', label: 'Цели', Icon: Target },
  { code: 'laptop', label: 'Проекты', Icon: Laptop },
  { code: 'users', label: 'Семья', Icon: Users },
  { code: 'shopping-cart', label: 'Покупки', Icon: ShoppingCart },
  { code: 'sprout', label: 'Природа', Icon: Sprout },
  { code: 'coffee', label: 'Отдых', Icon: Coffee },
  { code: 'calendar', label: 'Планы', Icon: CalendarDays },
  { code: 'lightbulb', label: 'Идеи', Icon: Lightbulb },
  { code: 'sparkles', label: 'Развитие', Icon: Sparkles },
  { code: 'trophy', label: 'Достижения', Icon: Trophy },
  { code: 'globe', label: 'Мир', Icon: Globe2 },
  { code: 'paw-print', label: 'Питомцы', Icon: PawPrint }
];

export function SectorIconGlyph({ code, size = 22 }: { code?: string | null; size?: number }) {
  const Icon = ICONS.find(item => item.code === code)?.Icon ?? BriefcaseBusiness;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}

export function SectorIconPicker({
  selected, onChange
}: {
  selected: string; onChange: (code: string) => void
}) {
  return (
    <fieldset className="miniapp-unified-sector-icon-field">
      <legend>Иконка сектора</legend>
      <div className="miniapp-unified-sector-icon-grid">
        {ICONS.map(({ code, label, Icon }) => (
          <button
            key={code} type="button"
            aria-label={label} title={label} aria-pressed={selected === code}
            className={`miniapp-unified-sector-icon-option ${selected === code ? 'is-selected' : ''}`}
            onClick={() => onChange(code)}>
            <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
