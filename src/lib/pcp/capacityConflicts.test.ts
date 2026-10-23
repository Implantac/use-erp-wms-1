import { describe, expect, it } from 'vitest';
import { detectScheduleConflicts, findCandidateScheduleConflicts, type ScheduleSlotLike } from './capacityConflicts';

const slot = (overrides: Partial<ScheduleSlotLike>): ScheduleSlotLike => ({
  id: 's1',
  orderNumber: 'OP-1',
  resourceKey: 'Tear 01',
  plannedStart: '2026-10-20T08:00:00-03:00',
  plannedEnd: '2026-10-20T12:00:00-03:00',
  status: 'scheduled',
  ...overrides,
});

describe('finite-capacity schedule conflict detection', () => {
  it('detects overlap on the same resource and reports the overlapping window', () => {
    const conflicts = detectScheduleConflicts([
      slot({}),
      slot({ id: 's2', orderNumber: 'OP-2', plannedStart: '2026-10-20T11:00:00-03:00', plannedEnd: '2026-10-20T15:00:00-03:00' }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      resourceKey: 'Tear 01',
      firstOrderNumber: 'OP-1',
      secondOrderNumber: 'OP-2',
      overlapMinutes: 60,
    });
  });

  it('does not treat adjacent windows or different resources as conflicts', () => {
    expect(detectScheduleConflicts([
      slot({}),
      slot({ id: 's2', plannedStart: '2026-10-20T12:00:00-03:00', plannedEnd: '2026-10-20T16:00:00-03:00' }),
      slot({ id: 's3', resourceKey: 'Tear 02', plannedStart: '2026-10-20T09:00:00-03:00', plannedEnd: '2026-10-20T10:00:00-03:00' }),
    ])).toEqual([]);
  });

  it('ignores completed/cancelled, invalid and resource-less slots instead of inventing capacity', () => {
    expect(detectScheduleConflicts([
      slot({}),
      slot({ id: 'done', status: 'completed', plannedStart: '2026-10-20T09:00:00-03:00', plannedEnd: '2026-10-20T10:00:00-03:00' }),
      slot({ id: 'cancelled', status: 'cancelled', plannedStart: '2026-10-20T09:00:00-03:00', plannedEnd: '2026-10-20T10:00:00-03:00' }),
      slot({ id: 'invalid', plannedStart: 'invalid', plannedEnd: '2026-10-20T10:00:00-03:00' }),
      slot({ id: 'no-resource', resourceKey: ' ', plannedStart: '2026-10-20T09:00:00-03:00', plannedEnd: '2026-10-20T10:00:00-03:00' }),
    ])).toEqual([]);
  });

  it('finds conflicts for a candidate before it is saved', () => {
    const conflicts = findCandidateScheduleConflicts([
      slot({}),
    ], slot({
      id: 'candidate',
      orderNumber: 'OP-9',
      plannedStart: '2026-10-20T10:00:00-03:00',
      plannedEnd: '2026-10-20T13:00:00-03:00',
    }));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].secondOrderNumber).toBe('OP-9');
  });
});
