
export type MascotVariant = 'planner' | 'economic';
export type MascotSkin = { id: string; variant: MascotVariant; name: string; description: string; rank: 0 | 2 | 3 };
export const MASCOT_SKINS: readonly MascotSkin[] = [
  { id:'classic', variant:'planner', name:'Классический', description:'Фирменный Планик без аксессуаров.', rank:0 },
  { id:'northern', variant:'planner', name:'Север', description:'Объёмный вязаный шарф, шапка и варежки. При наведении греет руки.', rank:2 },
  { id:'maestro', variant:'planner', name:'Маэстро', description:'Бордовый берет и шейный платок с золотой булавкой.', rank:0 },
  { id:'wizard', variant:'planner', name:'Астролог', description:'Звёздная шляпа и прилегающая накидка. Магический шар и расклад карт.', rank:3 },
  { id:'classic', variant:'economic', name:'Классический', description:'Фирменный Экономыч без аксессуаров.', rank:0 },
];
export function findMascotSkin(variant: unknown, id: unknown): MascotSkin | undefined {
  return MASCOT_SKINS.find(skin => skin.variant === variant && skin.id === id);
}
export function effectiveMascotSkin(variant: MascotVariant, id: unknown, rank: number): string {
  const skin = findMascotSkin(variant, id);
  return skin && rank >= skin.rank ? skin.id : 'classic';
}
