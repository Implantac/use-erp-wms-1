import { useMemo, useState } from 'react';
import {
  useDecideGroupRequest,
  useGroupRequests,
  useGroupStock,
} from '@/hooks/operational/store/useGroupReplenishment';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/ui/base/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ui/base/select';
import { Building2, Inbox } from 'lucide-react';

/**
 * Visão do gestor do grupo (indústria + lojas com CNPJ próprio):
 * - estoque consolidado produto x empresa de todo o grupo (RPC com trava
 *   de gestor; fora do grupo a RPC nega);
 * - caixa de decisão das solicitações intercompany: vender/transferir do
 *   CD (gera pedido), remanejar de outra loja do grupo, mandar produzir
 *   ou rejeitar. Nada aqui estima número: tudo vem do ledger e das
 *   solicitações reais.
 */
export function GroupOverviewPanel() {
  const stock = useGroupStock(true);
  const requests = useGroupRequests();
  const decide = useDecideGroupRequest();
  const [sourceById, setSourceById] = useState<Record<string, string>>({});
  const [stockView, setStockView] = useState<'empresa' | 'consolidado'>('empresa');

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of stock.data ?? []) map.set(r.company_id, r.company_name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [stock.data]);

  const byProductCompany = useMemo(() => {
    const map = new Map<string, { code: string; name: string; perCompany: Map<string, number>; total: number }>();
    for (const r of stock.data ?? []) {
      const key = r.product_code || r.product_id;
      if (!map.has(key)) map.set(key, { code: r.product_code, name: r.product_name, perCompany: new Map(), total: 0 });
      const entry = map.get(key)!;
      entry.perCompany.set(r.company_id, (entry.perCompany.get(r.company_id) ?? 0) + Number(r.quantity ?? 0));
      entry.total += Number(r.quantity ?? 0);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  }, [stock.data]);

  const pending = (requests.data ?? []).filter((r) => r.status === 'pendente');

  if (stock.isError && requests.data?.length === 0) {
    return null; // Sem grupo configurado ou sem permissão de gestor: painel some.
  }

  return (
    <div className="space-y-4 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Grupo — estoque consolidado (multi-CNPJ)
          </CardTitle>
          <CardDescription>
            Produto × empresa de todo o grupo (indústria, CD e lojas com CNPJ próprio).
            Para lojas-filiais do mesmo CNPJ, use a matriz de filiais acima.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-2">
            <Button size="sm" variant={stockView === 'empresa' ? 'default' : 'outline'} className="h-7 text-[10px] font-black" onClick={() => setStockView('empresa')}>POR EMPRESA (SEPARADO)</Button>
            <Button size="sm" variant={stockView === 'consolidado' ? 'default' : 'outline'} className="h-7 text-[10px] font-black" onClick={() => setStockView('consolidado')}>CONSOLIDADO DO GRUPO</Button>
          </div>
          {stock.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando estoque do grupo…</p>
          ) : byProductCompany.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem saldos no grupo ainda.</p>
          ) : stockView === 'consolidado' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Estoque total do grupo</TableHead>
                  <TableHead className="text-right">Empresas com saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProductCompany.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-medium">{p.code} — {p.name}</TableCell>
                    <TableCell className="text-right font-semibold">{p.total}</TableCell>
                    <TableCell className="text-right">{[...p.perCompany.values()].filter((q) => q > 0).length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  {companies.map((c) => (
                    <TableHead key={c.id} className="text-right">{c.name}</TableHead>
                  ))}
                  <TableHead className="text-right">Total grupo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProductCompany.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-medium">{p.code} — {p.name}</TableCell>
                    {companies.map((c) => {
                      const q = p.perCompany.get(c.id) ?? 0;
                      return (
                        <TableCell key={c.id} className={`text-right ${q <= 0 ? 'text-destructive font-semibold' : ''}`}>
                          {q}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold">{p.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" /> Solicitações das lojas do grupo
          </CardTitle>
          <CardDescription>
            Decida cada pedido: vender/transferir (gera o pedido intercompany para
            expedição), remanejar de outra loja, mandar produzir ou rejeitar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-semibold">{r.product_code} — {r.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.quantity} {r.unit ?? 'un'} · {new Date(r.created_at).toLocaleString('pt-BR')}
                      {r.notes ? ` · ${r.notes}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">pendente</Badge>
                  <Select
                    value={sourceById[r.id] ?? ''}
                    onValueChange={(v) => setSourceById((s) => ({ ...s, [r.id]: v }))}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Origem p/ remanejar" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies
                        .filter((c) => c.id !== r.requesting_company_id)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={decide.isPending}
                      onClick={() => decide.mutate({ requestId: r.id, decision: 'transferir_cd' })}>
                      Transferir/CD
                    </Button>
                    <Button size="sm" variant="outline" disabled={decide.isPending || !sourceById[r.id]}
                      onClick={() => decide.mutate({ requestId: r.id, decision: 'remanejar', sourceCompanyId: sourceById[r.id] })}>
                      Remanejar
                    </Button>
                    <Button size="sm" variant="outline" disabled={decide.isPending}
                      onClick={() => decide.mutate({ requestId: r.id, decision: 'produzir' })}>
                      Produzir
                    </Button>
                    <Button size="sm" variant="ghost" disabled={decide.isPending}
                      onClick={() => decide.mutate({ requestId: r.id, decision: 'rejeitar' })}>
                      Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
