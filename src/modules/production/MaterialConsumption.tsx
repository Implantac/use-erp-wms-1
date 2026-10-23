import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { ExportButton } from '@/shared/components/ExportButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Label } from '@/ui/base/label';
import { Progress } from '@/ui/base/progress';
import { useMaterialConsumptions, MaterialConsumptionRow } from '@/hooks/production/useMaterialConsumptions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PackageMinus, Search, Package, Eye, CheckCircle, AlertTriangle, MapPin, Box } from 'lucide-react';

export default function MaterialConsumptionPage() {
  const { consumptions, loading } = useMaterialConsumptions();
  const [searchTerm, setSearchTerm] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<MaterialConsumptionRow | null>(null);

  const orderNumbers = [...new Set(consumptions.map(c => c.order_number))];

  const filtered = useMemo(() => consumptions.filter(c => {
    const matchSearch = !searchTerm ||
      c.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.component_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.component_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchOrder = orderFilter === 'all' || c.order_number === orderFilter;
    return matchSearch && matchOrder;
  }), [consumptions, searchTerm, orderFilter]);

  const totalExpected = consumptions.reduce((s, c) => s + c.expected_quantity, 0);
  const totalConsumed = consumptions.reduce((s, c) => s + c.consumed_quantity, 0);
  const pendingItems = consumptions.filter(c => c.consumed_quantity < c.expected_quantity).length;
  const consumptionRate = totalExpected > 0 ? Math.round((totalConsumed / totalExpected) * 100) : 0;

  const getStatus = (c: MaterialConsumptionRow) => {
    const pct = c.expected_quantity > 0 ? (c.consumed_quantity / c.expected_quantity) * 100 : 0;
    if (pct >= 100) return { label: 'Completo', variant: 'outline' as const };
    if (pct > 0) return { label: 'Parcial', variant: 'secondary' as const };
    return { label: 'Pendente', variant: 'destructive' as const };
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Consumo de Matéria-Prima" description="Consulta do ledger de consumo gravado pela conclusão transacional da OP. Baixas manuais foram removidas: consuma pela reserva/conclusão da OP com lote, quantidade e genealogia.">
        <ExportButton
          data={filtered as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'order_number', label: 'Ordem' }, { key: 'component_code', label: 'Código' },
            { key: 'component_name', label: 'Material' }, { key: 'expected_quantity', label: 'Qtd Esperada' },
            { key: 'consumed_quantity', label: 'Qtd Consumida' }, { key: 'unit', label: 'Unidade' },
          ]}
          filename="consumo_materiais"
        />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Total Esperado" value={totalExpected} subtitle="unidades" icon={<Package className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Total Consumido" value={totalConsumed} subtitle="unidades" icon={<PackageMinus className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Taxa de Consumo" value={`${consumptionRate}%`} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={2} />
        <KPICard title="Itens Pendentes" value={pendingItems} icon={<AlertTriangle className="h-5 w-5" />} accentColor="warning" index={3} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por ordem, componente ou código..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={orderFilter} onValueChange={setOrderFilter}>
              <SelectTrigger className="w-full md:w-[220px]"><SelectValue placeholder="Ordem de Produção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Ordens</SelectItem>
                {orderNumbers.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><PackageMinus className="h-5 w-5" /> Registros de Consumo</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              icon={PackageMinus}
              title={consumptions.length === 0 ? 'Nenhum consumo registrado' : 'Nenhum registro encontrado'}
              description={consumptions.length === 0
                ? 'Nenhum consumo foi persistido pela conclusão transacional das OPs.'
                : 'Ajuste a busca ou os filtros para localizar o registro desejado.'}
              action={{ label: 'Limpar filtros', onClick: () => { setSearchTerm(''); setOrderFilter('all'); }, variant: 'outline' }}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ordem</TableHead><TableHead>Componente</TableHead><TableHead>Esperado</TableHead>
                <TableHead>Consumido</TableHead><TableHead>Progresso</TableHead><TableHead>Lote</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(c => {
                  const status = getStatus(c);
                  const progress = c.expected_quantity > 0 ? Math.round((c.consumed_quantity / c.expected_quantity) * 100) : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.order_number}</TableCell>
                      <TableCell>
                        <p className="font-medium">{c.component_name}</p>
                        <p className="text-xs text-muted-foreground">{c.component_code}</p>
                      </TableCell>
                      <TableCell>{c.expected_quantity} {c.unit}</TableCell>
                      <TableCell>{c.consumed_quantity} {c.unit}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="w-20 h-2" />
                          <span className="text-xs text-muted-foreground">{progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Box className="h-3 w-3 text-muted-foreground" />
                          {c.batch || '-'}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setSelected(c); setDetailsOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhes do Consumo</DialogTitle></DialogHeader>
          {selected && (
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-muted-foreground">Ordem de Produção</p><p className="font-medium">{selected.order_number}</p></div>
              <div><p className="text-sm text-muted-foreground">Componente</p><p className="font-medium">{selected.component_name}</p><p className="text-xs text-muted-foreground">{selected.component_code}</p></div>
              <div><p className="text-sm text-muted-foreground">Quantidade Esperada</p><p className="font-medium">{selected.expected_quantity} {selected.unit}</p></div>
              <div><p className="text-sm text-muted-foreground">Quantidade Consumida</p><p className="font-medium">{selected.consumed_quantity} {selected.unit}</p></div>
              <div><p className="text-sm text-muted-foreground">Lote</p><p className="font-medium">{selected.batch || '-'}</p></div>
              <div><p className="text-sm text-muted-foreground">Localização</p><div className="flex items-center gap-1"><MapPin className="h-3 w-3" /><p className="font-medium">{selected.location || '-'}</p></div></div>
              <div><p className="text-sm text-muted-foreground">Consumido Por</p><p className="font-medium">{selected.consumed_by || '-'}</p></div>
              <div><p className="text-sm text-muted-foreground">Data/Hora</p><p className="font-medium">{selected.consumed_at ? format(new Date(selected.consumed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}</p></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailsOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </PageContainer>
  );
}
