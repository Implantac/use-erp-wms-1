import { describe, expect, it, vi } from 'vitest';
import { withFiscalWorkerGuard } from '../../supabase/functions/fiscal-provider-worker/guard';

const secrets = () => ({ serviceRoleKey: 'service-key', cronSecret: 'cron-key' });
const req = (method = 'POST', headers: Record<string, string> = {}) =>
  new Request('http://test.local/functions/v1/fiscal-provider-worker', { method, headers });

describe('worker fiscal: portão interno antes da fila', () => {
  it.each([
    ['anônimo', {}],
    ['usuário autenticado', { authorization: 'Bearer user-jwt' }],
    ['chave anon', { authorization: 'Bearer anon-key' }],
    ['segredo incorreto', { 'x-cron-secret': 'wrong' }],
    ['service role incompleta', { authorization: 'Bearer service' }],
  ])('rejeita %s sem executar o worker', async (_name, headers) => {
    const run = vi.fn(async () => new Response('executou'));
    const response = await withFiscalWorkerGuard(run, secrets)(req('POST', headers));
    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('aceita somente a service role exata ou o segredo cron exato', async () => {
    const run = vi.fn(async () => new Response('executou'));
    const guarded = withFiscalWorkerGuard(run, secrets);
    expect((await guarded(req('POST', { authorization: 'Bearer service-key' }))).status).toBe(200);
    expect((await guarded(req('POST', { 'x-cron-secret': 'cron-key' }))).status).toBe(200);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('falha fechado com segredos ausentes ou vazios', async () => {
    const run = vi.fn(async () => new Response('executou'));
    const guarded = withFiscalWorkerGuard(run, () => ({ serviceRoleKey: '', cronSecret: '' }));
    expect((await guarded(req('POST', { authorization: 'Bearer ', 'x-cron-secret': '' }))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('bloqueia métodos não permitidos mesmo com credencial válida', async () => {
    const run = vi.fn(async () => new Response('executou'));
    const guarded = withFiscalWorkerGuard(run, secrets);
    expect((await guarded(req('GET', { authorization: 'Bearer service-key' }))).status).toBe(405);
    expect((await guarded(req('OPTIONS'))).status).toBe(204);
    expect(run).not.toHaveBeenCalled();
  });
});
