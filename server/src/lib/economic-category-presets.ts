/** Categories already available in Economic's manual entry UI. Both AI assistants
 * must see these along with user-created categories before suggesting expenses. */
export const ECONOMIC_BASE_CATEGORIES = {
  INCOME: ['Зарплата','Подработка','Бизнес','Подарки','Проценты','Другое'],
  EXPENSE: ['Продукты','Кафе и рестораны','Транспорт','Жильё','Покупки','Здоровье',
    'Развлечения','Путешествия','Образование','Другое']
} as const;
export function economicAvailableCategories(custom:readonly {kind:string;name:string}[]) {
  return {
    INCOME: [...new Set([...ECONOMIC_BASE_CATEGORIES.INCOME,
      ...custom.filter(item=>item.kind==='INCOME').map(item=>item.name)])],
    EXPENSE: [...new Set([...ECONOMIC_BASE_CATEGORIES.EXPENSE,
      ...custom.filter(item=>item.kind==='EXPENSE').map(item=>item.name)])]
  };
}
