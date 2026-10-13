import { describe, expect, it, vi } from 'vitest';
import { refreshGrossSources } from './refreshSources';

describe('atualização de fontes da projeção bruta', () => {
  it('consulta as três fontes e confirma somente se todas passaram', async () => {
    const reads = [vi.fn(async () => true), vi.fn(async () => true), vi.fn(async () => true)] as const;
    expect(await refreshGrossSources(reads)).toBe(true);
    reads.forEach(read => expect(read).toHaveBeenCalledOnce());
  });
  it('reprova falha de qualquer consulta e não mascara exceções', async () => {
    expect(await refreshGrossSources([async () => true, async () => false, async () => true])).toBe(false);
    await expect(refreshGrossSources([async () => true, async () => { throw Error('offline'); }, async () => true])).rejects.toThrow('offline');
  });
});
