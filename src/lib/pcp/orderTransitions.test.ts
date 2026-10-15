import { describe, expect, it } from 'vitest';
import { canChangeOPStatus, VALID_OP_TRANSITIONS } from './orderTransitions';
describe('transições de OP no cliente', () => {
  it('mantém mudanças válidas do PCP e Kanban', () => {
    expect(canChangeOPStatus('planned', 'in_progress')).toBe(true);
    expect(canChangeOPStatus('in_progress', 'paused')).toBe(true);
    expect(canChangeOPStatus('paused', 'in_progress')).toBe(true);
    expect(canChangeOPStatus('planned', 'outsourced')).toBe(true);
  });
  it('nega conclusão direta, saltos e estados desconhecidos', () => {
    for (const [from, to] of [['in_progress', 'completed'], ['finishing', 'completed'],
      ['planned', 'paused'], ['completed', 'in_progress'], ['planned', 'unknown']]) {
      expect(canChangeOPStatus(from, to)).toBe(false);
    }
    expect(VALID_OP_TRANSITIONS.planned).toContain('waiting_material');
  });
});
