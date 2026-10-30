import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireMonitoredTask, addMonitoringStatus } from './task-monitoring.service.js';
import { taskService } from './task.service.js';

// These function tools are advertised only for an owned root task with beta enabled.
export const TASK_MONITOR_ACTION_TOOLS = [
  {
    type: 'function' as const, name: 'create_monitoring_subtask',
    description: 'Create a useful subtask without a deadline. In monitoring mode only triggers schedule future actions; never set a task or subtask due date.',
    parameters: { type: 'object', additionalProperties: false,
      properties: { title: { type: 'string' }, description: { type: 'string' } },
      required: ['title', 'description'] }, strict: false
  },
  {
    type: 'function' as const, name: 'change_monitoring_importance',
    description: 'Change importance 1..5 only when the task context provides a clear reason. Explain the reason to the user.',
    parameters: { type: 'object', additionalProperties: false,
      properties: { importance: { type: 'integer', minimum: 1, maximum: 5 }, reason: { type: 'string' } },
      required: ['importance', 'reason'] }, strict: false
  },
  {
    type: 'function' as const, name: 'add_monitoring_status',
    description: 'Record a verifiable short progress status after something changes; never claim unverified completion.',
    parameters: { type: 'object', additionalProperties: false,
      properties: { label: { type: 'string' }, detail: { type: 'string' } },
      required: ['label', 'detail'] }, strict: false
  }
];

/** Deferred adapters: integrations will require explicit separate consent. */
export const FUTURE_MONITORING_SOURCES = ['telegram', 'email'] as const;

export async function executeTaskMonitoringAction(input: {
  userId: string; taskId: string; requestId: string; callId: string; name: string; args: unknown;
}) {
  const task = await requireMonitoredTask(input.userId, input.taskId);
  const args = input.args && typeof input.args === 'object' && !Array.isArray(input.args)
    ? input.args as Record<string, unknown> : {};
  if (!TASK_MONITOR_ACTION_TOOLS.some(tool => tool.name === input.name)) return { ok: false, code: 'UNKNOWN_ACTION' };
  // Validate all data before reserving a unique action slot.
  let prepared: { title: string; description: string } | null = null;
  let priority: { value: number; reason: string } | null = null;
  if (input.name === 'create_monitoring_subtask') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    const description = typeof args.description === 'string' ? args.description.trim() : '';
    if (title.length < 3 || title.length > 160 || description.length > 1200) return { ok: false, code: 'INVALID_SUBTASK' };
    const existing = await prisma.task.findFirst({ where: { parentTaskId: task.id, userId: input.userId, status: { not: 'DONE' }, title }, select: { id: true } });
    if (existing) return { ok: true, existingSubtaskId: existing.id, skippedDuplicate: true };
    prepared = { title, description };
  }
  if (input.name === 'change_monitoring_importance') {
    const importance = args.importance;
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (typeof importance !== 'number' || !Number.isInteger(importance) || importance < 1 || importance > 5 || reason.length < 8 || reason.length > 400) {
      return { ok: false, code: 'INVALID_IMPORTANCE' };
    }
    if (importance === task.importance) return { ok: true, unchanged: true, importance };
    priority = { value: importance, reason };
  }
  if (input.name === 'add_monitoring_status') {
    const label = typeof args.label === 'string' ? args.label.trim() : '';
    const detail = typeof args.detail === 'string' ? args.detail.trim() : '';
    if (!label || label.length > 160 || detail.length > 2000) return { ok: false, code: 'INVALID_STATUS' };
  }
  const eventKey = 'monitor-action:' + input.requestId + ':' + input.callId;
  let claim: { id: string };
  try {
    claim = await prisma.taskMonitoringRun.create({ data: {
      taskId: task.id, userId: input.userId, eventKey, kind: input.name
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { ok: false, code: 'ACTION_ALREADY_EXECUTED' };
    throw error;
  }
  try {
    await requireMonitoredTask(input.userId, task.id);
    let result: Record<string, unknown> = { ok: true };
    let announcement = '';
    if (prepared) {
      const created = await taskService.create(input.userId, {
        title: prepared.title, description: prepared.description,
        dueDate: null, sphereId: task.sphereId,
        parentTaskId: task.id, importance: task.importance
      });
      result = { ok: true, subtaskId: created.id };
      announcement = 'ИИ добавил подзадачу «' + prepared.title + '».';
    } else if (priority) {
      const before = task.importance;
      const updated = await taskService.update(task.id, input.userId, { importance: priority.value }, { source: 'ai_monitoring', requestId: input.requestId });
      await prisma.taskActivityEvent.create({ data: {
        taskId: task.id, actorId: input.userId, type: 'monitoring_importance_changed',
        details: { before, after: priority.value, reason: priority.reason, origin: 'ai_monitoring' }
      } });
      result = { ok: true, before, importance: updated.importance, reason: priority.reason };
      announcement = 'ИИ изменил важность: ' + before + ' → ' + priority.value + '. ' + priority.reason;
    } else if (input.name === 'add_monitoring_status') {
      const status = await addMonitoringStatus(input.userId, task.id, args.label, args.detail);
      result = { ok: true, statusId: status.id };
      announcement = 'ИИ зафиксировал статус: ' + status.label;
    }
    if (announcement) await prisma.taskAiMessage.create({ data: {
      taskId: task.id, userId: input.userId, role: 'assistant',
      messageKind: 'MONITOR_ACTION', content: announcement.slice(0, 700)
    } });
    await prisma.taskMonitoringRun.update({ where: { id: claim.id }, data: { state: 'completed' } });
    return result;
  } catch (error) {
    await prisma.taskMonitoringRun.update({ where: { id: claim.id }, data: { state: 'failed' } });
    return { ok: false, code: 'ACTION_FAILED', message: error instanceof Error ? error.message.slice(0, 250) : 'Unknown error' };
  }
}
