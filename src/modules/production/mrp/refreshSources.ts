/** A gross projection is refreshed only when every source was read successfully. */
export async function refreshGrossSources(reads: readonly [() => Promise<boolean>, () => Promise<boolean>, () => Promise<boolean>]): Promise<boolean> {
  const results = await Promise.all(reads.map(read => read()));
  return results.every(Boolean);
}
