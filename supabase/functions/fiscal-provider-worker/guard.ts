// Esta função processa filas de várias empresas: apenas chamada interna,
// nunca um usuário comum (mesmo admin de uma empresa), pode acioná-la.
export type WorkerSecrets = { serviceRoleKey?: string; cronSecret?: string };

export function withFiscalWorkerGuard(
  run: (req: Request) => Promise<Response>,
  getSecrets: () => WorkerSecrets,
): (req: Request) => Promise<Response> {
  return async (req) => {
    // Preflight não executa fila nem retorna informações de jobs.
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    }

    const { serviceRoleKey, cronSecret } = getSecrets();
    const authorizedService = Boolean(serviceRoleKey) && req.headers.get('authorization') === `Bearer ${serviceRoleKey}`;
    const authorizedCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    if (!authorizedService && !authorizedCron) {
      return new Response('Unauthorized', { status: 401 });
    }
    return run(req);
  };
}
