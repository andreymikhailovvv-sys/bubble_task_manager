
export type MascotVariant = 'planner' | 'economic';
export type MascotSkin = { id: string; variant: MascotVariant; name: string; description: string; rank: 0 | 2 | 3 };
export const MASCOT_SKINS: readonly MascotSkin[] = [
  { id:'classic', variant:'planner', name:'Верный помощник', description:'Фирменный Планик без аксессуаров.', rank:0 },
  { id:'cat', variant:'planner', name:'Котик концентрации', description:'Кошачьи ушки в цвет корпуса. При размышлении двигаются независимо друг от друга.', rank:0 },
  { id:'northern', variant:'planner', name:'Полярник фокуса', description:'Объёмный вязаный шарф, шапка и варежки. При наведении греет руки.', rank:2 },
  { id:'maestro', variant:'planner', name:'Маэстро привычек', description:'Бордовый берет и шейный платок с золотой булавкой.', rank:0 },
  { id:'zoomer', variant:'planner', name:'Зумер рабочего потока', description:'Короткая светлая причёска, мятная рубашка и смартфон. Листает телефон и убирает его при наведении.', rank:2 },
  { id:'pirate', variant:'planner', name:'Расхититель задач', description:'Красная бандана, жилет и повязка. Изучает карту сокровищ, а при наведении приподнимает повязку.', rank:2 },
  { id:'wizard', variant:'planner', name:'Астролог приоритетов', description:'Звёздная шляпа и прилегающая накидка. Магический шар и расклад карт.', rank:3 },
  { id:'ninja', variant:'planner', name:'Ниндзя дедлайнов', description:'Тёмная повязка, сложенные руки и прищуренный взгляд. Исчезает в дыму при наведении и возвращается.', rank:3 },
  { id:'space', variant:'planner', name:'Космонавт продуктивности', description:'Прозрачный шлем и скафандр. В невесомости делает оборот, а при размышлении принимает сигнал спутника.', rank:3 },
  { id:'classic', variant:'economic', name:'Верный казначей', description:'Фирменный Экономыч без аксессуаров.', rank:0 },
  { id:'cat', variant:'economic', name:'Котик накоплений', description:'Золотистые кошачьи ушки. При размышлении двигаются независимо друг от друга.', rank:0 },
  { id:'king', variant:'economic', name:'Король', description:'Рубиновый скипетр, золотая корона, драгоценности и бархатный трон. Приветствует короной и опирается на скипетр при размышлении.', rank:3 },
  { id:'banker', variant:'economic', name:'Хранитель бюджета', description:'Белая рубашка, красный галстук и очки. Пересчитывает деньги и складывает их в портфель.', rank:2 },
];
export function findMascotSkin(variant: unknown, id: unknown): MascotSkin | undefined {
  return MASCOT_SKINS.find(skin => skin.variant === variant && skin.id === id);
}
export function effectiveMascotSkin(variant: MascotVariant, id: unknown, rank: number): string {
  const skin = findMascotSkin(variant, id);
  return skin && rank >= skin.rank ? skin.id : 'classic';
}
