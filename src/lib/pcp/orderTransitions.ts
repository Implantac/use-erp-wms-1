export const VALID_OP_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  planned: ['waiting_material', 'in_progress', 'outsourced'],
  waiting_material: ['planned', 'in_progress'],
  in_progress: ['paused', 'outsourced', 'finishing', 'completed'],
  outsourced: ['in_progress', 'finishing'],
  paused: ['in_progress'],
  finishing: ['completed', 'in_progress'],
  completed: [],
};

/** A UI transition is not authorization to complete an OP or mutate stock. */
export function canChangeOPStatus(current: string, next: string): boolean {
  return next !== 'completed' && !!VALID_OP_TRANSITIONS[current]?.includes(next);
}
