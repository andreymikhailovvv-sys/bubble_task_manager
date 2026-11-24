
export type MascotVariant = 'planner' | 'economic';
export type MascotSkin = { id: string; variant: MascotVariant; name: string; description: string; rank: 0 | 2 | 3 };
export const MASCOT_SKINS: readonly MascotSkin[] = [
  { id:'classic', variant:'planner', name:'Классический', description:'Фирменный Планик без аксессуаров.', rank:0 },
  { id:'aviator', variant:'planner', name:'Авиатор', description:'Кожаный шлем, латунные очки и аккуратный шарф.', rank:2 },
  { id:'northern', variant:'planner', name:'Север', description:'Вязаная шапка и уютный изумрудный шарф.', rank:2 },
  { id:'maestro', variant:'planner', name:'Маэстро', description:'Бордовый берет и шейный платок с золотой булавкой.', rank:2 },
  { id:'diplomat', variant:'planner', name:'Дипломат', description:'Графитовая федора, атласные лацканы и бабочка.', rank:3 },
  { id:'orbit', variant:'planner', name:'Орбита', description:'Перламутровый космический шлем и серебряный воротник.', rank:3 },
  { id:'samurai', variant:'planner', name:'Самурай', description:'Лаковый кабуто, золотой гребень и узорчатый воротник.', rank:3 },
  { id:'racer', variant:'planner', name:'Гран-при', description:'Спортивный шлем с контрастной полосой и гоночный воротник.', rank:3 },
  { id:'wizard', variant:'planner', name:'Астролог', description:'Полуночная шляпа со звёздами и бархатная мантия.', rank:3 },
  { id:'classic', variant:'economic', name:'Классический', description:'Фирменный Экономыч без аксессуаров.', rank:0 },
  { id:'treasurer', variant:'economic', name:'Казначей', description:'Зелёный козырёк, золотая фурнитура и галстук.', rank:3 },
  { id:'broker', variant:'economic', name:'Брокер', description:'Элегантный котелок, полосатый воротник и галстук.', rank:3 },
  { id:'reserve', variant:'economic', name:'Золотой резерв', description:'Ювелирная корона и парадная лента.', rank:3 }
];
export function findMascotSkin(variant: unknown, id: unknown): MascotSkin | undefined {
  return MASCOT_SKINS.find(skin => skin.variant === variant && skin.id === id);
}
export function effectiveMascotSkin(variant: MascotVariant, id: unknown, rank: number): string {
  const skin = findMascotSkin(variant, id);
  return skin && rank >= skin.rank ? skin.id : 'classic';
}
