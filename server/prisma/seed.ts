import { PrismaClient, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.task.deleteMany();
  await prisma.sphere.deleteMany();

  const spheres = await prisma.$transaction([
    prisma.sphere.create({ data: { name: 'Работа', color: '#60a5fa' } }),
    prisma.sphere.create({ data: { name: 'Дом', color: '#86efac' } }),
    prisma.sphere.create({ data: { name: 'Здоровье & Спорт', color: '#f472b6' } }),
    prisma.sphere.create({ data: { name: 'Проекты', color: '#fbbf24' } })
  ]);

  const byName = Object.fromEntries(spheres.map((s) => [s.name, s.id]));

  await prisma.task.createMany({
    data: [
      { title: 'Подготовить демо для клиента', sphereId: byName['Работа'], importance: 5, urgency: 5, priorityScore: 5, status: TaskStatus.IN_PROGRESS, dueDate: new Date(Date.now() + 86400000) },
      { title: 'Разобрать входящие письма', sphereId: byName['Работа'], importance: 4, urgency: 3, priorityScore: 3.6, status: TaskStatus.TODO },
      { title: 'Купить продукты', sphereId: byName['Дом'], importance: 3, urgency: 3, priorityScore: 3, status: TaskStatus.TODO, dueDate: new Date(Date.now() + 2 * 86400000) },
      { title: 'Тренировка 5 км', sphereId: byName['Здоровье & Спорт'], importance: 4, urgency: 4, priorityScore: 4, status: TaskStatus.TODO, dueDate: new Date(Date.now() + 86400000) },
      { title: 'Брейншторм идей', sphereId: byName['Проекты'], importance: 3, urgency: 2, priorityScore: 2.6, status: TaskStatus.TODO },
      { title: 'Обновить roadmap', sphereId: byName['Проекты'], importance: 4, urgency: 2, priorityScore: 3.2, status: TaskStatus.IN_PROGRESS }
    ]
  });
}

main().finally(async () => prisma.$disconnect());
