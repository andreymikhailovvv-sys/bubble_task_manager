import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const MAX_GROUPS = 40;
const fallbackName = (name: string, id: string) =>
  (name.trim().slice(0, 36) || 'Без названия') + ' · сектор ' + id.slice(-6);

/**
 * Sector groups are durable references, not a one-time copy of sector names.
 * A sector rename/color change is reflected on the next notes-board load.
 * Independent groups and all existing note group IDs remain untouched.
 */
export async function syncSectorNoteGroups(userId: string): Promise<void> {
  const [sectors, groups] = await Promise.all([
    prisma.sphere.findMany({ where: { userId },
      select: { id: true, name: true, color: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.standaloneNoteGroup.findMany({ where: { userId },
      select: { id: true, sphereId: true, name: true, color: true } })
  ]);
  const linked = new Map(groups.filter(group => group.sphereId).map(group => [group.sphereId!, group]));
  const reserved = new Set(groups.filter(group => !group.sphereId).map(group => group.name));
  const planned: Array<{ id: string; name: string; color: string; currentId?: string }> = [];
  for (const sector of sectors) {
    const current = linked.get(sector.id);
    const name = sector.name.trim().slice(0, 50) || 'Без названия';
    // Sector names may collide with independent groups or other sectors.
    // Do not rename/reassign those user-created groups.
    const selected = reserved.has(name) ? fallbackName(name, sector.id) : name;
    reserved.add(selected);
    planned.push({ id: sector.id, name: selected, color: sector.color, currentId: current?.id });
  }
  for (const item of planned) {
    if (item.currentId) {
      const current = linked.get(item.id)!;
      if (current.name === item.name && current.color === item.color) continue;
      try {
        await prisma.standaloneNoteGroup.updateMany({
          where: { id: current.id, userId, sphereId: item.id },
          data: { name: item.name, color: item.color }
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    } else if (groups.length + planned.filter(x => !x.currentId && x.id <= item.id).length <= MAX_GROUPS) {
      await prisma.standaloneNoteGroup.createMany({
        data: [{ userId, sphereId: item.id, name: item.name, color: item.color }],
        skipDuplicates: true
      });
    }
  }
}
