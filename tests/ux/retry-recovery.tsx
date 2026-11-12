/** QA-19: fixture de COMPONENTE, nao rota/jornada de producao.
 * Usa os componentes reais, QueryClient real e SDK travado contra SQL/RLS
 * descartaveis. Nao injeta dados no cache nem substitui respostas de sucesso.
 * As chaves sobrepostas sao deliberadamente adversariais, nao uma afirmacao
 * de que todas coexistem hoje na mesma pagina do ERP.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { BackendErrorBanner } from '../../src/shared/components/BackendErrorBanner';
import { BackendLoadingNotice } from '../../src/shared/components/BackendLoadingNotice';
import '../../src/index.css';

type Row = Record<string, unknown> & { id: string };
type Resource = 'orders' | 'purchase_orders' | 'products';
type Bootstrap = {
  marker: string; api: string; anonKey: string; accessToken: string;
  expected: Record<Resource, string>;
};
declare global { interface Window { __QA19_RETRY__?: Bootstrap } }
const bootstrap = window.__QA19_RETRY__;
const root = createRoot(document.getElementById('root')!);
if (!bootstrap || bootstrap.marker !== 'QA-01-ISOLATED-E2E' || bootstrap.api !== 'http://127.0.0.1:54321' || !['127.0.0.1', 'localhost'].includes(location.hostname)) {
  root.render(<p>Fixture indisponível fora do ambiente de teste descartável.</p>);
} else {
  const api = createClient(bootstrap.api, bootstrap.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${bootstrap.accessToken}` } },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: {
    staleTime: 60_000, gcTime: 300_000, refetchOnWindowFocus: false,
    retry: (failureCount, error: unknown) => {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) return false;
      return failureCount < 1;
    },
  } } });
  const select: Record<Resource, string> = {
    orders: '*,order_items(*)', purchase_orders: '*,suppliers(name),purchase_order_items(*)', products: '*,categories(name)',
  };
  // Como os hooks atuais, conserva a promise do SDK; nao instala politica
  // propria de timeout, retry nem cancelamento HTTP na fixture.
  const read = (table: Resource) => async (): Promise<Row[]> => {
    const { data, error } = await api.from(table).select(select[table]);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('QA19_DATA_SHAPE');
    return data as unknown as Row[];
  };
  const queries = {
    orders: { queryKey: ['qa19-read'], queryFn: read('orders') },
    purchase_orders: { queryKey: ['qa19-read', 'purchase'], queryFn: read('purchase_orders') },
    products: { queryKey: ['qa19-read', 'purchase', 'products'], queryFn: read('products') },
  };
  function Panel({ table, title, query }: { table: Resource; title: string; query: UseQueryResult<Row[], Error> }) {
    const [uses, setUses] = useState(0);
    const fixture = query.data?.find((row) => row.id === bootstrap!.expected[table]);
    const label = fixture ? String(fixture.number ?? fixture.sku ?? fixture.name ?? fixture.id) : 'Aguardando dados reais';
    return <section data-qa-panel={table} data-status={query.status} data-fetch-status={query.fetchStatus}
      data-has-fixture={!!fixture} className="rounded-lg border bg-background p-3">
      <h2 className="font-semibold">{title}</h2>
      <p data-qa-fixture={table}>{label}</p>
      <p data-qa-rows={table}>{query.data?.length ?? 0} registros reais disponíveis</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="rounded border px-3 py-2" data-qa-refresh={table} onClick={() => { void query.refetch(); }}>Atualizar {title.toLowerCase()}</button>
        <button className="rounded border px-3 py-2" data-qa-use={table} disabled={!fixture} onClick={() => setUses((n) => n + 1)}>Consultar dados exibidos</button>
      </div>
      <output data-qa-uses={table}>{uses}</output>
    </section>;
  }
  function Audit() {
    const orders = useQuery(queries.orders), purchases = useQuery(queries.purchase_orders), products = useQuery(queries.products);
    return <><BackendErrorBanner /><BackendLoadingNotice />
      <main id="main-content" className="mx-auto max-w-3xl space-y-3 px-4 pb-24 pt-48">
        <h1 className="text-xl font-bold">Recuperação seletiva — fixture isolada</h1>
        <p className="text-sm">Componentes reais; dados sintéticos do banco descartável. Não é uma jornada de produção.</p>
        <Panel table="orders" title="Pedidos" query={orders} />
        <Panel table="purchase_orders" title="Compras" query={purchases} />
        <Panel table="products" title="Produtos" query={products} />
      </main></>;
  }
  root.render(<QueryClientProvider client={queryClient}><Audit /></QueryClientProvider>);
}
