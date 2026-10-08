import { afterEach, describe, expect, it, vi } from 'vitest';
import { callSefaz } from '../../supabase/functions/_shared/sefaz-transport';

const opts = { endpoint: 'https://example.invalid/soap', soapAction: 'action', body: '<soap/>', certB64: 'test', certPassword: 'test' };
afterEach(() => vi.unstubAllGlobals());

describe('SEFAZ transport safety', () => {
  it('never fabricates an authorization when the mTLS proxy is absent', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callSefaz(opts)).rejects.toThrow('Transporte SEFAZ indisponível');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects proxy HTTP failures instead of parsing them as fiscal replies', async () => {
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SEFAZ_MTLS_PROXY_URL' ? 'https://example.invalid/proxy' : undefined } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(callSefaz(opts)).rejects.toThrow('HTTP 503');
  });
});
