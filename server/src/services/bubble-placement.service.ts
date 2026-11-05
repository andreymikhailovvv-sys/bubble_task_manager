import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

type BubbleActionInput = {
  action: 'move' | 'link' | 'unlink' | 'nest';
  targetTaskId?: string;
  sphereId?: string | null;
  mode?: 'global' | 'sectors';
  x?: number;
  y?: number;
};

const ownedRoot = async (tx: Prisma.TransactionClient, id: string, userId: string) => {
  const task = await tx.task.findFirst({
    where: { id, userId, parentTaskId: null, collaborationId: null, taskType: 'TASK' }
  });
  if (!task) throw new TypeError('Перетаскивать можно только свои обычные задачи.');
  return task;
};

// Task descriptions may be plain text or sanitized rich HTML. Converting to
// rich markup here ensures transferred subtask lists keep their line breaks.
const escapeNote = (value: string) => value.replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const noteAsHtml = (value: string) => /<(?:br|p|div|ul|ol|li|strong|em|a|span)(?:\s|>)/i.test(value)
  ? value : escapeNote(value).replace(/\r?\n/g, '<br>');

const positionPatch = (input: BubbleActionInput) => {
  if (input.mode !== 'global' && input.mode !== 'sectors') throw new TypeError('Неизвестный режим пузырей.');
  if (typeof input.x !== 'number' || !Number.isFinite(input.x) || input.x < 0 || input.x > 900 ||
      typeof input.y !== 'number' || !Number.isFinite(input.y) || input.y < 0 || input.y > 900) {
    throw new TypeError('Некорректная позиция пузыря.');
  }
  return input.mode === 'global'
    ? { bubbleGlobalX: input.x, bubbleGlobalY: input.y }
    : { bubbleSectorX: input.x, bubbleSectorY: input.y };
};

export const bubblePlacementService = {
  apply: async (id: string, userId: string, raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new TypeError('Не указано действие.');
    const input = raw as BubbleActionInput;
    if (!['move', 'link', 'unlink', 'nest'].includes(input.action)) throw new TypeError('Неизвестное действие с пузырём.');
    if (!id || (input.targetTaskId !== undefined && typeof input.targetTaskId !== 'string')) {
      throw new TypeError('Некорректная задача.');
    }

    return prisma.$transaction(async (tx) => {
      const source = await ownedRoot(tx, id, userId);

      if (input.action === 'move' || input.action === 'unlink') {
        const position = positionPatch(input);
        if (input.action === 'move') {
          const sector = input.sphereId;
          if (sector !== undefined && sector !== null) {
            if (typeof sector !== 'string' || !await tx.sphere.findFirst({ where: { id: sector, userId }, select: { id: true } })) {
              throw new TypeError('Сектор не найден.');
            }
          }
          await tx.task.update({
            where: { id: source.id },
            data: { ...position, ...(sector !== undefined ? { sphereId: sector } : {}) }
          });
          return { action: input.action };
        }
        await tx.taskBubbleLink.deleteMany({
          where: { userId, OR: [{ firstTaskId: source.id }, { secondTaskId: source.id }] }
        });
        await tx.task.update({ where: { id: source.id }, data: position });
        return { action: input.action };
      }

      if (!input.targetTaskId || input.targetTaskId === id) throw new TypeError('Выберите другую задачу.');
      const target = await ownedRoot(tx, input.targetTaskId, userId);

      if (input.action === 'link') {
        const existing = await tx.taskBubbleLink.findMany({
          where: { userId, OR: [
            { firstTaskId: source.id }, { secondTaskId: source.id },
            { firstTaskId: target.id }, { secondTaskId: target.id }
          ] }
        });
        if (existing.some((link) =>
          (link.firstTaskId === source.id && link.secondTaskId === target.id) ||
          (link.secondTaskId === source.id && link.firstTaskId === target.id))) {
          return { action: 'link' as const };
        }
        if (existing.length) throw new TypeError('Одна из задач уже связана с другим пузырём. Сначала разъедините пару.');
        const [firstTaskId, secondTaskId] = [source.id, target.id].sort();
        await tx.taskBubbleLink.create({ data: { userId, firstTaskId, secondTaskId, anchorTaskId: target.id } });
        return { action: 'link' as const };
      }

      // Do not silently replace a real task with a new row. The source ID,
      // attachments, comments and its own AI conversation remain intact.
      if (source.isRecurring || source.aiMonitoringEnabled || target.aiMonitoringEnabled || target.status === 'DONE') {
        throw new TypeError('Нельзя вложить повторяющуюся, отслеживаемую задачу или задачу в завершённую/отслеживаемую.');
      }
      const children = await tx.task.findMany({
        where: { parentTaskId: source.id, userId },
        include: {
          subtasks: { select: { id: true } },
          aiConversationMemory: { select: { taskId: true } },
          _count: { select: {
            attachments: true, aiMessages: true, comments: true, activityEvents: true,
            monitoringStatuses: true, monitoringTriggers: true, monitoringRuns: true,
            generatedDocuments: true, aiConversationAttachments: true
          } }
        },
        orderBy: { createdAt: 'asc' }
      });
      if (children.some((child) => child.collaborationId || child.isRecurring || child.aiMonitoringEnabled || child.subtasks.length || child.aiConversationMemory ||
          Object.values(child._count).some((count) => count > 0))) {
        throw new TypeError('У вложенных подзадач есть файлы, переписка или история. Для сохранности данных автоматическое сворачивание недоступно.');
      }
      const summary = children.map((child) => {
        const status = child.status === 'DONE' ? '☑' : '☐';
        const details = [
          child.description ? '<div>' + noteAsHtml(child.description) + '</div>' : '',
          child.dueDate ? '<div>Дедлайн: ' + escapeNote(child.dueDate.toISOString()) + '</div>' : ''
        ].filter(Boolean).join('');
        return '<li>' + status + ' ' + escapeNote(child.title) + details + '</li>';
      }).join('');
      const originalDescription = source.description?.trim() ?? '';
      const description = children.length
        ? [originalDescription ? noteAsHtml(originalDescription) : '',
           '<p><strong>Подзадачи до объединения:</strong></p><ul>' + summary + '</ul>']
          .filter(Boolean).join('<br>')
        : source.description;
      await tx.task.update({
        where: { id: source.id },
        data: { parentTaskId: target.id, sphereId: null, description,
          bubbleGlobalX: null, bubbleGlobalY: null, bubbleSectorX: null, bubbleSectorY: null }
      });
      if (children.length) await tx.task.deleteMany({ where: { userId, parentTaskId: source.id } });
      await tx.taskBubbleLink.deleteMany({
        where: { userId, OR: [{ firstTaskId: source.id }, { secondTaskId: source.id }] }
      });
      return { action: 'nest' as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
};
