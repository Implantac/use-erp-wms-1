import { useId, useRef } from 'react';

/**
 * Cache identity for a continuously resolved read context, NOT authorization.
 * Losing readiness or leaving and returning to the same scope must re-read
 * grants/data, even inside staleTime. A new mount cannot reuse an old epoch.
 */
export function useReadContextEpoch(resolvedContextKey: string | null): string {
  const instanceId = useId();
  const previous = useRef({ key: resolvedContextKey, generation: 0 });
  if (previous.current.key !== resolvedContextKey) {
    // A discarded/concurrent render may cause an extra read, never reuse grants.
    previous.current = { key: resolvedContextKey, generation: previous.current.generation + 1 };
  }
  return `${instanceId}:${previous.current.generation}`;
}
