import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';

type PrismaTransaction = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const DEFAULT_SPHERES = [
  { key: 'personal', name: 'Личное', color: '#22c55e', icon: 'home' },
  { key: 'work', name: 'Работа', color: '#ec4899', icon: 'briefcase' },
  { key: 'projects', name: 'Проекты', color: '#f97316', icon: 'laptop' }
] as const;

const getCurrentWeekDate = (firstLaunchAt: Date, dayOffset: number, hourUtc: number) => {
  const date = new Date(firstLaunchAt);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date;
};

const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

export const onboardingService = {
  async ensureDefaultsForNewUser(userId: string, firstLaunchAt = new Date(), client: PrismaTransaction = prisma) {
    const existingTasksCount = await client.task.count({ where: { userId } });
    if (existingTasksCount > 0) return;

    const spheres = await Promise.all(
      DEFAULT_SPHERES.map((sphere) => client.sphere.create({
        data: {
          name: sphere.name,
          color: sphere.color,
          icon: sphere.icon,
          userId
        }
      }))
    );
    const sphereByKey = Object.fromEntries(spheres.map((sphere, index) => [DEFAULT_SPHERES[index].key, sphere]));

    const createTask = async (input: {
      title: string;
      description: string;
      sphereKey: keyof typeof sphereByKey;
      importance?: number;
      urgency?: number;
      dueDate?: Date | null;
      subtasks?: Array<{ title: string; description?: string | null; dueDate?: Date | null }>;
    }) => {
      const importance = input.importance ?? 3;
      const urgency = input.urgency ?? 3;
      const task = await client.task.create({
        data: {
          title: input.title,
          description: input.description,
          userId,
          sphereId: sphereByKey[input.sphereKey].id,
          importance,
          urgency,
          priorityScore: calcScore(importance, urgency),
          dueDate: input.dueDate ?? null,
          notifyBeforeMinutes: input.dueDate ? 0 : null
        }
      });

      if (input.subtasks?.length) {
        await client.task.createMany({
          data: input.subtasks.map((subtask) => ({
            title: subtask.title,
            description: subtask.description ?? null,
            userId,
            sphereId: sphereByKey[input.sphereKey].id,
            parentTaskId: task.id,
            importance,
            urgency,
            priorityScore: calcScore(importance, urgency),
            dueDate: subtask.dueDate ?? null,
            notifyBeforeMinutes: subtask.dueDate ? 0 : null
          }))
        });
      }
    };

    await createTask({
      title: 'Добавить первую задачу',
      description: 'Добавить задачу и поставить для нее напоминание.',
      sphereKey: 'personal',
      importance: 4,
      dueDate: null,
      subtasks: [
        { title: 'Выбрать задачу', dueDate: null },
        { title: 'Добавить задачу', dueDate: null }
      ]
    });

    await createTask({
      title: 'Попробовать режим таймлайна',
      description: 'Попробовать режим календаря для знакомства с сервисом',
      sphereKey: 'personal',
      dueDate: getCurrentWeekDate(firstLaunchAt, 1, 10),
      subtasks: [
        {
          title: 'открыть режим таймлайна',
          description: 'Нажать на иконку слева сверху и открыть режим "таймлайн"',
          dueDate: getCurrentWeekDate(firstLaunchAt, 1, 10)
        },
        {
          title: 'Добавить задачу в календарь',
          description: 'Нажать правую кнопку мыши на нужное время и добавить задачу',
          dueDate: getCurrentWeekDate(firstLaunchAt, 1, 11)
        }
      ]
    });

    await createTask({
      title: 'Расписать свои проекты',
      description: 'Добавить свои проекты и разбить их на подзадачи',
      sphereKey: 'projects',
      importance: 5,
      dueDate: getCurrentWeekDate(firstLaunchAt, 2, 12)
    });

    await createTask({
      title: 'Набрать "хороший" рейтинг',
      description: 'Поднять рейтинг (индикатор сверху по центру до состояния "хороший" за счет выполнения задач, подзадач, привычек и обращения к ИИ',
      sphereKey: 'projects',
      dueDate: getCurrentWeekDate(firstLaunchAt, 3, 14)
    });

    await createTask({
      title: 'Расписать рабочие задачи',
      description: 'Добавить рабочие задачи и поставить дедлайны',
      sphereKey: 'work',
      dueDate: getCurrentWeekDate(firstLaunchAt, 4, 10)
    });

    await createTask({
      title: 'Добавь системный промпт к сектору «Работа»',
      description: 'Нажмите на сектор «работа» и укажите общий промпт в поле снизу. Можно написать свой рабочий график, должность и другую информацию, которая позволит ИИ лучше давать подсказки.',
      sphereKey: 'work',
      importance: 2,
      dueDate: null
    });

    await createTask({
      title: 'Создать заметку',
      description: 'Нажмите в правом меню кнопку добавления заметки и создайте ее или перенесите из другого сервиса. Вы можете создавать, редактировать и искать заметки с помощью ИИ в общем чате.',
      sphereKey: 'personal',
      importance: 3,
      dueDate: null
    });
  }
};
