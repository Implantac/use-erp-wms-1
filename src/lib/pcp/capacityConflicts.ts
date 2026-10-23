export interface ScheduleSlotLike {
  id: string;
  orderNumber?: string | null;
  /** Explicit machine, work centre or resource identifier. Sector alone is a proxy chosen by the caller. */
  resourceKey?: string | null;
  plannedStart: string;
  plannedEnd: string;
  status?: string | null;
}

export interface ScheduleConflict {
  resourceKey: string;
  firstId: string;
  secondId: string;
  firstOrderNumber: string | null;
  secondOrderNumber: string | null;
  overlapMinutes: number;
  overlapStart: string;
  overlapEnd: string;
}

const IGNORED_STATUSES = new Set(['completed', 'complete', 'cancelled', 'canceled']);

function normalizeResourceKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

interface ParsedSlot extends ScheduleSlotLike {
  resourceKey: string;
  startMs: number;
  endMs: number;
}

function parseSlot(slot: ScheduleSlotLike): ParsedSlot | null {
  const resourceKey = normalizeResourceKey(slot.resourceKey);
  if (!resourceKey || IGNORED_STATUSES.has((slot.status || '').toLowerCase())) return null;
  const startMs = new Date(slot.plannedStart).getTime();
  const endMs = new Date(slot.plannedEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { ...slot, resourceKey, startMs, endMs };
}

/**
 * Detects overlapping planned windows for the same explicit resource.
 * Adjacent windows (end == next start) do not conflict. Slots without a
 * resource, with invalid dates or already completed/cancelled are ignored:
 * this is a planning guard, not proof that capacity was reserved in the DB.
 */
export function detectScheduleConflicts(slots: readonly ScheduleSlotLike[]): ScheduleConflict[] {
  const byResource = new Map<string, { label: string; slots: ParsedSlot[] }>();
  for (const rawSlot of slots) {
    const slot = parseSlot(rawSlot);
    if (!slot) continue;
    const key = slot.resourceKey.toLocaleLowerCase('pt-BR');
    const group = byResource.get(key) ?? { label: slot.resourceKey, slots: [] };
    group.slots.push(slot);
    byResource.set(key, group);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const group of byResource.values()) {
    const sorted = [...group.slots].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const first = sorted[i];
        const second = sorted[j];
        if (second.startMs >= first.endMs) break;
        const overlapStartMs = Math.max(first.startMs, second.startMs);
        const overlapEndMs = Math.min(first.endMs, second.endMs);
        if (overlapEndMs <= overlapStartMs) continue;
        conflicts.push({
          resourceKey: group.label,
          firstId: first.id,
          secondId: second.id,
          firstOrderNumber: first.orderNumber ?? null,
          secondOrderNumber: second.orderNumber ?? null,
          overlapMinutes: Math.round((overlapEndMs - overlapStartMs) / 60000),
          overlapStart: new Date(overlapStartMs).toISOString(),
          overlapEnd: new Date(overlapEndMs).toISOString(),
        });
      }
    }
  }

  return conflicts.sort((a, b) => a.overlapStart.localeCompare(b.overlapStart)
    || a.resourceKey.localeCompare(b.resourceKey)
    || a.firstId.localeCompare(b.firstId));
}

/** Conflicts that a not-yet-saved candidate window would create. */
export function findCandidateScheduleConflicts(
  existing: readonly ScheduleSlotLike[],
  candidate: ScheduleSlotLike,
): ScheduleConflict[] {
  return detectScheduleConflicts([...existing, candidate])
    .filter((conflict) => conflict.firstId === candidate.id || conflict.secondId === candidate.id);
}
